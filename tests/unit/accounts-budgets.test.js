import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountBalance, accountMoves} from '../../js/domain/accounts.js';
import {budgetsFor, budgetLimit, budgetLocked, planWith, statusForPct} from '../../js/domain/budgets.js';
import {recvInstallInfo, recvNextDue, recvRemaining} from '../../js/domain/receivables.js';
import {voucherBalance} from '../../js/domain/vouchers.js';
import {forecastOccurrences} from '../../js/domain/forecasts.js';

const label = t => t.description;
const nu = {id: 'nu', name: 'Nubank', initialBalance: 1000, baseDate: '2026-10-05', baseAt: 5000};
const it = {id: 'it', name: 'Itaú', initialBalance: 500, baseDate: '2026-10-05', baseAt: 5000};
function data(over){ return Object.assign({transactions: [], transfers: [], cards: [], accounts: [nu, it]}, over); }

test('saldo soma só o que aconteceu depois do saldo informado e até hoje', () => {
  const transactions = [
    {type: 'expense', amount: 100, date: '2026-10-06', paymentMethod: 'conta', accountId: 'nu', createdAt: 6000, description: 'Farmácia'},
    {type: 'income', amount: 300, date: '2026-10-06', accountId: 'nu', createdAt: 6001, description: 'Freela'},
    {type: 'expense', amount: 40, date: '2026-10-04', paymentMethod: 'conta', accountId: 'nu', createdAt: 7000, description: 'antes do cadastro'},
    {type: 'expense', amount: 10, date: '2026-10-05', paymentMethod: 'conta', accountId: 'nu', createdAt: 4000, description: 'mesmo dia, lançado antes'},
    {type: 'expense', amount: 60, date: '2026-10-20', paymentMethod: 'conta', accountId: 'nu', createdAt: 8000, description: 'futuro'},
    {type: 'expense', amount: 250, date: '2026-10-06', paymentMethod: 'cartao', cardId: 'c1', accountId: null, createdAt: 9000, description: 'cartão'}];
  assert.equal(accountBalance(nu, data({transactions}), '2026-10-08', label), 1200);
  assert.equal(accountBalance(nu, data({transactions}), '2026-10-20', label), 1140); // a data futura chegou
});

test('transferência muda as duas contas e não é ganho nem gasto', () => {
  const transfers = [{id: 'x', fromId: 'nu', toId: 'it', amount: 200, date: '2026-10-06', createdAt: 6000, description: 'reserva'}];
  const d = data({transfers});
  assert.equal(accountBalance(nu, d, '2026-10-08', label), 800);
  assert.equal(accountBalance(it, d, '2026-10-08', label), 700);
  assert.equal(accountMoves(nu, d, '2026-10-08', label)[0].label, 'Para Itaú · reserva');
  assert.equal(accountMoves(it, d, '2026-10-08', label)[0].kind, 'Transferência');
});

test('fatura paga com outra conta desconta só da conta escolhida', () => {
  const cards = [{id: 'c1', name: 'Roxinho', invoicePayments: {'2026-10': {accountId: 'it', amount: 250, date: '2026-10-07', createdAt: 7000}}}];
  assert.equal(accountBalance(it, data({cards}), '2026-10-08', label), 250);
  assert.equal(accountBalance(nu, data({cards}), '2026-10-08', label), 1000);
});

test('planejamento por mês: herda o último mês planejado e não altera os anteriores', () => {
  const base = {alimentacao: 500};
  const months = {'2026-10': {alimentacao: 800, lazer: 100}};
  assert.equal(budgetLimit(base, months, '2026-09', 'alimentacao'), 500);
  assert.equal(budgetLimit(base, months, '2026-10', 'alimentacao'), 800);
  assert.equal(budgetLimit(base, months, '2026-12', 'lazer'), 100);
  const nov = planWith(base, months, '2026-11', 'lazer', 0);
  assert.deepEqual(nov, {alimentacao: 800});
  assert.deepEqual(budgetsFor(base, months, '2026-10'), {alimentacao: 800, lazer: 100}); // o anterior não mudou
  assert.equal(budgetLocked('2026-09', '2026-10'), true);
  assert.equal(budgetLocked('2026-11', '2026-10'), false);
  assert.deepEqual([0.5, 0.8, 1].map(statusForPct), ['good', 'warning', 'critical']);
});

