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
// Compra dividida (split: {total, mine, people: [{person, receivableId, amount}]}): só a sua parte é
// gasto seu. Numa parcela, a parte é proporcional ao valor dela.
export function myShare(t){
  if (!isPersonal(t)) return 0;
  if (t.split && Number(t.split.total) > 0) return money(Number(t.amount) * Number(t.split.mine) / Number(t.split.total));
  return Number(t.amount) || 0;
}
// Quanto do gasto é de outras pessoas (pago por elas ou a parte delas numa compra dividida).
export function othersShare(t){
  if (t.type !== 'expense') return 0;
  if (isForOther(t)) return Number(t.amount) || 0;
  return t.split ? money(Number(t.amount) - myShare(t)) : 0;
}
// Divide o total entre as pessoas: valores em R$ ou em % do total. Devolve a parte de cada uma e a sua.
export function splitShares(total, entries, percent){
  var people = entries.map(function(e){ return {person: e.person, amount: money(percent ? total * Number(e.value) / 100 : Number(e.value))}; });
  var others = sumMoney(people, function(p){ return p.amount; });
  return {people: people, others: others, mine: money(total - others)};
}

// Mês em que o lançamento conta (competência). Padrão: o mês da data. O app registra um "resolvedor"
// que, para compras no cartão, devolve o mês em que vence a fatura daquela parcela (compra de 04/10
// com fatura vencendo em novembro conta em novembro). Sem resolvedor (ex.: testes), vale a data.
var monthResolver = null;
export function setMonthResolver(fn){ monthResolver = fn; }
export function monthOf(t){ return (monthResolver && monthResolver(t)) || monthKeyOf(t.date); }
export function txForMonth(list, key){ return list.filter(function(t){ return monthOf(t) === key; }); }

// Realizado = data até hoje; agendado = data futura dentro do mês (ex.: parcela que ainda vai cair).
export function monthTotals(list, key, today){
  var all = txForMonth(list, key), tx = all.filter(isPersonal);
  function total(type, when){
    return sumMoney(tx.filter(function(t){ return t.type === type && (!when || (when === 'done' ? t.date <= today : t.date > today)); }), myShare);
  }
  var income = total('income'), expense = total('expense');
  var out = {income: income, expense: expense, saldo: money(income - expense),
    forOther: sumMoney(all.filter(function(t){ return !today || t.date <= today; }), othersShare)};
  if (today){
    out.incomeDone = total('income', 'done'); out.expenseDone = total('expense', 'done');
    out.incomeScheduled = total('income', 'later'); out.expenseScheduled = total('expense', 'later');
  }
  return out;
}
// Quanto do mês é de outras pessoas (pago por elas ou a parte delas nas compras divididas), com a data que for.
// "Não vai devolver" vira gasto seu (writeOff) sem sair mais dinheiro: a parte já estava no que
// outras pessoas pagaram, então sai dessa conta para o total não contar duas vezes.
export function monthOthers(list, key, today){
  var all = txForMonth(list, key).filter(function(t){ return !today || t.date <= today; });
  var off = sumMoney(all.filter(function(t){ return t.type === 'expense' && t.writeOff && !t.reversal; }), function(t){ return t.amount; });
  return money(Math.max(0, sumMoney(all, othersShare) - off));
}
// Gastos por categoria contando tudo o que saiu, inclusive a parte de outras pessoas (all = true).
export function expenseCategoryTotals(list, key, all){
  var out = {};
  txForMonth(list, key).filter(function(t){ return t.type === 'expense' && (isPersonal(t) || (all && isForOther(t))); }).forEach(function(t){
    out[t.category] = money((out[t.category] || 0) + (all ? (Number(t.amount) || 0) : myShare(t)));
  });
  return out;
}
// Até quantos meses à frente existem lançamentos (parcelas futuras).
export function maxMonthOffset(list, curKey){
  var max = 0;
  list.forEach(function(t){ var d = monthsBetween(curKey, monthOf(t)); if (d > max) max = d; });
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
// Compra feita em tx.date: a parcela i cai i-1 meses depois. Todas viram lançamentos (a compra fica
// no histórico do mês em que foi feita); as anteriores a `start` caíram em faturas que já venceram
// antes do cadastro e ficam marcadas como acertadas (installment.settled): contam no histórico, mas
// não como fatura a pagar nem no limite usado. Guarda a data da compra (purchaseDate).
export function expandPurchase(tx, n, group, name, start){
  if (!(n > 1) || tx.paymentMethod !== 'cartao') return [tx];
  start = Math.max(1, Math.round(Number(start) || 1));
  return expandInstallments(Object.assign({}, tx, {purchaseDate: tx.date}), n, group, name, 1).map(function(t){
    if (t.installment.n < start) t.installment = Object.assign({}, t.installment, {settled: true});
    return t;
  });
}
// Parcela que venceu antes do cadastro (já acertada).
export function isSettled(t){ return !!(t.installment && t.installment.settled); }
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
    out += ' · ' + (start === 2 ? 'a 1ª parcela já venceu' : 'as parcelas 1 a ' + (start - 1) + ' já venceram') + ' (contam como pagas) · ' +
      (left === 1 ? 'falta 1' : 'faltam ' + left) + ' (' + fmt(sumMoney(parts.slice(start - 1), function(v){ return v; })) + ')';
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
    // before: parcelas acertadas antes do cadastro (marcadas, ou que nem viraram lançamento nas
    // compras cadastradas com "parcela atual"); advanced: adiantadas (saíram da lista).
    var legacy = Math.max(0, (Number(g.items.length && g.items[0].installment.start) || 1) - 1);
    g.settled = g.items.filter(isSettled);
    g.paid = g.items.filter(function(t){ return t.date <= today && !isSettled(t); });
    g.future = g.items.filter(function(t){ return t.date > today && !isSettled(t); });
    g.before = legacy + g.settled.length;
    g.advanced = Math.max(0, g.total - g.items.length - legacy);
    g.done = g.paid.length + g.advanced + g.before;
    g.remaining = sumMoney(g.future, function(t){ return t.amount; });
    g.perInstallment = g.items.length ? g.items[g.items.length-1].amount : 0;
    g.lastDate = g.items.length ? g.items[g.items.length-1].date : '';
    g.card = findById(cards, g.cardId);
    return g;
  }).sort(function(a,b){ return a.lastDate.localeCompare(b.lastDate); });
}
