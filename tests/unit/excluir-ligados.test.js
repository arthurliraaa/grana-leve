import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkedToDelete} from '../../js/domain/transactions.js';

const ids = l => l.map(t => t.id);

test('excluir: "A receber" usado por outra compra fica', () => {
  const list = [
    {id: 'a', type: 'expense', amount: 10, forOther: {person: 'Ana', receivableId: 'r1'}},
    {id: 'b', type: 'expense', amount: 20, split: {total: 20, mine: 10, people: [{person: 'Ana', receivableId: 'r1', amount: 10}]}},
    {id: 'c', type: 'expense', amount: 30, forOther: {person: 'Bia', receivableId: 'r2'}}
  ];
  const recvs = [{id: 'r1', person: 'Ana'}, {id: 'r2', person: 'Bia'}];
  let l = linkedToDelete(list, recvs, ['a']);
  assert.deepEqual(l.receivables, []);
  l = linkedToDelete(list, recvs, ['a', 'b']);
  assert.deepEqual(ids(l.receivables), ['r1']);
  assert.deepEqual(l.extraTxIds, []);
});

test('excluir: estorno de outra compra não vai junto', () => {
  const list = [
    {id: 'a', type: 'expense', amount: 10},
    {id: 'b', type: 'expense', amount: 20},
    {id: 'ea', type: 'expense', amount: -5, reversal: {of: 'a'}},
    {id: 'eb', type: 'expense', amount: -5, reversal: {of: 'b'}}
  ];
  const l = linkedToDelete(list, [], ['a']);
  assert.deepEqual(ids(l.reversals), ['ea']);
  assert.deepEqual(l.extraTxIds, ['ea']);
});

test('excluir: devoluções pelo payments[].txId e pelo receivableId', () => {
  const list = [
    {id: 'a', type: 'expense', amount: 10, forOther: {person: 'Ana', receivableId: 'r1'}},
    {id: 'd1', type: 'income', amount: 4, refund: true},
    {id: 'd2', type: 'income', amount: 3, refund: true, receivableId: 'r1'},
    {id: 'x', type: 'income', amount: 9}
  ];
  const recvs = [{id: 'r1', person: 'Ana', payments: [{amount: 4, txId: 'd1'}, {amount: 3, txId: 'd2'}, {amount: 1, txId: 'sumiu'}]}];
  const l = linkedToDelete(list, recvs, ['a']);
  assert.deepEqual(ids(l.receivables), ['r1']);
  assert.deepEqual(ids(l.refunds), ['d1', 'd2']);
  assert.deepEqual(l.extraTxIds, ['d1', 'd2']);
});

test('excluir parcelas: o adiantamento da compra entra, com o "A receber" dele (A4)', () => {
  const sp = {total: 100, mine: 50, people: [{person: 'Ana', receivableId: 'r1', amount: 50}]};
  const inst = n => ({group: 'g', n, total: 3, totalAmount: 100});
  const list = [
    {id: 'p1', type: 'expense', amount: 33.34, installment: inst(1), split: sp},
    {id: 'adv', type: 'expense', amount: 66.66, installmentAdvance: {group: 'g', count: 2}, split: {total: 66.66, mine: 33.32, people: [{person: 'Ana', receivableId: 'r1', amount: 33.34}]}},
    {id: 'adv2', type: 'expense', amount: 10, installmentAdvance: {group: 'outra', count: 1}},
    {id: 'eadv', type: 'expense', amount: -1, reversal: {of: 'adv'}},
    {id: 'dev', type: 'income', amount: 5, refund: true, receivableId: 'r1'}
  ];
  const l = linkedToDelete(list, [{id: 'r1', person: 'Ana'}], ['p1']);
  assert.deepEqual(ids(l.advances), ['adv']);
  assert.deepEqual(ids(l.reversals), ['eadv']);
  assert.deepEqual(ids(l.receivables), ['r1'], 'o adiantamento não segura o "A receber"');
  assert.deepEqual(ids(l.refunds), ['dev']);
  assert.deepEqual(l.extraTxIds, ['adv', 'eadv', 'dev']);
  // Sem apagar as parcelas, o adiantamento fica.
  assert.deepEqual(linkedToDelete(list, [], ['adv2']).advances, []);
});
