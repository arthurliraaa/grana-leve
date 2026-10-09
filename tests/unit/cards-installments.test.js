import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceKeyFor, invoiceDates, invoiceItems, invoiceTotal, invoiceStatus, cardUsed} from '../../js/domain/cards.js';
import {expandInstallments, installmentGroups, monthTotals, clampInstall, installHint} from '../../js/domain/transactions.js';

const card = {id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10};
const buy = (id, date, amount) => ({id, type: 'expense', amount, category: 'compras', date, paymentMethod: 'cartao', cardId: 'c1', createdAt: 1});

test('compra até o fechamento fica na fatura do mês; depois, na seguinte', () => {
  assert.equal(invoiceKeyFor('2026-10-03', card), '2026-10');
  assert.equal(invoiceKeyFor('2026-10-04', card), '2026-11');
  assert.equal(invoiceKeyFor('2026-12-20', card), '2027-01');
});

test('vencimento no mesmo mês ou no seguinte, conforme os dias', () => {
  assert.deepEqual(invoiceDates('2026-10', card), {closing: '2026-10-03', due: '2026-10-10'});
  assert.deepEqual(invoiceDates('2026-10', {closingDay: 28, dueDay: 5}), {closing: '2026-10-28', due: '2026-11-05'});
  // fevereiro não tem dia 30: fecha no último dia
  assert.deepEqual(invoiceDates('2026-02', {closingDay: 30, dueDay: 7}), {closing: '2026-02-28', due: '2026-03-07'});
});

test('itens, total e situação da fatura', () => {
  const list = [buy('a', '2026-10-01', 100), buy('b', '2026-10-03', 50.5), buy('c', '2026-10-05', 20),
    {id: 'd', type: 'expense', amount: 999, date: '2026-10-02', paymentMethod: 'conta'}];
  assert.deepEqual(invoiceItems(list, card, '2026-10').map(t => t.id), ['a', 'b']);
  assert.equal(invoiceTotal(list, card, '2026-10'), 150.5);
  assert.equal(invoiceStatus(card, '2026-10', '2026-10-02'), 'aberta');
  assert.equal(invoiceStatus(card, '2026-10', '2026-10-05'), 'fechada');
  assert.equal(invoiceStatus(card, '2026-10', '2026-10-11'), 'vencida');
  assert.equal(invoiceStatus({...card, paidInvoices: ['2026-10']}, '2026-10', '2026-10-11'), 'paga');
});

test('limite usado soma faturas não pagas, inclusive parcelas futuras', () => {
  const list = [buy('a', '2026-10-01', 100), buy('b', '2026-11-01', 100), buy('c', '2026-12-01', 100)];
  assert.equal(cardUsed(list, card, '2026-10-15'), 300);
  assert.equal(cardUsed(list, {...card, paidInvoices: ['2026-10']}, '2026-10-15'), 200);
});

test('parcelamento: uma parcela por mês, sobra na 1ª, mesma compra', () => {
  const tx = {type: 'expense', amount: 100, category: 'compras', date: '2026-01-31', paymentMethod: 'cartao', cardId: 'c1', createdAt: 1000};
  const parts = expandInstallments(tx, 3, 'g1', 'Fone');
  assert.deepEqual(parts.map(p => p.amount), [33.34, 33.33, 33.33]);
  assert.deepEqual(parts.map(p => p.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(parts.map(p => p.description), ['Fone (1/3)', 'Fone (2/3)', 'Fone (3/3)']);
  assert.ok(parts.every(p => p.installment.group === 'g1' && p.installment.totalAmount === 100));
  // à vista ou fora do cartão não parcela
  assert.equal(expandInstallments(tx, 1, 'g', 'x').length, 1);
  assert.equal(expandInstallments({...tx, paymentMethod: 'conta'}, 3, 'g', 'x').length, 1);
});

test('grupos de parcelas: pagas, futuras, restante e adiantadas', () => {
  const tx = {type: 'expense', amount: 300, category: 'compras', date: '2026-09-10', paymentMethod: 'cartao', cardId: 'c1', createdAt: 1};
  const parts = expandInstallments(tx, 3, 'g1', 'TV').map((p, i) => ({...p, id: 'p' + i}));
  let [g] = installmentGroups(parts, [card], '2026-10-20');
  assert.equal(g.paid.length, 2);
  assert.equal(g.future.length, 1);
  assert.equal(g.remaining, 100);
  assert.equal(g.card.name, 'Nubank');
  [g] = installmentGroups(parts.slice(0, 2), [card], '2026-10-20'); // 3ª adiantada (removida)
  assert.equal(g.advanced, 1);
  assert.equal(g.remaining, 0);
});

test('total do mês separa realizado de agendado', () => {
  const list = [
    {type: 'income', amount: 3000, date: '2026-10-05'},
    {type: 'expense', amount: 100, date: '2026-10-07'},
    {type: 'expense', amount: 33.33, date: '2026-10-25'},
    {type: 'expense', amount: 999, date: '2026-11-01'}];
  const t = monthTotals(list, '2026-10', '2026-10-08');
  assert.equal(t.expense, 133.33);
  assert.equal(t.expenseDone, 100);
  assert.equal(t.expenseScheduled, 33.33);
  assert.equal(t.saldo, 2866.67);
});

test('seletor de parcelas: limites e resumo', () => {
  assert.equal(clampInstall(0), 1);
  assert.equal(clampInstall('99'), 24);
  assert.equal(clampInstall('abc'), 1);
  assert.equal(clampInstall(2.6), 3);
  assert.equal(installHint(1, 100, String), 'À vista');
  assert.equal(installHint(3, 100, v => v.toFixed(2)), '3x de 33.33 · total 100.00');
});
