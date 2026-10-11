/*
 * Cartões e faturas. Regras (detalhes em docs/regras-financeiras.md):
 * - Internamente a fatura é identificada pelo mês em que fecha (a chave não muda, para não perder
 *   pagamentos já marcados); na tela ela leva o nome do mês do vencimento, como nos bancos.
 * - Como nos bancos, a compra feita no dia do fechamento (ou depois) já vai para a fatura seguinte.
 *   Em mês mais curto, o fechamento cai no último dia (fecha 31 → fecha 30/09, 28/02).
 * - O vencimento cai no mesmo mês do fechamento se o dia de vencimento for maior; senão, no mês seguinte.
 * - A compra conta como gasto na data da compra. Pagar a fatura não é um gasto novo: só desconta da conta escolhida.
 */
import {parseDate, pad2, daysInMonth, toDateKey, monthLabelOf, shiftMonthKey} from './dates.js';
import {sumMoney} from './money.js';

export function invoiceKeyFor(dateStr, card){
  var d = parseDate(dateStr);
  var closing = Math.min(Number(card.closingDay), daysInMonth(d.getFullYear(), d.getMonth()));
  var m = d.getMonth() + (d.getDate() >= closing ? 1 : 0);
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
// Nome da fatura na tela: o mês do vencimento ("fecha 31/10, vence 07/11" = fatura de novembro).
export function invoiceLabel(key, card){
  var due = invoiceDates(key, card).due;
  return monthLabelOf(due.slice(0, 7));
}
// Fatura em que entra uma compra feita em `date`: {key, closing, due, label}.
export function invoiceFor(date, card){
  var key = invoiceKeyFor(date, card), d = invoiceDates(key, card);
  return {key: key, closing: d.closing, due: d.due, label: invoiceLabel(key, card)};
}
// Compra parcelada feita em `date`: a parcela i cai na i-ésima fatura a partir da fatura da compra.
// As parcelas de faturas que já venceram (vencimento antes de hoje) contam como pagas. Devolve a
// primeira parcela ainda a pagar (1..n), ou n+1 se todas já venceram.
export function firstDueInstallment(date, n, card, today){
  var key = invoiceKeyFor(date, card);
  for (var i = 1; i <= n; i++){
    if (invoiceDates(key, card).due >= today) return i;
    key = shiftMonthKey(key, 1);
  }
  return n + 1;
}
export function isCardExpense(t, card){ return t.type === 'expense' && t.paymentMethod === 'cartao' && t.cardId === card.id; }
// Fatura do lançamento: pela data ou, num estorno, a fatura escolhida (invoiceKey).
export function txInvoiceKey(t, card){ return t.invoiceKey || invoiceKeyFor(t.date, card); }
export function invoiceItems(list, card, key){
  return list.filter(function(t){ return isCardExpense(t, card) && txInvoiceKey(t, card) === key; })
    .sort(function(a,b){ return a.date.localeCompare(b.date); });
}
// O que ainda pesa na fatura: sem as parcelas acertadas antes do cadastro (installment.settled).
export function invoiceDueTotal(list, card, key){
  return sumMoney(invoiceItems(list, card, key).filter(function(t){ return !(t.installment && t.installment.settled); }), function(t){ return t.amount; });
}
export function invoiceTotal(list, card, key){ return sumMoney(invoiceItems(list, card, key), function(t){ return t.amount; }); }
export function invoiceStatus(card, key, today){
  if ((card.paidInvoices || []).indexOf(key) >= 0) return 'paga';
  var d = invoiceDates(key, card);
  if (today > d.due) return 'vencida';
  if (today >= d.closing) return 'fechada'; // no dia do fechamento ela já não recebe compras
  return 'aberta';
}
// Limite usado = soma das faturas ainda não pagas (inclui parcelas futuras, que já ocupam o limite).
export function cardUsed(list, card, today){
  var keys = {};
  list.forEach(function(t){ if (isCardExpense(t, card)) keys[txInvoiceKey(t, card)] = true; });
  return sumMoney(Object.keys(keys).filter(function(key){ return invoiceStatus(card, key, today) !== 'paga'; }), function(key){
    return invoiceDueTotal(list, card, key);
  });
}

// Faturas que já fecharam e não foram marcadas como pagas (o valor não muda mais), da mais antiga
// para a mais nova, e a fatura aberta de cada cartão (ainda recebendo compras).
export function invoicesSummary(list, cards, today){
  var toPay = [], open = [];
  cards.forEach(function(card){
    var keys = {};
    list.forEach(function(t){ if (isCardExpense(t, card)) keys[txInvoiceKey(t, card)] = true; });
    Object.keys(keys).sort().forEach(function(key){
      var status = invoiceStatus(card, key, today);
      var total = invoiceDueTotal(list, card, key);
      if (!(total > 0) || status === 'paga') return;
      var item = {card: card, key: key, total: total, due: invoiceDates(key, card).due, status: status};
      if (status === 'fechada' || status === 'vencida') toPay.push(item);
      else if (key === invoiceKeyFor(today, card)) open.push(item);
    });
  });
  toPay.sort(function(a, b){ return a.due.localeCompare(b.due); });
  return {toPay: toPay, open: open, toPayTotal: sumMoney(toPay, function(i){ return i.total; }), openTotal: sumMoney(open, function(i){ return i.total; })};
}
