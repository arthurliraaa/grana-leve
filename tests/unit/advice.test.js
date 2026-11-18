import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildAdvice, previousAverages} from '../../js/domain/advice.js';

const exp = (id, amount, category, date) => ({id, type: 'expense', amount, category, date, paymentMethod: 'conta', createdAt: 1});
const inc = (id, amount, date) => ({id, type: 'income', amount, category: 'salario', date, createdAt: 1});
const catName = id => ({alimentacao: 'Alimentação', lazer: 'Lazer', transporte: 'Transporte'})[id] || id;
const base = {catName, receivables: [], goals: [], nextCommitted: 0};

test('categoria passou do limite: conselho gentil com o valor e a projeção', () => {
  const tx = [exp('a', 700, 'alimentacao', '2026-11-05'), exp('b', 500, 'alimentacao', '2026-11-12')];
  const a = buildAdvice({...base, today: '2026-11-15', transactions: tx, plan: {alimentacao: 1000}});
  const o = a.find(x => x.id === 'over:alimentacao');
  assert.ok(o && o.tone === 'warn');
  assert.match(o.text, /Passou R\$\s?200,00/);
  assert.match(o.text, /ritmo/);
});

test('perto do limite (90%) mostra quanto resta por dia', () => {
  const tx = [exp('a', 920, 'lazer', '2026-11-05')];
  const a = buildAdvice({...base, today: '2026-11-20', transactions: tx, plan: {lazer: 1000}});
  const n = a.find(x => x.id === 'near:lazer');
  assert.ok(n); assert.match(n.text, /92%/); assert.match(n.text, /R\$\s?80,00/); assert.match(n.text, /10 dias/);
});

test('categoria acima da média dos meses anteriores sugere limite pela média', () => {
  const tx = [exp('o1', 300, 'lazer', '2026-10-10'), exp('o2', 300, 'lazer', '2026-09-10'), exp('o3', 300, 'lazer', '2026-08-10'), exp('n', 400, 'lazer', '2026-11-08')];
  assert.deepEqual(previousAverages(tx, '2026-11').avg, {lazer: 300});
  const a = buildAdvice({...base, today: '2026-11-10', transactions: tx, plan: {}});
  const s = a.find(x => x.id === 'spike:lazer');
  assert.ok(s, 'lazer vai a 1.200 no ritmo, bem acima de 300');
  assert.deepEqual(s.action, {type: 'limit', cat: 'lazer', amount: 300, label: 'Definir limite de ' + 'R$ 300,00'}, s.action.label);
});

test('sem limites definidos, convida a definir pelos maiores gastos', () => {
  const tx = [exp('a', 400, 'alimentacao', '2026-11-03'), exp('b', 100, 'transporte', '2026-11-04')];
  const a = buildAdvice({...base, today: '2026-11-05', transactions: tx, plan: {}});
  const n = a.find(x => x.id === 'nolimit');
  assert.ok(n); assert.match(n.text, /Alimentação e Transporte/);
});

test('saiu mais do que entrou, e sobra pequena, e boa sobra', () => {
  const day = '2026-11-20';
  let a = buildAdvice({...base, today: day, transactions: [inc('i', 1000, '2026-11-05'), exp('a', 1300, 'alimentacao', '2026-11-06')], plan: {}});
  assert.ok(a.some(x => x.id === 'savings:neg'));
  a = buildAdvice({...base, today: day, transactions: [inc('i', 1000, '2026-11-05'), exp('a', 950, 'alimentacao', '2026-11-06')], plan: {}});
  const low = a.find(x => x.id === 'savings:low');
  assert.ok(low); assert.equal(low.saving, 50, '10% de 1.000 = 100; sobrou 50; faltam 50');
  a = buildAdvice({...base, today: day, transactions: [inc('i', 1000, '2026-11-05'), exp('a', 500, 'alimentacao', '2026-11-06')], plan: {}});
  assert.ok(a.some(x => x.id === 'good:savings' && x.tone === 'good'));
  a = buildAdvice({...base, today: '2026-11-05', transactions: [inc('i', 1000, '2026-11-02'), exp('a', 1300, 'alimentacao', '2026-11-03')], plan: {}});
  assert.ok(!a.some(x => x.kind === 'savings'), 'antes do dia 10 não julga a sobra do mês');
});

test('muitos gastos pequenos, contas a receber e meta atrasada', () => {
  const smalls = Array.from({length: 9}, (_, i) => exp('s' + i, 20, 'transporte', '2026-11-0' + (1 + (i % 9))));
  const recv = [{id: 'r', person: 'Ana', totalAmount: 300, receivedAmount: 0, dueDate: '2026-11-01'}];
  const goal = {id: 'g', name: 'Viagem', targetAmount: 5000, currentAmount: 500, targetDate: '2027-01-15', yieldRate: 0, createdAt: new Date(2026, 8, 1).getTime(), moves: [{id: 'm', date: '2026-09-02', amount: 50, kind: 'deposit'}]};
  const a = buildAdvice({...base, today: '2026-11-10', transactions: smalls, plan: {}, receivables: recv, goals: [goal]});
  assert.ok(a.some(x => x.id === 'small:transporte'));
  assert.ok(a.some(x => x.id === 'receive' && /já passou/.test(x.text)));
  assert.ok(a.some(x => x.id === 'goal:g' && /por mês/.test(x.text)));
});

test('sem nada a dizer, elogia; e ordena pelo que mais pesa', () => {
  const calm = buildAdvice({...base, today: '2026-11-05', transactions: [], plan: {}});
  assert.equal(calm.length, 1); assert.equal(calm[0].tone, 'good');
  const tx = [exp('a', 1500, 'alimentacao', '2026-11-03'), exp('b', 950, 'lazer', '2026-11-04')];
  const a = buildAdvice({...base, today: '2026-11-10', transactions: tx, plan: {alimentacao: 1000, lazer: 1000}});
  assert.equal(a[0].id, 'over:alimentacao', 'quem passou vem antes de quem está perto');
});
