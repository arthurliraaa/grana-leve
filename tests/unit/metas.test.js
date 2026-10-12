import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthlyRate, futureValue, monthlyNeeded, monthsToTarget, goalSummary, goalForecast, goalMoves, monthsUntil, dateAfterMonths, simulate} from '../../js/domain/goals.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` (${a} vs ${b})`);

test('taxa: 10% ao ano vira a taxa do mês que, composta 12 vezes, dá 10%', () => {
  const r = monthlyRate(10);
  close(Math.pow(1 + r, 12) - 1, 0.10, 1e-12);
  close(r * 100, 0.7974, 0.0001, 'cerca de 0,797% ao mês');
  assert.equal(monthlyRate(0), 0);
  assert.equal(monthlyRate(null), 0);
});

test('saldo futuro (fórmula) bate com a simulação mês a mês', () => {
  for (const [C, P, a, n] of [[1000, 200, 10, 12], [0, 150, 6, 36], [5000, 0, 12, 24], [250, 80, 0, 7]]){
    close(futureValue(C, P, monthlyRate(a), n), simulate(C, P, monthlyRate(a), n), 0.05 * n, `C=${C} P=${P} ${a}% n=${n}`);
  }
  assert.equal(futureValue(1000, 200, 0, 5), 2000, 'sem rendimento: soma simples');
});

test('quanto guardar por mês para chegar no prazo: guardando isso, chega exatamente', () => {
  const r = monthlyRate(10), P = monthlyNeeded(5000, 1000, r, 14);
  close(futureValue(1000, P, r, 14), 5000, 1e-6);
  assert.ok(P < (5000 - 1000) / 14, 'com rendimento, precisa guardar menos que sem');
  assert.equal(monthlyNeeded(5000, 1000, 0, 10), 400);
  assert.equal(monthlyNeeded(1000, 2000, 0, 10), 0, 'já passou da meta');
  assert.equal(monthlyNeeded(5000, 4800, monthlyRate(12), 24), 0, 'só o rendimento já basta');
});

test('meses até a meta: guardando P, chega em n meses (e nunca, se não guarda nem rende)', () => {
  const r = monthlyRate(10), n = monthsToTarget(5000, 1000, 300, r);
  close(futureValue(1000, 300, r, n), 5000, 1e-6);
  assert.equal(monthsToTarget(5000, 1000, 400, 0), 10);
  assert.equal(monthsToTarget(5000, 1000, 0, 0), Infinity);
  assert.equal(monthsToTarget(5000, 0, 0, r), Infinity);
  assert.equal(monthsToTarget(5000, 6000, 0, 0), 0);
  close(monthsToTarget(2000, 1000, 0, r), Math.log(2) / Math.log(1 + r), 1e-9, 'só rendendo: dobra o dinheiro');
});

const base = {targetAmount: 5000, currentAmount: 1600, targetDate: '2027-10-11', yieldRate: 10, createdAt: new Date(2026, 5, 1).getTime()};
const moves = [{id: 1, date: '2026-08-05', amount: 500, kind: 'deposit'}, {id: 2, date: '2026-09-05', amount: 500, kind: 'deposit'},
  {id: 3, date: '2026-10-05', amount: 500, kind: 'deposit'}, {id: 4, date: '2026-10-06', amount: 100, kind: 'yield'}];

test('ritmo: média por mês de calendário; o mês atual só conta depois do depósito', () => {
  assert.equal(goalSummary({...base, moves}, '2026-10-11').pace, 500);
  assert.equal(goalSummary({...base, moves: moves.slice(0, 2)}, '2026-10-03').pace, 500, 'dia 3, sem depósito ainda: não derruba a média');
  assert.equal(goalSummary({...base, moves: [{id: 1, date: '2026-10-11', amount: 300, kind: 'deposit'}]}, '2026-10-11').pace, 300);
  const withOut = goalSummary({...base, moves: moves.concat([{id: 5, date: '2026-10-08', amount: 300, kind: 'withdraw'}])}, '2026-10-11');
  assert.equal(withOut.pace, 400, 'retirada desconta do ritmo');
  assert.equal(goalSummary({...base, moves}, '2026-10-11').earned, 100);
  assert.equal(goalSummary({...base, moves}, '2026-10-11').deposited, 1500);
});

test('meta antiga (sem histórico): o que já estava guardado vira um depósito inicial, fora do ritmo', () => {
  const m = goalMoves(base);
  assert.equal(m.length, 1); assert.equal(m[0].amount, 1600); assert.ok(m[0].legacy);
  assert.equal(goalSummary(base, '2026-10-11').pace, 0);
});

test('previsão completa da meta', () => {
  const f = goalForecast({...base, moves}, '2026-10-11');
  assert.equal(f.left, 3400);
  assert.equal(f.deadlineMonths, 12);
  close(futureValue(1600, f.needed, monthlyRate(10), 12), 5000, 0.2, 'guardando o necessário, chega no prazo');
  assert.ok(f.onTrack, 'R$ 500/mês passa de R$ ' + f.needed);
  // monthsToGo vem arredondado para 0,1 mês (uns R$ 56 nesse ritmo).
  close(futureValue(1600, 500, monthlyRate(10), f.monthsToGo), 5000, 60, 'data de conclusão coerente com o ritmo');
  assert.equal(f.finishDate.slice(0, 7), '2027-04', 'ln(67703/64303)/ln(1,00797) ≈ 6,5 meses depois de 11/10');
  assert.ok(goalForecast({...base, currentAmount: 6000}, '2026-10-11').done);
  const late = goalForecast({...base, yieldRate: 0, moves: [{id: 1, date: '2026-10-01', amount: 100, kind: 'deposit'}]}, '2026-10-11');
  assert.equal(late.onTrack, false);
  assert.equal(late.atDeadline, 1600 + 100 * 12);
});

test('datas: meses até o prazo e data daqui a n meses', () => {
  assert.equal(monthsUntil('2026-10-15', '2026-12-15'), 2);
  close(monthsUntil('2026-10-11', '2026-10-26'), 0.5, 0.01);
  assert.equal(monthsUntil('2026-10-11', '2026-01-01'), 0, 'prazo passado: 0');
  assert.equal(dateAfterMonths('2026-10-11', 3), '2027-01-11');
  assert.equal(dateAfterMonths('2026-10-11', 1.5), '2026-11-26');
});