test('a receber parcelado: parcela atual e próximo vencimento', () => {
  const r = {totalAmount: 600, receivedAmount: 0, installments: 3, installmentAmount: 200, dueDate: '2026-01-31'};
  assert.deepEqual(recvInstallInfo(r), {n: 3, per: 200, paid: 0, next: 1, nextDue: '2026-01-31'});
  assert.equal(recvNextDue({...r, receivedAmount: 200}), '2026-02-28');
  assert.equal(recvInstallInfo({...r, receivedAmount: 250}).next, 2); // parcial não pula
  assert.equal(recvInstallInfo({...r, receivedAmount: 600}).paid, 3);
  assert.equal(recvRemaining({...r, receivedAmount: 250}), 350);
  assert.equal(recvInstallInfo({totalAmount: 100}), null);
  // 0,1 + 0,2: comparação em centavos conta a parcela certinho
  assert.equal(recvInstallInfo({totalAmount: 0.6, receivedAmount: 0.30000000000000004, installments: 2, installmentAmount: 0.3}).paid, 1);
});

test('vale: acumula por mês ou zera, descontando os gastos', () => {
  const v = {id: 'v', amount: 600, carryOver: true, initialBalance: 100, startDate: '2026-09-10'};
  const tx = [{type: 'expense', amount: 50, date: '2026-10-02', paymentMethod: 'vale', voucherId: 'v'}];
  assert.equal(voucherBalance(v, tx, [v], '2026-10-08'), 650); // 100 + 600 (out) − 50
  assert.equal(voucherBalance({...v, carryOver: false}, tx, [v], '2026-10-08'), 550);
});

test('previsão que repete todo mês cai no último dia em meses curtos', () => {
  const f = {id: 'f', description: 'Salário', amount: 3000, date: '2026-01-31', recurring: true, received: {'2026-02': 3000}};
  const [o] = forecastOccurrences([f], '2026-02');
  assert.equal(o.date, '2026-02-28');
  assert.equal(o.received, 3000);
  assert.equal(forecastOccurrences([{...f, recurring: false}], '2026-02').length, 0);
  assert.equal(forecastOccurrences([f], '2025-12').length, 0);
});

test('a receber: quanto cobrar no mês (parcelas vencidas até o fim do mês) e o total em aberto', async () => {
  const {recvDueByMonth, recvDueCount, recvRemaining} = await import('../../js/domain/receivables.js');
  // 12x de 100, 1ª em 10/08; recebeu 2 parcelas e 30 da 3ª.
  const r = {totalAmount: 1200, receivedAmount: 230, installments: 12, installmentAmount: 100, dueDate: '2026-08-10'};
  assert.equal(recvRemaining(r), 970);
  assert.equal(recvDueByMonth(r, '2026-10'), 70, 'outubro: só falta o resto da 3ª parcela (vence 10/10)');
  assert.equal(recvDueByMonth(r, '2026-11'), 170, 'novembro: resto da 3ª + a 4ª');
  assert.equal(recvDueCount(r, '2026-11'), 2);
  assert.equal(recvDueByMonth({...r, receivedAmount: 0}, '2026-10'), 300, 'atrasadas entram na cobrança do mês');
  assert.equal(recvDueByMonth({totalAmount: 500, receivedAmount: 0, dueDate: '2026-12-01'}, '2026-10'), 0, 'sem parcelas, vence depois: nada no mês');
  assert.equal(recvDueByMonth({totalAmount: 500, receivedAmount: 100}, '2026-10'), 400, 'sem data: o que falta');
  assert.equal(recvDueByMonth({...r, forgiven: true}, '2026-10'), 0);
});

