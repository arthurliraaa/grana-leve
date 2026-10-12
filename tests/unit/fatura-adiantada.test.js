import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceAdvanced, invoiceLeft, cardUsed, invoicesSummary, invoiceDueTotal} from '../../js/domain/cards.js';
import {accountBalance} from '../../js/domain/accounts.js';

const buy = (id, date, amount) => ({id, type: 'expense', amount, category: 'compras', date, paymentMethod: 'cartao', cardId: 'c1', createdAt: 1});
const list = [buy('a', '2026-10-05', 120), buy('b', '2026-09-10', 360)];
const card = () => ({id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10, limit: 5000, paidInvoices: [],
  invoiceAdvances: {'2026-11': [{id: 'x', date: '2026-10-08', amount: 50, accountId: 'a1', createdAt: 2}]}});

test('fatura com pagamento adiantado: falta = total − adiantado, nunca negativo', () => {
  const c = card();
  assert.equal(invoiceDueTotal(list, c, '2026-11'), 120);
  assert.equal(invoiceAdvanced(c, '2026-11'), 50);
  assert.equal(invoiceLeft(list, c, '2026-11'), 70);
  assert.equal(invoiceLeft(list, c, '2026-10'), 360, 'outra fatura não muda');
  c.invoiceAdvances['2026-11'].push({id: 'y', date: '2026-10-09', amount: 100, accountId: null, createdAt: 3});
  assert.equal(invoiceLeft(list, c, '2026-11'), 0);
});

test('adiantado libera limite e o resumo separa total, pago e o que falta', () => {
  const c = card();
  assert.equal(cardUsed(list, c, '2026-10-12'), 360 + 70);
  const s = invoicesSummary(list, [c], '2026-10-12');
  assert.equal(s.openTotal, 120); assert.equal(s.openPaid, 50); assert.equal(s.openLeft, 70);
  assert.equal(s.toPayTotal, 360); assert.equal(s.toPayLeft, 360);
});

test('o adiantado sai do saldo da conta escolhida, só depois da data', () => {
  const a = {id: 'a1', name: 'Nubank', initialBalance: 1600, baseDate: '2026-01-01', baseAt: 0};
  const data = {transactions: [], transfers: [], cards: [card()], accounts: [a]};
  assert.equal(accountBalance(a, data, '2026-10-07', t => t.description), 1600);
  assert.equal(accountBalance(a, data, '2026-10-12', t => t.description), 1550);
});
