import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nthWorkday, payDate, ruleLabel, stepFor, amountFor, changePct, evolution, raises, withStep} from '../../js/domain/salary-plan.js';
import {forecastOccurrences} from '../../js/domain/forecasts.js';

test('enésimo dia útil: sábado conta (Súmula 381), domingo não; sem feriados', () => {
  assert.equal(nthWorkday(2026, 10, 5, true), 6, 'novembro de 2026: 2, 3, 4, 5 e 6 → sexta, dia 6');
  assert.equal(nthWorkday(2026, 11, 5, false), 7, 'só segunda a sexta: 1, 2, 3, 4 e 7');
  assert.equal(nthWorkday(2026, 11, 5, true), 5, 'com sábado: 1, 2, 3, 4 e 5');
  assert.equal(nthWorkday(2026, 1, 40, true), 28, 'passou do mês: cai no último dia');
});

test('data do salário pela regra e rótulo', () => {
  assert.equal(payDate({type: 'day', day: 15}, '2026-11'), '2026-11-15');
  assert.equal(payDate({type: 'day', day: 31}, '2026-11'), '2026-11-30', 'mês curto: último dia');
  assert.equal(payDate({type: 'workday', n: 5, saturday: true}, '2026-12'), '2026-12-05');
  assert.equal(ruleLabel({type: 'workday', n: 5}), 'no 5º dia útil');
  assert.equal(ruleLabel({type: 'day', day: 15}), 'todo dia 15');
});

test('reajustes: o valor de cada mês segue o passo vigente', () => {
  const plan = {rule: {type: 'day', day: 5}, steps: [{from: '2026-01', gross: 3000, net: 2751.4}, {from: '2026-07', gross: 3300, net: 3000}]};
  assert.equal(amountFor(plan, '2026-03'), 2751.4);
  assert.equal(amountFor(plan, '2026-07'), 3000);
  assert.equal(amountFor(plan, '2025-12'), 2751.4, 'antes do primeiro passo vale o primeiro');
  assert.equal(stepFor(plan, '2026-12').gross, 3300);
  assert.deepEqual(raises(plan), [{from: '2026-07', before: 3000, after: 3300, pct: 10, net: 3000}]);
  assert.equal(changePct(3000, 3300), 10);
  const same = withStep(plan, '2026-08', 3300, 3000);
  assert.equal(same.steps.length, 2, 'nada mudou: não cria passo novo');
  const changed = withStep(plan, '2026-09', 3300, 2950);
  assert.equal(changed.steps.length, 3);
  assert.equal(amountFor(changed, '2026-10'), 2950);
});

test('evolução do que foi recebido mês a mês, com o reajuste marcado', () => {
  const plan = {months: {'2026-08': {gross: 3000, net: 2751.4}, '2026-09': {gross: 3300, net: 3000, extras: 100}, '2026-10': {gross: 3300, net: 3100}}};
  const e = evolution(plan);
  assert.deepEqual(e.map(r => r.key), ['2026-08', '2026-09', '2026-10']);
  assert.equal(e[0].raise, false);
  assert.equal(e[1].raise, true);
  assert.equal(e[1].grossChange, 10);
  assert.equal(e[1].netChange, 9);
  assert.equal(e[2].raise, false);
  assert.equal(e[2].netChange, 3.3);
});

test('a previsão do salário usa a regra e os reajustes em cada mês; previsões comuns seguem iguais', () => {
  const sal = {id: 'a', description: 'Salário', amount: 2751.4, date: '2026-11-06', recurring: true, received: {},
    salary: {rule: {type: 'workday', n: 5, saturday: true}, steps: [{from: '2026-11', gross: 3000, net: 2751.4}, {from: '2027-01', gross: 3300, net: 3000}]}};
  const comum = {id: 'b', description: 'Freela', amount: 500, date: '2026-11-20', recurring: false, received: {}};
  const nov = forecastOccurrences([sal, comum], '2026-11');
  assert.equal(nov.length, 2);
  assert.equal(nov[0].date, '2026-11-06');
  assert.equal(nov[0].f.amount, 2751.4);
  assert.equal(nov[1].date, '2026-11-20');
  assert.equal(nov[1].f, comum);
  const jan = forecastOccurrences([sal], '2027-01')[0];
  assert.equal(jan.f.amount, 3000, 'depois do reajuste o valor sobe');
  assert.equal(jan.date, '2027-01-06', 'janeiro de 2027: 2 (sábado conta) → 1 é feriado ignorado: 1(sex),2(sáb),4,5,6 → dia 6');
  assert.equal(sal.amount, 2751.4, 'a previsão original não é alterada');
});
