/*
 * Contas bancárias: {id, name, initialBalance, baseDate, baseAt}.
 * O saldo parte do valor informado no cadastro (ou no último ajuste) e soma só o que aconteceu
 * depois dele: ganhos e gastos ligados à conta, transferências e faturas pagas com ela.
 * Lançamentos com data futura só entram quando a data chega.
 */
import {monthLabelOf} from './dates.js';
import {money, sumMoney} from './money.js';
import {findById} from './util.js';

export function afterBase(a, date, createdAt){ return date > a.baseDate || (date === a.baseDate && (createdAt || 0) > (a.baseAt || 0)); }
export function accountName(accounts, id){ var a = findById(accounts, id); return a ? a.name : 'conta excluída'; }

// data: {transactions, transfers, cards, accounts}. txLabel(t) dá o nome do lançamento.
export function accountMoves(a, data, today, txLabel){
  var out = [];
  function add(date, createdAt, amount, label, kind, extra){
    if (date > today || !afterBase(a, date, createdAt)) return;
    out.push(Object.assign({date: date, createdAt: createdAt || 0, amount: money(amount), label: label, kind: kind}, extra || {}));
  }
  data.transactions.forEach(function(t){
    if (t.accountId !== a.id) return;
    if (t.type === 'income') add(t.date, t.createdAt, Number(t.amount), txLabel(t), 'Ganho');
    else if (t.type === 'expense' && t.paymentMethod === 'conta') add(t.date, t.createdAt, -Number(t.amount), txLabel(t), 'Gasto');
  });
  data.transfers.forEach(function(x){
    var note = x.description ? ' · ' + x.description : '';
    if (x.fromId === a.id) add(x.date, x.createdAt, -Number(x.amount), 'Para ' + accountName(data.accounts, x.toId) + note, 'Transferência', {transferId: x.id});
    if (x.toId === a.id) add(x.date, x.createdAt, Number(x.amount), 'De ' + accountName(data.accounts, x.fromId) + note, 'Transferência', {transferId: x.id});
  });
  data.cards.forEach(function(c){
    var pays = c.invoicePayments || {};
    Object.keys(pays).forEach(function(key){
      var p = pays[key];
      if (p.accountId === a.id) add(p.date, p.createdAt, -Number(p.amount), 'Fatura ' + c.name + ' de ' + monthLabelOf(key), 'Pagamento de fatura');
    });
  });
  return out.sort(function(x, y){ return y.date.localeCompare(x.date) || y.createdAt - x.createdAt; });
}
export function accountBalance(a, data, today, txLabel){
  return money(Number(a.initialBalance || 0) + sumMoney(accountMoves(a, data, today, txLabel), function(m){ return m.amount; }));
}
