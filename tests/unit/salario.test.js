import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inssEmployee, irrfMonthly, hourlyRate, overtimePay, netSalary, discountAmount, DISCOUNT_TYPES, TABLES} from '../../js/domain/salary.js';

test('INSS do empregado: progressivo por faixa e limitado ao teto', () => {
  assert.equal(inssEmployee(1621), 121.58, '7,5% sobre o salário mínimo');
  assert.equal(inssEmployee(3000), 248.6, '121,58 + 115,37 + 11,66');
  assert.equal(inssEmployee(6000), 641.51);
  assert.equal(inssEmployee(10000), 988.09, 'acima do teto (8.475,55) o desconto para de crescer');
  assert.equal(inssEmployee(0), 0);
});

test('imposto de renda 2026: isenção até 5 mil (redução da Lei 15.270), redução parcial até 7.350 e tabela acima', () => {
  assert.equal(irrfMonthly({gross: 3000, pension: 248.6}), 0);
  assert.equal(irrfMonthly({gross: 5000, pension: inssEmployee(5000)}), 0, 'em 5.000 o imposto da tabela (312,89) é todo abatido');
  assert.equal(irrfMonthly({gross: 6000, pension: 641.51}), 385.1, 'base 5.358,49 → 564,85 − redução de 179,75');
  assert.ok(irrfMonthly({gross: 7000, pension: inssEmployee(7000)}) < irrfMonthly({gross: 7400, pension: inssEmployee(7400)}), 'a redução some aos poucos');
  const rich = irrfMonthly({gross: 10000, pension: 988.09});
  assert.equal(rich, 1569.55, 'sem redução acima de 7.350: base 9.011,91 × 27,5% − 908,73');
  assert.ok(irrfMonthly({gross: 7000, pension: inssEmployee(7000), dependents: 2}) < irrfMonthly({gross: 7000, pension: inssEmployee(7000)}), 'dependentes baixam o imposto');
});

test('hora extra: divisor pela jornada, 50% e 100% e o reflexo no descanso semanal', () => {
  assert.equal(hourlyRate(2200, 44), 10, '44h semanais = 220 horas por mês');
  assert.equal(hourlyRate(2000, 40), 10, '40h semanais = 200 horas por mês');
  const o = overtimePay(2200, 44, 10, 4, true);
  assert.equal(o.pay50, 150, '10 h × 10 × 1,5');
  assert.equal(o.pay100, 80, '4 h × 10 × 2');
  assert.equal(o.dsr, 46, '(150 + 80) / 25 dias úteis × 5 descansos');
  assert.equal(o.total, 276);
  assert.equal(overtimePay(2200, 44, 10, 0, false).dsr, 0);
});

test('líquido por regime', () => {
  assert.equal(netSalary({regime: 'clt', gross: 3000}).net, 2751.4);
  assert.equal(netSalary({regime: 'clt', gross: 6000}).net, 4973.39);
  const ot = netSalary({regime: 'clt', gross: 3000, h50: 10, h100: 4});
  assert.ok(ot.extras > 0 && ot.net > ot.fixedNet && ot.fixedNet === 2751.4, 'com horas extras o líquido sobe; o fixo continua o mesmo');
  assert.equal(netSalary({regime: 'mei', gross: 5000, meiKind: 'services'}).net, 5000 - TABLES.mei.services);
  assert.equal(netSalary({regime: 'pj', gross: 10000}).net, 9400, 'Simples de 6%');
  assert.equal(netSalary({regime: 'estagio', gross: 1500}).net, 1500);
  assert.equal(netSalary({regime: 'outro', gross: 2000, otherPct: 10}).net, 1800);
  assert.equal(netSalary({regime: 'servidor', gross: 6000}).net, 4829.48, 'previdência de 14% + imposto com a redução');
  assert.equal(netSalary({regime: 'autonomo', gross: 4000}).net, 3200, 'INSS de 20% e imposto zerado pela redução');
  assert.equal(netSalary({regime: 'mei', gross: 5000, h50: 10}).extras, 0, 'só CLT e servidor têm hora extra');
});

