/*
 * Cartões e faturas. Regras (detalhes em docs/regras-financeiras.md):
 * - Internamente a fatura é identificada pelo mês em que fecha (a chave não muda, para não perder
 *   pagamentos já marcados); na tela ela leva o nome do mês do vencimento, como nos bancos.
 * - Como nos bancos, a compra feita no dia do fechamento (ou depois) já vai para a fatura seguinte.
 *   Em mês mais curto, o fechamento cai no último dia (fecha 31 → fecha 30/09, 28/02).
 * - O vencimento cai no mesmo mês do fechamento se o dia de vencimento for maior; senão, no mês seguinte.
 * - A compra no cartão conta como gasto no mês em que vence a fatura dela (competência; ver monthOf em
 *   transactions.js). Pagar a fatura não é um gasto novo: só desconta da conta escolhida.
 * - Parcelada: a 1ª parcela fica na fatura da data da compra (seguindo o fechamento) e a parcela n
 *   na fatura da compra + (n−1), sem pular nem repetir fatura (txInvoiceKey).
 * - Fatura paga em parte: o que faltou vai para a fatura seguinte ou é parcelado nas seguintes
 *   (partialPayment/carryIns). Só os juros contam como gasto novo.
 */
import {parseDate, pad2, daysInMonth, toDateKey, monthLabelOf, shiftMonthKey} from './dates.js';
import {money, sumMoney, splitAmount} from './money.js';

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
// Fatura do lançamento: num estorno, a fatura escolhida (invoiceKey); numa parcela com a data da
// compra (purchaseDate), a fatura da compra + (n−1); nos demais, pela data. A data da parcela
// (compra + n−1 meses, limitada ao último dia do mês) não serve para isso: no fim do mês ela pode
// cair no dia do fechamento e pular uma fatura (compra 30/03, fecha 31 → 30/04 já é a fatura de maio).
export function txInvoiceKey(t, card){
  if (t.invoiceKey) return t.invoiceKey;
  if (t.purchaseDate && t.installment && Number(t.installment.n) >= 1)
    return shiftMonthKey(invoiceKeyFor(t.purchaseDate, card), Number(t.installment.n) - 1);
  return invoiceKeyFor(t.date, card);
}
export function invoiceItems(list, card, key){
  return list.filter(function(t){ return isCardExpense(t, card) && txInvoiceKey(t, card) === key; })
    .sort(function(a,b){ return a.date.localeCompare(b.date); });
}
// Fatura paga em parte: invoicePayments[key] = {amount (pago), total, mode, rest, n, parcel, feeTxIds}.
// mode 'aberto': o resto (rest) vai inteiro para a fatura seguinte (rotativo).
// mode 'parcelado': o resto é dividido em n parcelas nas n faturas seguintes.
// Esse saldo não é gasto novo (as compras já contaram); só os juros (parcelas maiores que o resto
// dividido, ou encargos informados) viram lançamentos de gasto, com feeTxIds para desfazer.
export function partialPayment(card, key){
  var p = (card.invoicePayments || {})[key];
  return p && p.mode && p.rest > 0 ? p : null;
}
// Saldos de faturas anteriores que caem na fatura `key`: [{from, mode, i, n, amount}].
export function carryIns(card, key){
  var out = [], pays = card.invoicePayments || {};
  Object.keys(pays).sort().forEach(function(from){
    var p = partialPayment(card, from);
    if (!p) return;
    var n = p.mode === 'parcelado' ? Math.max(1, Number(p.n) || 1) : 1;
    var i = monthsBetween(from, key);
    if (i >= 1 && i <= n) out.push({from: from, mode: p.mode, i: i, n: n, amount: splitAmount(p.rest, n)[i - 1]});
  });
  return out;
}
function monthsBetween(a, b){
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}
export function carryTotal(card, key){ return sumMoney(carryIns(card, key), function(c){ return c.amount; }); }
// O que ainda pesa na fatura: sem as parcelas acertadas antes do cadastro (installment.settled),
// com o saldo que veio de faturas anteriores pagas em parte.
export function invoiceDueTotal(list, card, key){
  return sumMoney([sumMoney(invoiceItems(list, card, key).filter(function(t){ return !(t.installment && t.installment.settled); }), function(t){ return t.amount; }), carryTotal(card, key)]);
}
export function invoiceTotal(list, card, key){ return sumMoney([sumMoney(invoiceItems(list, card, key), function(t){ return t.amount; }), carryTotal(card, key)]); }
// Pagamentos adiantados de uma fatura que continua aberta (ou fechada, à espera do resto):
// invoiceAdvances[key] = [{id, date, amount, accountId, createdAt}]. Saem da conta escolhida e
// liberam limite; a fatura só fica "paga" quando a pessoa paga o que falta.
export function invoiceAdvances(card, key){ return ((card.invoiceAdvances || {})[key] || []).slice(); }
export function invoiceAdvanced(card, key){ return sumMoney(invoiceAdvances(card, key), function(a){ return a.amount; }); }
// Fatura marcada como paga: guarda o total que ela tinha na hora (invoicePaidDue[key] = {due, at}). Se entrar
// compra nova depois (a fatura ainda estava aberta), o que passou do total é o que volta a faltar,
// abatido do que for pago depois disso (adiantamentos feitos a partir de `at`). Faturas pagas antes
// desse registro continuam como estavam.
export function invoicePaidSnapshot(card, key){
  var p = (card.invoicePaidDue || {})[key];
  return (card.paidInvoices || []).indexOf(key) >= 0 && p && isFinite(Number(p.due)) ? p : null;
}
export function invoiceExtraAfterPaid(list, card, key){
  var p = invoicePaidSnapshot(card, key);
  if (!p) return 0;
  var later = sumMoney(invoiceAdvances(card, key).filter(function(a){ return Number(a.createdAt) >= Number(p.at); }), function(a){ return a.amount; });
  return money(Math.max(0, invoiceDueTotal(list, card, key) - Number(p.due) - later));
}
// O que ainda falta pagar da fatura (nunca negativo).
export function invoiceLeft(list, card, key){
  if (invoicePaidSnapshot(card, key)) return invoiceExtraAfterPaid(list, card, key);
  return money(Math.max(0, invoiceDueTotal(list, card, key) - invoiceAdvanced(card, key)));
}
// Faturas que têm algo: compras ou saldo vindo de faturas anteriores.
export function invoiceKeys(list, card){
  var keys = {};
  list.forEach(function(t){ if (isCardExpense(t, card)) keys[txInvoiceKey(t, card)] = true; });
  Object.keys(card.invoicePayments || {}).forEach(function(from){
    var p = partialPayment(card, from);
    if (!p) return;
    var n = p.mode === 'parcelado' ? Math.max(1, Number(p.n) || 1) : 1;
    for (var i = 1; i <= n; i++) keys[shiftMonthKey(from, i)] = true;
  });
  return Object.keys(keys).sort();
}
// `list` (opcional): com os lançamentos, uma fatura que já fechou e foi toda paga por adiantamentos
// (nada mais a pagar) conta como paga; se chegar compra nova antes de fechar, volta a ter o que pagar.
export function invoiceStatus(card, key, today, list){
  if ((card.paidInvoices || []).indexOf(key) >= 0 && !(list && invoiceExtraAfterPaid(list, card, key) > 0.004)) return 'paga';
  var d = invoiceDates(key, card);
  if (list && today >= d.closing && invoiceAdvanced(card, key) > 0 && invoiceDueTotal(list, card, key) > 0 && invoiceLeft(list, card, key) <= 0.004) return 'paga';
  if (today > d.due) return 'vencida';
  if (today >= d.closing) return 'fechada'; // no dia do fechamento ela já não recebe compras
  return 'aberta';
}
// Limite usado = o que falta pagar das faturas ainda não pagas (inclui parcelas futuras, que já
// ocupam o limite; o que foi adiantado libera limite).
export function cardUsed(list, card, today){
  return sumMoney(invoiceKeys(list, card).filter(function(key){ return invoiceStatus(card, key, today, list) !== 'paga'; }), function(key){
    return invoiceLeft(list, card, key);
  });
}

