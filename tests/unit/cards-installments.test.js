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
  assert.equal(installHint(18, 900, v => 'R$ ' + v, 7), '18x de R$ 50 · total R$ 900 · as parcelas 1 a 6 já venceram (contam como pagas) · faltam 12 (R$ 600)');
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

test('compra dividida: só a sua parte é gasto seu', async () => {
  const {myShare, othersShare, splitShares, monthTotals} = await import('../../js/domain/transactions.js');
  assert.deepEqual(splitShares(300, [{person: 'Ana', value: 100}, {person: 'Bia', value: 50}], false), {people: [{person: 'Ana', amount: 100}, {person: 'Bia', amount: 50}], others: 150, mine: 150});
  assert.deepEqual(splitShares(300, [{person: 'Ana', value: 25}], true).mine, 225, '25% para a Ana');
  const split = {total: 300, mine: 100, people: []};
  const parcel = {type: 'expense', amount: 100, date: '2026-10-10', split};
  assert.equal(myShare(parcel), 33.33, 'parcela de 100: sua parte proporcional');
  assert.equal(othersShare(parcel), 66.67);
  assert.equal(monthTotals([parcel], '2026-10').expense, 33.33);
  assert.equal(monthTotals([parcel], '2026-10').forOther, 66.67);
});

test('fatura da compra e parcelas já vencidas a partir da data da compra', async () => {
  const {invoiceFor, firstDueInstallment} = await import('../../js/domain/cards.js');
  const {expandPurchase, installmentGroups} = await import('../../js/domain/transactions.js');
  const c = {id: 'c', name: 'X', closingDay: 10, dueDay: 20};
  // Exemplo: fecha dia 10, vence dia 20.
  assert.deepEqual(invoiceFor('2026-05-08', c), {key: '2026-05', closing: '2026-05-10', due: '2026-05-20', label: 'maio de 2026'});
  assert.deepEqual(invoiceFor('2026-05-11', c), {key: '2026-06', closing: '2026-06-10', due: '2026-06-20', label: 'junho de 2026'});
  assert.equal(invoiceFor('2026-05-10', c).key, '2026-06', 'no dia do fechamento vai para a próxima');
  // Compra de 08/03 em 10x, hoje 15/10: faturas de mar (venc. 20/03) … set (20/09) já venceram = 7 parcelas; a 8ª vence 20/10.
  assert.equal(firstDueInstallment('2026-03-08', 10, c, '2026-10-15'), 8);
  assert.equal(firstDueInstallment('2026-03-08', 10, c, '2026-10-21'), 9, 'depois do vencimento de outubro, a 8ª também conta como paga');
  assert.equal(firstDueInstallment('2026-10-01', 3, c, '2026-10-15'), 1, 'compra recente começa na 1ª');
  assert.equal(firstDueInstallment('2025-01-01', 3, c, '2026-10-15'), 4, 'todas já venceram');
  const tx = {type: 'expense', amount: 1000, category: 'compras', date: '2026-03-08', paymentMethod: 'cartao', cardId: 'c', createdAt: 1};
  const parts = expandPurchase(tx, 10, 'g', 'TV', 8);
  assert.equal(parts.length, 10, 'todas as parcelas ficam no histórico');
  assert.deepEqual([parts[0].date, parts[7].date, parts[9].date], ['2026-03-08', '2026-10-08', '2026-12-08'], 'cada uma no seu mês, a 1ª na data da compra');
  assert.ok(parts.slice(0, 7).every(t => t.installment.settled) && parts.slice(7).every(t => !t.installment.settled), 'as 7 que já venceram ficam acertadas');
  assert.ok(parts.every(t => t.purchaseDate === '2026-03-08'));
  const g = installmentGroups(parts, [c], '2026-10-15')[0];
  assert.deepEqual([g.before, g.done, g.future.length, g.remaining], [7, 8, 2, 200], 'parcela 8 de 10; faltam 2 (200)');
  // As acertadas não pesam no limite nem em "faturas a pagar".
  const {cardUsed, invoicesSummary, invoiceTotal} = await import('../../js/domain/cards.js');
  assert.equal(cardUsed(parts, c, '2026-10-15'), 300, 'limite: só as 3 que faltam (8, 9 e 10)');
  assert.equal(invoicesSummary(parts, [c], '2026-10-15').toPayTotal, 100, 'a pagar: só a fatura de outubro (fechada, vence dia 20, com a 8ª); as antigas não aparecem');
  assert.equal(invoiceTotal(parts, c, '2026-04'), 100, 'mas a fatura de abril continua mostrando a compra (histórico)');
});

