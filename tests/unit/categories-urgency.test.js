import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expenseCats, incomeCats, categoryNameProblem, isDefaultCategory, DEFAULT_EMOJI} from '../../js/domain/categories.js';
import {byUrgency, urgencyOf, urgencyLabel} from '../../js/domain/urgency.js';
import {validateRecord} from '../../js/domain/validate.js';

test('categorias padrão têm emoji e cor', () => {
  assert.ok(expenseCats([]).every(c => c.emoji && c.color && c.isDefault));
  assert.ok(incomeCats([]).every(c => c.emoji && c.color));
  assert.equal(expenseCats([]).find(c => c.id === 'alimentacao').emoji, '🍽️');
});

test('personalizar uma padrão troca nome, cor e emoji sem duplicar', () => {
  const custom = [{id: 'alimentacao', type: 'expense', label: 'Comida', emoji: '🍕', color: '#123456', isDefault: true}];
  const cats = expenseCats(custom);
  assert.equal(cats.filter(c => c.id === 'alimentacao').length, 1);
  const a = cats.find(c => c.id === 'alimentacao');
  assert.deepEqual([a.label, a.emoji, a.color, a.isDefault], ['Comida', '🍕', '#123456', true]);
  assert.equal(cats.length, expenseCats([]).length);
});

test('categoria criada ganha emoji padrão e entra depois das padrão', () => {
  const cats = expenseCats([{id: 'x1', type: 'expense', label: 'Pets', color: '#2a9d8f'}, {id: 'x2', type: 'income', label: 'Aluguel recebido'}]);
  assert.equal(cats[cats.length - 1].label, 'Pets');
  assert.equal(cats[cats.length - 1].emoji, DEFAULT_EMOJI);
  assert.ok(!cats.some(c => c.label === 'Aluguel recebido'));
  assert.equal(isDefaultCategory('moradia'), true);
  assert.equal(isDefaultCategory('x1'), false);
});

test('nome repetido considera o nome personalizado', () => {
  const custom = [{id: 'alimentacao', type: 'expense', label: 'Comida', isDefault: true}];
  assert.match(categoryNameProblem('comida', 'expense', custom), /Já existe/);
  assert.equal(categoryNameProblem('Alimentação', 'expense', custom), '');
  assert.equal(categoryNameProblem('Comida', 'expense', custom, 'alimentacao'), '');
});

test('urgência: sem escolha conta como média; ordena alta, média, baixa', () => {
  const list = [{n: 'b', urgency: 'baixa'}, {n: 'm'}, {n: 'a', urgency: 'alta'}, {n: 'm2', urgency: 'media'}];
  assert.equal(urgencyOf({}), 'media');
  assert.equal(urgencyOf({urgency: 'xyz'}), 'media');
  assert.deepEqual(byUrgency(list, (x, y) => x.n.localeCompare(y.n)).map(x => x.n), ['a', 'm', 'm2', 'b']);
  assert.equal(urgencyLabel('alta'), 'Alta');
  assert.equal(list[0].n, 'b'); // não altera a lista original
});

test('validação aceita emoji/cor e urgência válidos', () => {
  assert.equal(validateRecord('categories', {id: 'c', label: 'Pets', type: 'expense', emoji: '🐶', color: '#2a9d8f'}), '');
  assert.equal(validateRecord('debts', {id: 'd', name: 'Cartão', totalAmount: 100, urgency: 'alta'}), '');
  assert.equal(validateRecord('debts', {id: 'd', name: 'Cartão', totalAmount: 100, urgency: 'urgentíssima'}), 'dívida inválida');
});
