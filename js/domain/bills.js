/*
 * Contas fixas e recorrentes (água, luz, internet, aluguel, assinaturas…).
 * {id, name, category, amount, every (meses: 1, 2, 3, 6, 12), dueDay, startMonth 'AAAA-MM', endMonth?,
 *  pay (forma de pagamento: 'acc:id', 'card:id', 'vale:id', 'conta'), amounts?: [{from: 'AAAA-MM', amount}],
 *  paid?: {'AAAA-MM': {txId, amount, date}}}
 * Os vencimentos de cada mês são calculados (não ficam gravados); pagar cria um gasto ligado ao mês.
 */
import {monthsBetween, daysInMonth, pad2} from './dates.js';
import {money, sumMoney} from './money.js';

export var BILL_FREQS = [
  {id: '1', label: 'Todo mês'}, {id: '2', label: 'A cada 2 meses'}, {id: '3', label: 'A cada 3 meses'},
  {id: '6', label: 'A cada 6 meses'}, {id: '12', label: 'Uma vez por ano'}
];

// Valor do mês: o último valor definido até aquele mês (mudar o valor vale "a partir de").
export function billAmountFor(b, key){
  /** @type {any} */
  var best = null;
  (b.amounts || []).forEach(function(a){ if (a.from <= key && (!best || a.from >= best.from)) best = a; });
  return money(best ? best.amount : b.amount);
}
export function billOccurs(b, key){
  if (!b.startMonth || key < b.startMonth || (b.endMonth && key > b.endMonth)) return false;
  return monthsBetween(b.startMonth, key) % (Number(b.every) || 1) === 0;
}
export function billDueDate(b, key){
  var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1;
  return key + '-' + pad2(Math.min(Number(b.dueDay) || 1, daysInMonth(y, m)));
}
// Situação de um vencimento: paga, atrasada, vence em até 5 dias ("logo") ou em aberto.
export function billStatus(occ, today){
  if (occ.paid) return 'paga';
  if (occ.date < today) return 'atrasada';
  var d = (Date.parse(occ.date) - Date.parse(today)) / 86400000;
  return d <= 5 ? 'logo' : 'aberta';
}
// paidOk(b, key): confirma que o pagamento ainda existe (o gasto pode ter sido excluído).
export function billOccurrences(bills, key, today, paidOk){
  return bills.filter(function(b){ return billOccurs(b, key); }).map(function(b){
    var p = (b.paid || {})[key];
    if (p && paidOk && !paidOk(b, p)) p = null;
    var occ = {b: b, key: key, date: billDueDate(b, key), amount: p ? money(p.amount) : billAmountFor(b, key), paid: p || null};
    occ.status = billStatus(occ, today);
    return occ;
  }).sort(function(a, b){ return a.date.localeCompare(b.date); });
}
export function billsMonthSummary(occs){
  var paid = occs.filter(function(o){ return o.paid; });
  return {count: occs.length, total: sumMoney(occs, function(o){ return o.amount; }), paid: sumMoney(paid, function(o){ return o.amount; }),
    pending: sumMoney(occs.filter(function(o){ return !o.paid; }), function(o){ return o.amount; }), late: occs.filter(function(o){ return o.status === 'atrasada'; }).length};
}
// Próximo vencimento a partir do mês informado (até 2 anos à frente).
export function billNext(b, fromKey, shift){
  for (var i = 0; i < 25; i++){
    var key = shift(fromKey, i);
    if (billOccurs(b, key) && !(b.paid || {})[key]) return {key: key, date: billDueDate(b, key), amount: billAmountFor(b, key)};
  }
  return null;
}