test('mês de competência: compra no cartão conta no mês em que a fatura vence', async () => {
  const Tx = await import('../../js/domain/transactions.js');
  const {invoiceDates, txInvoiceKey} = await import('../../js/domain/cards.js');
  const c = {id: 'c', closingDay: 31, dueDay: 7};
  const buy = {type: 'expense', amount: 100, date: '2026-10-04', paymentMethod: 'cartao', cardId: 'c', category: 'x'};
  const pix = {type: 'expense', amount: 50, date: '2026-10-04', paymentMethod: 'conta', category: 'x'};
  assert.equal(Tx.monthOf(buy), '2026-10', 'sem resolvedor: pela data');
  Tx.setMonthResolver(t => t.paymentMethod === 'cartao' ? invoiceDates(txInvoiceKey(t, c), c).due.slice(0, 7) : null);
  try {
    assert.equal(Tx.monthOf(buy), '2026-11', 'compra de 04/10, fatura vence 07/11: conta em novembro');
    assert.equal(Tx.monthOf(pix), '2026-10', 'Pix continua pela data');
    assert.equal(Tx.monthTotals([buy, pix], '2026-10').expense, 50);
    assert.equal(Tx.monthTotals([buy, pix], '2026-11').expense, 100);
  } finally { Tx.setMonthResolver(null); }
});

test('fatura paga em parte: o resto vai para a próxima (rotativo) ou é parcelado nas seguintes', async () => {
  const {carryIns, carryTotal, invoiceDueTotal, invoiceKeys, partialPayment} = await import('../../js/domain/cards.js');
  const list = [buy('a', '2026-10-01', 1000), buy('b', '2026-10-05', 200)];
  // Rotativo: fatura de 2026-10 (R$ 1.000), pagou 400, faltam 600 na fatura seguinte.
  const rot = {...card, paidInvoices: ['2026-10'], invoicePayments: {'2026-10': {amount: 400, total: 1000, mode: 'aberto', rest: 600}}};
  assert.ok(partialPayment(rot, '2026-10'));
  assert.deepEqual(carryIns(rot, '2026-11').map(x => x.amount), [600]);
  assert.equal(carryTotal(rot, '2026-12'), 0);
  assert.equal(invoiceDueTotal(list, rot, '2026-11'), 800, 'compra de 200 + 600 que ficou em aberto');
  assert.equal(cardUsed(list, rot, '2026-10-20'), 800, 'a fatura paga sai do limite; o resto continua ocupando');
  // Parcelado: faltam 600 em 4x, nas faturas 11, 12, 01 e 02.
  const par = {...card, paidInvoices: ['2026-10'], invoicePayments: {'2026-10': {amount: 400, total: 1000, mode: 'parcelado', rest: 600, n: 4, parcel: 165}}};
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map(kk => carryTotal(par, kk)), [150, 150, 150, 150, 0]);
  assert.deepEqual(carryIns(par, '2027-01')[0], {from: '2026-10', mode: 'parcelado', i: 3, n: 4, amount: 150});
  assert.deepEqual(invoiceKeys(list, par), ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(cardUsed(list, par, '2026-10-20'), 800, 'parcelas futuras ocupam o limite (200 + 4 × 150)');
  const sum = invoicesSummary(list, [par], '2026-11-05');
  assert.equal(sum.toPayTotal, 350, 'fatura 11 fechada: compra de 200 + parcela de 150');
  // Pagamento total (sem mode) não leva nada adiante.
  const tot = {...card, paidInvoices: ['2026-10'], invoicePayments: {'2026-10': {amount: 1000, accountId: 'x'}}};
  assert.equal(partialPayment(tot, '2026-10'), null);
  assert.equal(carryTotal(tot, '2026-11'), 0);
});
