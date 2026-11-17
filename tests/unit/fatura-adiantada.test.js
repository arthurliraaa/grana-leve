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

test('fatura paga ainda aberta: compra nova depois do pagamento volta a faltar (e só ela)', async () => {
  const {invoiceStatus, invoiceExtraAfterPaid} = await import('../../js/domain/cards.js');
  const l = [buy('a', '2026-10-05', 120)];
  const c = {id: 'c1', name: 'Nubank', closingDay: 20, dueDay: 28, limit: 5000, paidInvoices: ['2026-10'], invoicePaidDue: {'2026-10': {due: 120, at: 1000}}};
  const today = '2026-10-10';
  assert.equal(invoiceStatus(c, '2026-10', today, l), 'paga', 'sem compra nova, continua paga');
  assert.equal(invoiceLeft(l, c, '2026-10'), 0);
  l.push(buy('b', '2026-10-12', 80));
  assert.equal(invoiceExtraAfterPaid(l, c, '2026-10'), 80);
  assert.equal(invoiceStatus(c, '2026-10', '2026-10-13', l), 'aberta', 'volta a ter algo a pagar');
  assert.equal(invoiceLeft(l, c, '2026-10'), 80);
  assert.equal(cardUsed(l, c, '2026-10-13'), 80, 'só a compra nova ocupa o limite');
  const s = invoicesSummary(l, [c], '2026-10-13');
  assert.equal(s.openLeft, 80); assert.equal(s.openPaid, 120); assert.equal(s.openTotal, 200);
  c.invoiceAdvances = {'2026-10': [{id: 'z', date: '2026-10-14', amount: 80, accountId: 'a1', createdAt: 2000}]};
  assert.equal(invoiceLeft(l, c, '2026-10'), 0, 'pagou o que chegou');
  assert.equal(invoiceStatus(c, '2026-10', '2026-10-14', l), 'paga');
});

test('fatura paga antes do registro do total (sem invoicePaidDue) continua paga', () => {
  const l = [buy('a', '2026-10-05', 120), buy('b', '2026-10-12', 80)];
  const c = {id: 'c1', name: 'Nubank', closingDay: 20, dueDay: 28, limit: 5000, paidInvoices: ['2026-10']};
  assert.equal(invoiceLeft(l, c, '2026-10'), 200 - 0, 'sem registro, o cálculo antigo vale');
});
