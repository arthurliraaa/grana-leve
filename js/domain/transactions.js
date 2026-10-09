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
export function txForMonth(list, key){ return list.filter(function(t){ return monthKeyOf(t.date) === key; }); }

// Realizado = data até hoje; agendado = data futura dentro do mês (ex.: parcela que ainda vai cair).
export function monthTotals(list, key, today){
  var tx = txForMonth(list, key);
  function total(type, when){
    return sumMoney(tx.filter(function(t){ return t.type === type && (!when || (when === 'done' ? t.date <= today : t.date > today)); }), function(t){ return t.amount; });
  }
  var income = total('income'), expense = total('expense');
  var out = {income: income, expense: expense, saldo: money(income - expense)};
  if (today){
    out.incomeDone = total('income', 'done'); out.expenseDone = total('expense', 'done');
    out.incomeScheduled = total('income', 'later'); out.expenseScheduled = total('expense', 'later');
  }
  return out;
}
export function expenseCategoryTotals(list, key){
  var out = {};
  txForMonth(list, key).filter(function(t){ return t.type === 'expense'; }).forEach(function(t){
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
export function expandInstallments(tx, n, group, name){
  if (!(n > 1) || tx.paymentMethod !== 'cartao') return [tx];
  return splitAmount(tx.amount, n).map(function(amount, i){
    return Object.assign({}, tx, {
      amount: amount,
      date: addMonthsIso(tx.date, i),
      description: name + ' (' + (i+1) + '/' + n + ')',
      installment: {group: group, n: i+1, total: n, totalAmount: tx.amount, baseDescription: name},
      createdAt: tx.createdAt + i
    });
  });
}
export function installHint(n, amount, fmt){
  if (n <= 1) return 'À vista';
  if (!(amount > 0)) return n + ' parcelas';
  var parts = splitAmount(amount, n);
  return n + 'x de ' + fmt(parts[n-1]) + ' · total ' + fmt(amount);
}

// Agrupa as parcelas de cada compra. "Pagas" = parcelas com data até hoje (já entraram em fatura).
// Parcelas adiantadas saem da lista e contam em "advanced".
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
    g.advanced = g.total - g.items.length;
    g.remaining = sumMoney(g.future, function(t){ return t.amount; });
    g.perInstallment = g.items.length ? g.items[g.items.length-1].amount : 0;
    g.lastDate = g.items.length ? g.items[g.items.length-1].date : '';
    g.card = findById(cards, g.cardId);
    return g;
  }).sort(function(a,b){ return a.lastDate.localeCompare(b.lastDate); });
}
