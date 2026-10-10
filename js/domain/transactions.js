/*
 * Lançamentos: {id, type: 'income'|'expense', amount, category, date, description,
 * paymentMethod: 'conta'|'cartao'|'vale'|null, accountId?, cardId?, voucherId?, installment?, createdAt}.
 */
import {monthKeyOf, addMonthsIso, monthsBetween} from './dates.js';
import {money, sumMoney, splitAmount} from './money.js';
import {findById} from './util.js';

export var MAX_INSTALLMENTS = 24;
export function clampInstall(v){ var n = Math.round(Number(v)); return n >= 1 ? Math.min(MAX_INSTALLMENTS, n) : 1; }

export function sortTransactions(list){
  return list.sort(function(a,b){ return (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0); });
}
// Gasto pago por outra pessoa, que vai devolver (forOther: {person, receivableId}): o dinheiro saiu
// da conta ou do cartão, mas não é gasto seu. A devolução (refund) volta para a conta, mas não é ganho.
// Assim o mesmo dinheiro não conta duas vezes. Se a pessoa não devolver, um lançamento à parte
// ("não devolvido") passa a contar como gasto seu.
export function isForOther(t){ return t.type === 'expense' && !!t.forOther; }
export function isRefund(t){ return t.type === 'income' && !!t.refund; }
// outsideTotals: movimento só de saldo (ex.: pagamento de dívida que você pediu para não contar como gasto).
// Estorno: crédito (valor negativo) ligado à compra original em reversal.of.
export function isReversal(t){ return !!t.reversal; }
export function reversalsOf(list, id){ return list.filter(function(t){ return t.reversal && t.reversal.of === id; }); }
export function isPersonal(t){ return !isForOther(t) && !isRefund(t) && !t.outsideTotals; }

export function txForMonth(list, key){ return list.filter(function(t){ return monthKeyOf(t.date) === key; }); }

// Realizado = data até hoje; agendado = data futura dentro do mês (ex.: parcela que ainda vai cair).
export function monthTotals(list, key, today){
  var all = txForMonth(list, key), tx = all.filter(isPersonal);
  function total(type, when){
    return sumMoney(tx.filter(function(t){ return t.type === type && (!when || (when === 'done' ? t.date <= today : t.date > today)); }), function(t){ return t.amount; });
  }
  var income = total('income'), expense = total('expense');
  var out = {income: income, expense: expense, saldo: money(income - expense),
    forOther: sumMoney(all.filter(function(t){ return isForOther(t) && (!today || t.date <= today); }), function(t){ return t.amount; })};
  if (today){
    out.incomeDone = total('income', 'done'); out.expenseDone = total('expense', 'done');
    out.incomeScheduled = total('income', 'later'); out.expenseScheduled = total('expense', 'later');
  }
  return out;
}
export function expenseCategoryTotals(list, key){
  var out = {};
  txForMonth(list, key).filter(function(t){ return t.type === 'expense' && isPersonal(t); }).forEach(function(t){
    out[t.category] = money((out[t.category] || 0) + Number(t.amount || 0));
  });
  return out;
}
// Até quantos meses à frente existem lançamentos (parcelas futuras).
export function maxMonthOffset(list, curKey){
  var max = 0;
  list.forEach(function(t){ var d = monthsBetween(curKey, monthKeyOf(t.date)); if (d > max) max = d; });
  return max;
}

// Divide uma compra no cartão em N lançamentos, um por mês. Os centavos que sobram ficam na 1ª parcela.
// name: descrição base das parcelas (a descrição digitada ou o nome da categoria).
// start: parcela atual de uma compra que já estava em andamento (ex.: 7 de 18). As anteriores foram
// pagas antes do cadastro e não viram lançamento; a parcela atual cai na data informada.
export function expandInstallments(tx, n, group, name, start){
  if (!(n > 1) || tx.paymentMethod !== 'cartao') return [tx];
  start = clampStart(start, n);
  var parts = splitAmount(tx.amount, n), out = [];
  for (var i = start; i <= n; i++){
    var inst = {group: group, n: i, total: n, totalAmount: tx.amount, baseDescription: name};
    if (start > 1) inst.start = start;
    out.push(Object.assign({}, tx, {
      amount: parts[i-1],
      date: addMonthsIso(tx.date, i - start),
      description: name + ' (' + i + '/' + n + ')',
      installment: inst,
      createdAt: tx.createdAt + (i - start)
    }));
  }
  return out;
}
export function clampStart(start, n){ var s = Math.round(Number(start)); return s >= 1 ? Math.min(n, s) : 1; }
// Valor total da compra a partir do que foi digitado: o total, ou o valor de cada parcela × N.
export function purchaseTotal(typed, n, perInstallment){ return perInstallment && n > 1 ? money(typed * n) : money(typed); }
export function installHint(n, amount, fmt, start){
  if (n <= 1) return 'À vista';
  if (!(amount > 0)) return n + ' parcelas';
  var parts = splitAmount(amount, n);
  var out = n + 'x de ' + fmt(parts[n-1]) + ' · total ' + fmt(amount);
  start = clampStart(start, n);
  if (start > 1){
    var left = n - start + 1;
    out += ' · começa na ' + start + 'ª: ' + (left === 1 ? 'falta 1' : 'faltam ' + left) + ' (' + fmt(sumMoney(parts.slice(start - 1), function(v){ return v; })) + ')';
  }
  return out;
}

// Agrupa as parcelas de cada compra. "Pagas" = parcelas com data até hoje (já entraram em fatura).
// Parcelas adiantadas saem da lista e contam em "advanced"; as pagas antes do cadastro, em "before".
export function installmentGroups(list, cards, today){
  var map = {};
  list.forEach(function(t){
    if (!t.installment) return;
    var g = map[t.installment.group];
    if (!g) g = map[t.installment.group] = {id: t.installment.group, name: t.installment.baseDescription, total: t.installment.total,
      totalAmount: Number(t.installment.totalAmount), cardId: t.cardId, category: t.category, items: []};
    g.items.push(t);
  });
  return Object.keys(map).map(function(key){
    var g = map[key];
    g.items.sort(function(a,b){ return a.installment.n - b.installment.n; });
    g.paid = g.items.filter(function(t){ return t.date <= today; });
    g.future = g.items.filter(function(t){ return t.date > today; });
    g.before = Math.max(0, (Number(g.items.length && g.items[0].installment.start) || 1) - 1);
    g.advanced = Math.max(0, g.total - g.items.length - g.before);
    g.done = g.paid.length + g.advanced + g.before;
    g.remaining = sumMoney(g.future, function(t){ return t.amount; });
    g.perInstallment = g.items.length ? g.items[g.items.length-1].amount : 0;
    g.lastDate = g.items.length ? g.items[g.items.length-1].date : '';
    g.card = findById(cards, g.cardId);
    return g;
  }).sort(function(a,b){ return a.lastDate.localeCompare(b.lastDate); });
}