// Faturas que já fecharam e não foram marcadas como pagas (o valor não muda mais), da mais antiga
// para a mais nova, e a fatura aberta de cada cartão (ainda recebendo compras).
export function invoicesSummary(list, cards, today){
  var toPay = [], open = [];
  cards.forEach(function(card){
    invoiceKeys(list, card).forEach(function(key){
      var status = invoiceStatus(card, key, today, list);
      var total = invoiceDueTotal(list, card, key);
      if (!(total > 0) || status === 'paga') return;
      var paid = invoicePaidSnapshot(card, key) ? money(Math.max(0, total - invoiceLeft(list, card, key))) : invoiceAdvanced(card, key);
      var item = {card: card, key: key, total: total, paid: paid, left: money(Math.max(0, total - paid)), due: invoiceDates(key, card).due, status: status};
      if (status === 'fechada' || status === 'vencida') toPay.push(item);
      else if (key === invoiceKeyFor(today, card)) open.push(item);
    });
  });
  toPay.sort(function(a, b){ return a.due.localeCompare(b.due); });
  function total(l, f){ return sumMoney(l, function(i){ return i[f]; }); }
  // *Total: valor das faturas; *Left: o que ainda falta pagar delas (sem o que foi adiantado).
  return {toPay: toPay, open: open, toPayTotal: total(toPay, 'total'), openTotal: total(open, 'total'),
    toPayLeft: total(toPay, 'left'), openLeft: total(open, 'left'), toPayPaid: total(toPay, 'paid'), openPaid: total(open, 'paid')};
}
