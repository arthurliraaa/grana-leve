import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryUsage, splitByUsage, suggestCategory, expenseCats} from '../../js/domain/categories.js';
import {categoryFromText} from '../../js/domain/parser.js';

const tx = [
  {type: 'expense', category: 'alimentacao', date: '2026-10-01', description: 'Mercado da semana'},
  {type: 'expense', category: 'alimentacao', date: '2026-10-05', description: 'mercado'},
  {type: 'expense', category: 'lazer', date: '2026-07-01', description: 'Pipoca'},
  {type: 'expense', category: 'transporte', date: '2026-10-07', description: 'Uber'},
  {type: 'expense', category: 'compras', date: '2026-10-08', description: 'Estorno', reversal: {of: 'x'}},
  {type: 'expense', category: 'dividas', date: '2026-10-08', description: 'Pagamento', outsideTotals: true},
  {type: 'income', category: 'salario', date: '2026-10-05', description: 'Salário'}
];
const ids = expenseCats([]).map(c => c.id);
const kw = t => categoryFromText(t, 'expense');

test('uso das categorias: conta por tipo, desde uma data, sem estornos nem o que fica fora dos totais', () => {
  assert.deepEqual(categoryUsage(tx, 'expense', '2026-09-01'), {alimentacao: {count: 2, last: '2026-10-05'}, transporte: {count: 1, last: '2026-10-07'}});
  assert.deepEqual(Object.keys(categoryUsage(tx, 'expense')).sort(), ['alimentacao', 'lazer', 'transporte']);
  assert.deepEqual(Object.keys(categoryUsage(tx, 'income')), ['salario']);
});

test('mais usadas primeiro (por quantidade e depois pela mais recente); as outras na ordem de sempre', () => {
  const g = splitByUsage(expenseCats([]), categoryUsage(tx, 'expense'), 2);
  assert.deepEqual(g.used.map(c => c.id), ['alimentacao', 'transporte']);
  assert.equal(g.others[0].id, 'moradia');
  assert.ok(g.others.some(c => c.id === 'lazer'), 'passou do limite: vai para as outras');
  assert.deepEqual(splitByUsage(expenseCats([]), {}).used, [], 'sem histórico, nada em “mais usadas”');
});

test('sugestão pela descrição: primeiro o histórico, depois palavras conhecidas', () => {
  assert.equal(suggestCategory('mercado', 'expense', tx, ids, kw), 'alimentacao');
  assert.equal(suggestCategory('Pipoca', 'expense', tx, ids, kw), 'lazer', 'aprende com o que já foi lançado');
  assert.equal(suggestCategory('farmácia', 'expense', tx, ids, kw), 'saude', 'palavra conhecida');
  assert.equal(suggestCategory('Uber pra casa', 'expense', tx, ids, kw), 'transporte', 'começo igual a um lançamento antigo');
  assert.equal(suggestCategory('ab', 'expense', tx, ids, kw), '', 'texto curto demais não sugere');
  assert.equal(suggestCategory('lojinha', 'expense', tx, ids, kw), '', 'sem pista, não inventa');
  assert.equal(suggestCategory('Pipoca', 'expense', tx, ids.filter(i => i !== 'lazer'), kw), '', 'categoria que não existe mais não é sugerida');
});
