import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceKeyFor, invoiceDates, invoiceLabel, invoiceItems, invoiceTotal, invoiceStatus, cardUsed, invoicesSummary} from '../../js/domain/cards.js';
import {expandInstallments, installmentGroups, monthTotals, clampInstall, installHint} from '../../js/domain/transactions.js';

const card = {id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10};
const buy = (id, date, amount) => ({id, type: 'expense', amount, category: 'compras', date, paymentMethod: 'cartao', cardId: 'c1', createdAt: 1});

test('compra até o fechamento fica na fatura do mês; depois, na seguinte', () => {
  assert.equal(invoiceKeyFor('2026-10-02', card), '2026-10');
  assert.equal(invoiceKeyFor('2026-10-03', card), '2026-11', 'compra no dia do fechamento já vai para a seguinte (como nos bancos)');
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
  const list = [buy('a', '2026-10-01', 100), buy('b', '2026-10-02', 50.5), buy('c', '2026-10-05', 20),
    {id: 'd', type: 'expense', amount: 999, date: '2026-10-02', paymentMethod: 'conta'}];
  assert.deepEqual(invoiceItems(list, card, '2026-10').map(t => t.id), ['a', 'b']);
  assert.equal(invoiceTotal(list, card, '2026-10'), 150.5);
  assert.equal(invoiceStatus(card, '2026-10', '2026-10-02'), 'aberta');
  assert.equal(invoiceStatus(card, '2026-10', '2026-10-03'), 'fechada', 'no dia do fechamento já está fechada');
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

test('faturas a pagar: fechadas ou vencidas e não pagas; aberta separada', () => {
  const list = [buy('a', '2026-09-02', 100), buy('b', '2026-09-20', 40), buy('c', '2026-10-06', 15)];
  // hoje 08/10: fatura de set (fechou 03/09, venceu 10/09) vencida; out (fechou 03/10) fechada; nov aberta
  const s = invoicesSummary(list, [card], '2026-10-08');
  assert.deepEqual(s.toPay.map(i => [i.key, i.status, i.total]), [['2026-09', 'vencida', 100], ['2026-10', 'fechada', 40]]);
  assert.equal(s.toPayTotal, 140);
  assert.deepEqual(s.open.map(i => [i.key, i.total]), [['2026-11', 15]]);
  const paid = invoicesSummary(list, [{...card, paidInvoices: ['2026-09']}], '2026-10-08');
  assert.equal(paid.toPayTotal, 40);
});

test('cartão que fecha dia 31 e vence dia 7 (exemplo do Inter)', () => {
  const inter = {id: 'i', name: 'Inter', closingDay: 31, dueDay: 7};
  const k = invoiceKeyFor('2026-10-04', inter);
  assert.equal(k, '2026-10');
  assert.deepEqual(invoiceDates(k, inter), {closing: '2026-10-31', due: '2026-11-07'});
  assert.equal(invoiceLabel(k, inter), 'novembro de 2026', 'compra de 04/10 cai na fatura que vence em novembro');
  assert.equal(invoiceKeyFor('2026-10-31', inter), '2026-11', 'no dia do fechamento já vai para a seguinte');
  assert.equal(invoiceLabel('2026-11', inter), 'dezembro de 2026');
  assert.equal(invoiceKeyFor('2026-09-30', inter), '2026-10', 'em setembro (30 dias) fecha no dia 30');
  assert.equal(invoiceKeyFor('2026-09-29', inter), '2026-09');
  assert.equal(invoiceKeyFor('2027-02-28', inter), '2027-03', 'em fevereiro fecha no dia 28');
});

test('vencimento depois do fechamento no mesmo mês: nome é o próprio mês', () => {
  assert.equal(invoiceLabel('2026-10', card), 'outubro de 2026');
});

test('compra parcelada que já estava em andamento (7 de 18)', async () => {
  const {expandInstallments, installmentGroups, installHint, purchaseTotal} = await import('../../js/domain/transactions.js');
  const total = purchaseTotal(50, 18, true);
  assert.equal(total, 900, 'valor de cada parcela × 18');
  const tx = {type: 'expense', amount: total, category: 'compras', date: '2026-10-10', paymentMethod: 'cartao', cardId: 'c1', createdAt: 1};
  const list = expandInstallments(tx, 18, 'g1', 'Notebook', 7);
  assert.equal(list.length, 12, 'cria só da 7ª à 18ª');
  assert.deepEqual([list[0].installment.n, list[0].date, list[0].description], [7, '2026-10-10', 'Notebook (7/18)']);
  assert.deepEqual([list[11].installment.n, list[11].date], [18, '2027-09-10']);
  assert.ok(list.every(t => t.amount === 50 && t.installment.start === 7 && t.installment.totalAmount === 900));
  const g = installmentGroups(list, [], '2026-10-15')[0];
  assert.deepEqual([g.before, g.advanced, g.paid.length, g.done, g.remaining], [6, 0, 1, 7, 550], 'parcela 7 de 18: 6 pagas antes, nenhuma “adiantada”');
  assert.equal(installHint(18, 900, v => 'R$ ' + v, 7), '18x de R$ 50 · total R$ 900 · começa na 7ª: faltam 12 (R$ 600)');
  assert.equal(expandInstallments(tx, 18, 'g2', 'X', 99).length, 1, 'parcela atual acima do total vira a última');
  assert.equal(expandInstallments(tx, 3, 'g3', 'X').every(t => !('start' in t.installment)), true, 'compra nova não grava start');
});

test('estornos: crédito na fatura escolhida, limite e gastos do mês', async () => {
  const {invoiceTotal, cardUsed, invoicesSummary} = await import('../../js/domain/cards.js');
  const {monthTotals, reversalsOf} = await import('../../js/domain/transactions.js');
  const {validateRecord} = await import('../../js/domain/validate.js');
  const c = {id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10};
  const buy = {id: 'p', type: 'expense', amount: 200, category: 'compras', date: '2026-09-20', paymentMethod: 'cartao', cardId: 'c1'};
  // Fatura de outubro (fecha 03/10) já fechou; o estorno de 05/10 cai na seguinte (fecha 03/11).
  const rev = {id: 'r', type: 'expense', amount: -200, category: 'compras', date: '2026-10-05', paymentMethod: 'cartao', cardId: 'c1', reversal: {of: 'p'}};
  assert.equal(invoiceTotal([buy, rev], c, '2026-10'), 200, 'fatura fechada não muda');
  assert.equal(invoiceTotal([buy, rev], c, '2026-11'), -200, 'crédito na próxima');
  // Estorno lançado direto na fatura da compra (escolhido pela pessoa).
  const rev2 = {...rev, invoiceKey: '2026-10'};
  assert.equal(invoiceTotal([buy, rev2], c, '2026-10'), 0);
  assert.equal(cardUsed([buy, rev2], c, '2026-10-05'), 0, 'limite volta');
  assert.equal(invoicesSummary([buy, rev2], [c], '2026-10-05').toPay.length, 0, 'nada a pagar');
  assert.equal(monthTotals([buy, rev], '2026-10').expense, -200, 'estorno abate os gastos do mês em que entrou');
  assert.deepEqual(reversalsOf([buy, rev], 'p').map(t => t.id), ['r']);
  assert.equal(validateRecord('transactions', rev), '', 'estorno com valor negativo é válido');
  assert.equal(validateRecord('transactions', {...rev, reversal: undefined}), 'valor inválido', 'valor negativo sem ser estorno é recusado');
  assert.equal(validateRecord('transactions', {...rev, amount: 10}), 'valor inválido', 'estorno precisa ser negativo');
});
