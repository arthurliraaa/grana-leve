import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBackup, readBackup} from '../../js/data/backup.js';
import {migrateData, SCHEMA_VERSION} from '../../js/data/migrations.js';
import {validateRecord, validateNewTransaction} from '../../js/domain/validate.js';
import {money} from '../../js/domain/money.js';

const tx = {id: 't1', type: 'expense', amount: 10, category: 'outros', date: '2026-10-08', paymentMethod: 'conta'};

test('backup leva todas as coleções, preferências e a versão do formato', () => {
  const b = buildBackup({transactions: [tx]}, {skipConfirm: {deleteTx: true}, lastWelcome: '2026-10-08', lastBackup: 1}, {name: 'A'});
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(b.prefs, {skipConfirm: {deleteTx: true}}); // sem preferências que só valem neste aparelho
  assert.ok(Array.isArray(b.data.accounts) && Array.isArray(b.data.transfers) && Array.isArray(b.data.budgets));
  const r = readBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(r.count, 1);
  assert.deepEqual(r.prefs, {skipConfirm: {deleteTx: true}});
});

test('backup antigo (formato 1) é atualizado ao restaurar', () => {
  const r = readBackup({app: 'grana-leve', version: 1, data: {budgets: {alimentacao: 500}, transactions: [{...tx, amount: 10.005}]}});
  assert.deepEqual(r.data.budgets, [{id: 'alimentacao', limit: 500}]);
  assert.equal(r.data.transactions[0].amount, 10.01);
  assert.deepEqual(r.data.accounts, []);
});

test('backup com registro inválido é recusado com mensagem clara', () => {
  assert.match(readBackup({app: 'outro', data: {}}).error, /não é um backup/);
  assert.match(readBackup({app: 'grana-leve', data: {transactions: [{...tx, amount: -5}]}}).error, /lançamentos \(item 1: valor inválido\)/);
  assert.match(readBackup({app: 'grana-leve', data: {cards: [{id: 'c', name: 'X', closingDay: 40, dueDay: 5}]}}).error, /cartões/);
  assert.match(readBackup({app: 'grana-leve', data: {transactions: 'x'}}).error, /corrompido/);
  assert.match(readBackup({app: 'grana-leve', schemaVersion: 99, data: {}}).error, /versão mais nova/);
});

test('validação central de lançamentos', () => {
  assert.equal(validateNewTransaction({type: 'income', amount: 1500, category: 'salario', date: '2026-10-05'}), '');
  assert.equal(validateNewTransaction({type: 'expense', amount: 0, category: 'x', date: '2026-10-05'}), 'valor inválido');
  assert.equal(validateNewTransaction({type: 'expense', amount: 5, category: 'x', date: '2026-13-05'}), 'data inválida');
  assert.equal(validateNewTransaction({type: 'gasto', amount: 5, category: 'x', date: '2026-10-05'}), 'tipo inválido');
  assert.equal(validateRecord('transactions', {...tx, id: ''}), 'registro sem identificação');
  assert.equal(validateRecord('transfers', {id: 'x', fromId: 'a', toId: 'a', amount: 1, date: '2026-10-01'}), 'contas inválidas');
});

test('migração é idempotente a partir da versão atual', () => {
  const d = {budgets: [{id: 'x', limit: 1}], transactions: []};
  assert.deepEqual(migrateData(JSON.parse(JSON.stringify(d)), SCHEMA_VERSION), d);
});

