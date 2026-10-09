/*
 * Cartões e faturas. Regras (detalhes em docs/regras-financeiras.md):
 * - A fatura é identificada pelo mês em que fecha. Compra feita depois do dia de fechamento vai para a seguinte.
 * - O vencimento cai no mesmo mês do fechamento se o dia de vencimento for maior; senão, no mês seguinte.
 * - A compra conta como gasto na data da compra. Pagar a fatura não é um gasto novo: só desconta da conta escolhida.
 */
import {parseDate, pad2, daysInMonth, toDateKey} from './dates.js';
import {sumMoney} from './money.js';

export function invoiceKeyFor(dateStr, card){
  var d = parseDate(dateStr);
  var m = d.getMonth() + (d.getDate() > Number(card.closingDay) ? 1 : 0);
  var x = new Date(d.getFullYear(), m, 1);
  return x.getFullYear() + '-' + pad2(x.getMonth()+1);
}
export function invoiceDates(key, card){
  var y = Number(key.slice(0,4)), m = Number(key.slice(5,7)) - 1;
  var closing = new Date(y, m, Math.min(Number(card.closingDay), daysInMonth(y, m)));
  var dueMonth = Number(card.dueDay) > Number(card.closingDay) ? m : m + 1;
  var dm = new Date(y, dueMonth, 1);
  var due = new Date(dm.getFullYear(), dm.getMonth(), Math.min(Number(card.dueDay), daysInMonth(dm.getFullYear(), dm.getMonth())));
  return {closing: toDateKey(closing), due: toDateKey(due)};
}
export function isCardExpense(t, card){ return t.type === 'expense' && t.paymentMethod === 'cartao' && t.cardId === card.id; }
export function invoiceItems(list, card, key){
  return list.filter(function(t){ return isCardExpense(t, card) && invoiceKeyFor(t.date, card) === key; })
    .sort(function(a,b){ return a.date.localeCompare(b.date); });
}
export function invoiceTotal(list, card, key){ return sumMoney(invoiceItems(list, card, key), function(t){ return t.amount; }); }
export function invoiceStatus(card, key, today){
  if ((card.paidInvoices || []).indexOf(key) >= 0) return 'paga';
  var d = invoiceDates(key, card);
  if (today > d.due) return 'vencida';
  if (today > d.closing) return 'fechada';
  return 'aberta';
}
// Limite usado = soma das faturas ainda não pagas (inclui parcelas futuras, que já ocupam o limite).
export function cardUsed(list, card, today){
  var keys = {};
  list.forEach(function(t){ if (isCardExpense(t, card)) keys[invoiceKeyFor(t.date, card)] = true; });
  return sumMoney(Object.keys(keys).filter(function(key){ return invoiceStatus(card, key, today) !== 'paga'; }), function(key){
    return invoiceTotal(list, card, key);
  });
}

// Faturas que já fecharam e não foram marcadas como pagas (o valor não muda mais), da mais antiga
// para a mais nova, e a fatura aberta de cada cartão (ainda recebendo compras).
export function invoicesSummary(list, cards, today){
  var toPay = [], open = [];
  cards.forEach(function(card){
    var keys = {};
    list.forEach(function(t){ if (isCardExpense(t, card)) keys[invoiceKeyFor(t.date, card)] = true; });
    Object.keys(keys).sort().forEach(function(key){
      var status = invoiceStatus(card, key, today);
      var total = invoiceTotal(list, card, key);
      if (!(total > 0) || status === 'paga') return;
      var item = {card: card, key: key, total: total, due: invoiceDates(key, card).due, status: status};
      if (status === 'fechada' || status === 'vencida') toPay.push(item);
      else if (key === invoiceKeyFor(today, card)) open.push(item);
    });
  });
  toPay.sort(function(a, b){ return a.due.localeCompare(b.due); });
  return {toPay: toPay, open: open, toPayTotal: sumMoney(toPay, function(i){ return i.total; }), openTotal: sumMoney(open, function(i){ return i.total; })};
}