test('a receber parcelado: centavos que sobram na 1ª parcela (A2-08)', async () => {
  const {recvParts, recvDueByMonth, recvInstallInfo, recvRemaining, recvNextAmount} = await import('../../js/domain/receivables.js');
  assert.deepEqual(recvParts(100, 3), [33.34, 33.33, 33.33]);
  assert.deepEqual(recvParts(2.26, 2), [1.13, 1.13]);
  assert.deepEqual(recvParts(100.1, 2), [50.05, 50.05]);
  assert.deepEqual(recvParts(1150.2, 3), [383.4, 383.4, 383.4]);
  const r = {totalAmount: 100, receivedAmount: 0, installments: 3, dueDate: '2026-08-10'};
  assert.equal(recvDueByMonth(r, '2026-11'), 100, 'tudo vencido: cobra os 100, não 99,99');
  assert.equal(recvDueByMonth(r, '2026-08'), 33.34, 'só a 1ª, com o centavo a mais');
  assert.equal(recvDueByMonth(r, '2026-09'), 66.67);
  assert.equal(recvNextAmount(r), 33.34);
  assert.equal(recvInstallInfo(r).per, 33.33);
  let after = {...r, receivedAmount: 33.34};
  assert.deepEqual([recvInstallInfo(after).paid, recvNextAmount(after), recvDueByMonth(after, '2026-11')], [1, 33.33, 66.66]);
  after = {...r, receivedAmount: 100};
  assert.deepEqual([recvRemaining(after), recvInstallInfo(after).paid, recvDueByMonth(after, '2026-11')], [0, 3, 0], 'recebidas as 3: nada em aberto');
  // 3 × 33,33 (o jeito antigo): falta 0,01, e "do mês" cobra esse centavo em vez de zero.
  after = {...r, receivedAmount: 99.99};
  assert.deepEqual([recvRemaining(after), recvInstallInfo(after).paid, recvDueByMonth(after, '2026-11')], [0.01, 2, 0.01]);
  // installmentAmount gravado continua valendo (parcelas 2..n); a 1ª fica com a diferença.
  const g = {totalAmount: 2.26, receivedAmount: 0, installments: 2, installmentAmount: 1.12, dueDate: '2026-08-10'};
  assert.equal(recvInstallInfo(g).per, 1.12);
  assert.equal(recvDueByMonth(g, '2026-08'), 1.14);
  assert.equal(recvDueByMonth(g, '2026-11'), 2.26);
  assert.equal(recvDueByMonth({...r, dueDate: undefined}, '2026-11'), 33.34, 'sem data: a próxima parcela');
});

test('a receber parcelado: registros antigos recebidos com a parcela sem a sobra (B1)', async () => {
  const {recvDueByMonth, recvInstallInfo, recvRemaining, recvNextAmount} = await import('../../js/domain/receivables.js');
  const info = x => { const i = recvInstallInfo(x); return [i.paid, i.next, recvNextAmount(x), recvRemaining(x)]; };
  // 100 em 3x gravado com installmentAmount 33,33; a pessoa pagava 33,33 por vez.
  const r = {totalAmount: 100, receivedAmount: 0, installments: 3, installmentAmount: 33.33, dueDate: '2026-08-10'};
  assert.deepEqual(info({...r, receivedAmount: 33.33}), [1, 2, 33.33, 66.67]);
  assert.equal(recvDueByMonth({...r, receivedAmount: 33.33}, '2026-08'), 0, 'a 1ª não fica atrasada por 1 centavo');
  assert.equal(recvDueByMonth({...r, receivedAmount: 33.33}, '2026-09'), 33.33);
  assert.deepEqual(info({...r, receivedAmount: 66.66}), [2, 3, 33.34, 33.34]);
  assert.deepEqual(info({...r, receivedAmount: 99.99}), [2, 3, 0.01, 0.01], 'falta 0,01 na última');
  assert.equal(recvDueByMonth({...r, receivedAmount: 99.99}, '2026-10'), 0.01);
  assert.equal(recvInstallInfo({...r, receivedAmount: 100}).paid, 3);
  assert.equal(recvNextAmount({...r, receivedAmount: 100}), 0);
  // Registro novo (com a sobra na 1ª): 33,34 também quita a 1ª, e a próxima é 33,33.
  assert.deepEqual(info({...r, receivedAmount: 33.34}), [1, 2, 33.33, 66.66]);
  assert.deepEqual(info({...r, installmentAmount: undefined, receivedAmount: 33.33}), [1, 2, 33.33, 66.67]);
  // 2,26 em 2x gravado com 1,12 por parcela.
  const g = {totalAmount: 2.26, receivedAmount: 1.12, installments: 2, installmentAmount: 1.12, dueDate: '2026-08-10'};
  assert.deepEqual(info(g), [1, 2, 1.14, 1.14]);
  assert.deepEqual(info({...g, receivedAmount: 1.13}), [1, 2, 1.13, 1.13]);
  assert.equal(recvInstallInfo({...g, receivedAmount: 1.11}).paid, 0);
  // "Falta" nunca negativo, nem recebendo a mais.
  for (let c = 0; c <= 10100; c += 1){
    const x = {...r, receivedAmount: c / 100};
    assert.ok(recvNextAmount(x) >= 0 && recvDueByMonth(x, '2026-12') >= 0, String(c));
  }
});