test('restaurar arredonda em centavos todos os valores em dinheiro (formato atual)', () => {
  const r = readBackup({app: 'grana-leve', schemaVersion: SCHEMA_VERSION, data: {
    transactions: [
      {...tx, id: 'a', amount: 10.006},
      {...tx, id: 'b', amount: 3.14159, split: {total: 3.14159, mine: 1.0049, people: [{person: 'Ana', amount: 2.1367}]},
        installment: {group: 'g', n: 1, total: 2, totalAmount: 6.28318}, installmentAdvance: {group: 'g', count: 1, original: 3.14159, discount: 0.333}}
    ],
    accounts: [{id: 'ac', name: 'Banco', initialBalance: 100.126}],
    transfers: [{id: 'tr', fromId: 'a', toId: 'b', amount: 50.556, date: '2026-10-01'}],
    cards: [{id: 'c', name: 'Cartão', closingDay: 5, dueDay: 12, limit: 1000.999,
      invoicePayments: {'2026-10': {amount: 10.006, total: 30.009, rest: 20.003, parcel: 7.777, mode: 'parcelado', n: 3}},
      invoiceAdvances: {'2026-11': [{id: 'x', amount: 5.559}]}}],
    budgets: [{id: 'plan-2026-10', month: '2026-10', limits: {alimentacao: 500.004, lazer: 99.999}}],
    goals: [{id: 'g', name: 'Viagem', targetAmount: 1000.006, currentAmount: 10.006, moves: [{id: 'm', amount: 10.006, kind: 'deposit'}]}],
    debts: [{id: 'd', name: 'Empréstimo', totalAmount: 900.009, paidAmount: 100.001, monthlyPayment: 50.006, payments: [{id: 'p', amount: 100.001}]}],
    receivables: [{id: 'rc', person: 'Ana', totalAmount: 100.009, receivedAmount: 33.336, installmentAmount: 33.333, forgivenAmount: 1.111, payments: [{id: 'p', amount: 33.336}]}],
    forecasts: [{id: 'f', description: 'Salário', amount: 3000.006, date: '2026-10-05', received: {'2026-10': 2999.996}}],
    vouchers: [{id: 'v', name: 'VR', amount: 600.006, initialBalance: 12.344}],
    bills: [{id: 'bl', name: 'Luz', amount: 150.006, startMonth: '2026-01', amounts: [{from: '2026-06', amount: 160.009}], paid: {'2026-10': {txId: 'a', amount: 160.009}}}]
  }});
  assert.equal(r.error, undefined);
  const d = r.data;
  assert.equal(d.transactions[0].amount, 10.01);
  const t = d.transactions[1];
  assert.equal(t.amount, 3.14);
  assert.deepEqual(t.split, {total: 3.14, mine: 1, people: [{person: 'Ana', amount: 2.14}]});
  assert.equal(t.installment.totalAmount, 6.28);
  assert.equal(t.installment.n, 1); // campos que não são dinheiro ficam como estão
  assert.deepEqual([t.installmentAdvance.original, t.installmentAdvance.discount, t.installmentAdvance.count], [3.14, 0.33, 1]);
  assert.equal(d.accounts[0].initialBalance, 100.13);
  assert.equal(d.transfers[0].amount, 50.56);
  const c = d.cards[0];
  assert.equal(c.limit, 1001);
  assert.deepEqual(c.invoicePayments['2026-10'], {amount: 10.01, total: 30.01, rest: 20, parcel: 7.78, mode: 'parcelado', n: 3});
  assert.equal(c.invoiceAdvances['2026-11'][0].amount, 5.56);
  assert.deepEqual(d.budgets[0].limits, {alimentacao: 500, lazer: 100});
  assert.deepEqual([d.goals[0].targetAmount, d.goals[0].currentAmount, d.goals[0].moves[0].amount], [1000.01, 10.01, 10.01]);
  const db = d.debts[0];
  assert.deepEqual([db.totalAmount, db.paidAmount, db.monthlyPayment, db.payments[0].amount], [900.01, 100, 50.01, 100]);
  const rc = d.receivables[0];
  assert.deepEqual([rc.totalAmount, rc.receivedAmount, rc.installmentAmount, rc.forgivenAmount, rc.payments[0].amount], [100.01, 33.34, 33.33, 1.11, 33.34]);
  assert.deepEqual([d.forecasts[0].amount, d.forecasts[0].received['2026-10']], [3000.01, 3000]);
  assert.deepEqual([d.vouchers[0].amount, d.vouchers[0].initialBalance], [600.01, 12.34]);
  const b = d.bills[0];
  assert.deepEqual([b.amount, b.amounts[0].amount, b.paid['2026-10'].amount, b.paid['2026-10'].txId], [150.01, 160.01, 160.01, 'a']);
});

test('restaurar amount 10.005 passa por money() (10.01 quando money() não tem o erro de meio centavo, A2-10)', () => {
  const r = readBackup({app: 'grana-leve', schemaVersion: SCHEMA_VERSION, data: {transactions: [{...tx, amount: 10.005}]}});
  assert.equal(r.data.transactions[0].amount, money(10.005));
});

test('restaurar valor em texto numérico converte e arredonda; texto não numérico segue recusado (S6)', () => {
  const ok = (amount) => readBackup({app: 'grana-leve', schemaVersion: SCHEMA_VERSION, data: {transactions: [{...tx, amount}]}});
  assert.equal(ok('3.14159').data.transactions[0].amount, 3.14);
  assert.equal(ok(' 10.005 ').data.transactions[0].amount, money(10.005));
  assert.match(ok('abc').error, /valor inválido/);
});

test('valor que arredonda para 0 é recusado pela validação', () => {
  assert.match(readBackup({app: 'grana-leve', schemaVersion: SCHEMA_VERSION, data: {transactions: [{...tx, amount: 0.004}]}}).error, /valor inválido/);
});

test('restaurar budgets do formato antigo (limit) arredonda', () => {
  const r = readBackup({app: 'grana-leve', schemaVersion: SCHEMA_VERSION, data: {budgets: [{id: 'x', limit: 99.999}]}});
  assert.equal(r.data.budgets[0].limit, 100);
});