test('descontos por tipo: em % ou em R$, cada empresa desconta de um jeito (o vale-transporte não é sempre 6%)', () => {
  assert.equal(discountAmount({mode: 'pct', value: 3}, 3000), 90);
  assert.equal(discountAmount({mode: 'fixed', value: 120.5}, 3000), 120.5);
  assert.ok(DISCOUNT_TYPES.some(t => t.id === 'vt') && DISCOUNT_TYPES.some(t => t.id === 'pensao'));
  assert.equal(netSalary({regime: 'clt', gross: 3000, discounts: [{type: 'vt', mode: 'pct', value: 3}]}).net, 2661.4, 'vale-transporte de 3%');
  assert.equal(netSalary({regime: 'clt', gross: 3000, discounts: [{type: 'vt', mode: 'fixed', value: 90}, {type: 'saude', mode: 'fixed', value: 120}]}).net, 2541.4, 'vale-transporte e plano de saúde somam');
  assert.equal(netSalary({regime: 'clt', gross: 3000, discounts: [{type: 'saude', mode: 'fixed', value: 0}]}).net, 2751.4, 'desconto zerado não conta');
  const pensao = netSalary({regime: 'clt', gross: 6000, discounts: [{type: 'pensao', mode: 'fixed', value: 1000}]}).net;
  const outro = netSalary({regime: 'clt', gross: 6000, discounts: [{type: 'outro', mode: 'fixed', value: 1000}]}).net;
  assert.ok(pensao > outro, 'a pensão alimentícia também reduz o imposto de renda, por isso o líquido é maior');
});

test('só o salário e os descontos fixos valem todo mês: horas extras e descontos que variam só entram no mês', () => {
  const fixo = netSalary({regime: 'clt', gross: 3000, discounts: [{type: 'vt', mode: 'pct', value: 3}]});
  assert.equal(fixo.hasVariable, false);
  assert.equal(fixo.fixedNet, fixo.net, 'sem nada variável o fixo é o próprio líquido');
  const mes = netSalary({regime: 'clt', gross: 3000, h50: 10, discounts: [{type: 'vt', mode: 'pct', value: 3}, {type: 'adiantamento', mode: 'fixed', value: 200, varies: true}]});
  assert.equal(mes.hasVariable, true);
  assert.equal(mes.fixedNet, 2661.4, 'o fixo ignora as horas extras e o adiantamento');
  assert.equal(mes.net, 2677.4, 'o líquido do mês tem as extras e o adiantamento');
  const soDesc = netSalary({regime: 'mei', gross: 5000, discounts: [{type: 'adiantamento', mode: 'fixed', value: 300, varies: true}]});
  assert.equal(soDesc.hasVariable, true);
  assert.equal(soDesc.fixedNet, 5000 - TABLES.mei.services);
  assert.equal(soDesc.net, 5000 - TABLES.mei.services - 300);
});

test('repouso das horas extras: usa os dias de trabalho e de descanso informados', () => {
  assert.equal(overtimePay(2200, 44, 10, 4, true, undefined, {workDays: 20, restDays: 10}).dsr, 115, '(150 + 80) / 20 × 10');
  assert.equal(overtimePay(2200, 44, 10, 4, true, undefined, {}).dsr, 46, 'sem informar usa 25 e 5');
  assert.equal(overtimePay(2200, 44, 10, 4, true, undefined, {workDays: 26, restDays: 0}).dsr, 0, 'sem dias de repouso não há reflexo');
  const e = netSalary({regime: 'clt', gross: 3000, h50: 10, h100: 4, workDays: 26, restDays: 4});
  assert.equal(e.lines.filter(l => l.id === 'dsr').length, 1);
});
