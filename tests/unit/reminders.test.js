import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReminders, addDaysKey, safeAppUrl} from '../../js/domain/reminders.js';

const salary = {id: 'f1', description: 'Salário', amount: 2751.4, date: '2026-11-06', recurring: true, received: {},
  salary: {rule: {type: 'workday', n: 5, saturday: true}, steps: [{from: '2026-11', gross: 3000, net: 2751.4}], months: {}}};
const card = {id: 'c1', name: 'Nubank', closingDay: 5, dueDay: 12, paidInvoices: []};
const bill = {id: 'b1', name: 'Luz', amount: 120, dueDay: 20, startMonth: '2026-01', every: 1, paid: {}};

test('datas do calendário', () => {
  assert.equal(addDaysKey('2026-11-30', 1), '2026-12-01');
  assert.equal(addDaysKey('2026-03-01', -1), '2026-02-28');
  assert.equal(addDaysKey('2026-12-31', 1), '2027-01-01');
});

test('salário: lembra no dia previsto, só no horizonte e só se ainda não foi recebido', () => {
  const kinds = {salary: true};
  const r = buildReminders({today: '2026-12-01', kinds, forecasts: [salary]});
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].key, r[0].kind, r[0].date, r[0].hour], ['salary:f1:2026-12-05', 'salary', '2026-12-05', 9]);
  assert.match(r[0].body, /Já caiu\?/);
  assert.equal(r[0].url, './#/inicio');
  assert.equal(buildReminders({today: '2026-12-01', kinds, forecasts: [salary], horizon: 2}).length, 0, 'fora do horizonte');
  const got = Object.assign({}, salary, {received: {'2026-12': 2751.4}});
  assert.equal(buildReminders({today: '2026-12-01', kinds, forecasts: [got]}).length, 0, 'já recebido');
  assert.equal(buildReminders({today: '2026-12-01', kinds: {}, forecasts: [salary]}).length, 0, 'tipo desligado');
});

test('fatura: um dia antes do vencimento, só se há o que pagar', () => {
  const tx = [{id: 't1', type: 'expense', amount: 200, date: '2026-11-20', paymentMethod: 'cartao', cardId: 'c1', category: 'compras'}];
  const r = buildReminders({today: '2026-12-10', kinds: {invoice: true}, cards: [card], transactions: tx});
  assert.deepEqual(r.map(x => [x.key, x.date, x.body]), [['invoice:c1:2026-12', '2026-12-11', 'A fatura do Nubank vence amanhã.']]);
  assert.equal(r[0].url, './#/contas');
  const paid = [Object.assign({}, card, {paidInvoices: ['2026-12']})];
  assert.equal(buildReminders({today: '2026-12-10', kinds: {invoice: true}, cards: paid, transactions: tx}).length, 0, 'fatura paga');
  assert.equal(buildReminders({today: '2026-12-10', kinds: {invoice: true}, cards: [card], transactions: []}).length, 0, 'sem compras não há o que pagar');
});

test('conta fixa: um dia antes, não repete e some se foi paga', () => {
  const r = buildReminders({today: '2026-11-17', kinds: {bill: true}, bills: [bill]});
  assert.deepEqual(r.map(x => [x.key, x.date, x.body, x.url]), [['bill:b1:2026-11', '2026-11-19', 'A conta Luz vence amanhã.', './#/lancamentos']]);
  const paid = Object.assign({}, bill, {paid: {'2026-11': {amount: 120}}});
  assert.equal(buildReminders({today: '2026-11-17', kinds: {bill: true}, bills: [paid]}).length, 0, 'conta paga');
  const skipped = Object.assign({}, bill, {paid: {'2026-11': {skipped: true}}});
  assert.equal(buildReminders({today: '2026-11-17', kinds: {bill: true}, bills: [skipped]}).length, 0, 'conta pulada neste mês');
});

test('textos nunca levam valores em reais e cabem nos limites do servidor', () => {
  const longCard = Object.assign({}, card, {name: 'N'.repeat(300)});
  const tx = [{id: 't1', type: 'expense', amount: 1234.56, date: '2026-11-20', paymentMethod: 'cartao', cardId: 'c1', category: 'compras'}];
  const r = buildReminders({today: '2026-12-10', kinds: {invoice: true, salary: true, bill: true}, cards: [longCard], transactions: tx, forecasts: [salary], bills: [bill]});
  assert.ok(r.length >= 1);
  for (const x of r){ assert.ok(x.title.length <= 80 && x.body.length <= 160 && x.key.length <= 120); assert.ok(!/R\$|\d+,\d{2}/.test(x.title + x.body)); }
});

test('só rotas do próprio app são aceitas como destino', () => {
  assert.equal(safeAppUrl('./#/contas'), './#/contas');
  assert.equal(safeAppUrl('https://golpe.exemplo.com'), './#/inicio');
  assert.equal(safeAppUrl('./#/../x'), './#/inicio');
  assert.equal(safeAppUrl(undefined), './#/inicio');
});
