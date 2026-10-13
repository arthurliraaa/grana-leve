import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthOthers, expenseCategoryTotals, monthTotals} from '../../js/domain/transactions.js';

// Mercado meu, ingresso pago para a Maria e jantar dividido (100 meus + 100 do João).
const list = [
  {id: 'a', type: 'expense', amount: 50, category: 'alimentacao', date: '2026-10-02'},
  {id: 'b', type: 'expense', amount: 100, category: 'lazer', date: '2026-10-03', forOther: {person: 'Maria'}},
  {id: 'c', type: 'expense', amount: 200, category: 'alimentacao', date: '2026-10-04', split: {total: 200, mine: 100, people: [{person: 'João', amount: 100}]}},
  {id: 'd', type: 'expense', amount: 80, category: 'lazer', date: '2026-10-20'}
];

test('o que é de outras pessoas no mês: pago por elas e a parte delas nas divididas', () => {
  assert.equal(monthOthers(list, '2026-10'), 200);
  assert.equal(monthOthers(list, '2026-10', '2026-10-03'), 100, 'só até a data dada');
  assert.equal(monthOthers(list, '2026-09'), 0);
});

test('“não vai devolver” vira gasto seu e sai da parte de outras pessoas (não conta duas vezes)', () => {
  const l = list.concat([{id: 'w', type: 'expense', amount: 40, category: 'lazer', date: '2026-10-05', writeOff: true, paymentMethod: null}]);
  assert.equal(monthOthers(l, '2026-10'), 160);
});

test('categorias: só o que é meu, ou tudo (inclusive o de outras pessoas)', () => {
  assert.deepEqual(expenseCategoryTotals(list, '2026-10'), {alimentacao: 150, lazer: 80});
  assert.deepEqual(expenseCategoryTotals(list, '2026-10', true), {alimentacao: 250, lazer: 180});
});

test('o total gasto é o meu mais o de outras pessoas', () => {
  const t = monthTotals(list, '2026-10', '2026-10-31');
  assert.equal(t.expense + monthOthers(list, '2026-10'), 430);
});
