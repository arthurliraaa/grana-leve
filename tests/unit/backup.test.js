import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBackup, readBackup} from '../../js/data/backup.js';
import {migrateData, SCHEMA_VERSION} from '../../js/data/migrations.js';
import {validateRecord, validateNewTransaction} from '../../js/domain/validate.js';

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
