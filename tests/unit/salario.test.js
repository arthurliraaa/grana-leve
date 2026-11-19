import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inssEmployee, irrfMonthly, hourlyRate, overtimePay, netSalary, discountAmount, workdaysInMonth, onCallPay, thirteenth, vacation, DISCOUNT_TYPES, BONUS_TYPES, TABLES} from '../../js/domain/salary.js';

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

test('ganhos além do salário: auxílio e ajuda de custo não pagam imposto; bonificação e comissão pagam', () => {
  assert.ok(BONUS_TYPES.some(t => t.id === 'homeoffice' && t.taxable === false) && BONUS_TYPES.some(t => t.id === 'bonificacao' && t.varies));
  const ho = netSalary({regime: 'clt', gross: 3000, bonuses: [{type: 'homeoffice', mode: 'fixed', value: 150}]});
  assert.equal(ho.net, 2901.4, 'auxílio home office soma inteiro ao líquido (INSS e imposto continuam os do salário)');
  assert.equal(ho.fixedNet, 2901.4);
  assert.equal(ho.hasVariable, false, 'o auxílio é fixo, entra no líquido fixo');
  const grat = netSalary({regime: 'clt', gross: 3000, bonuses: [{type: 'gratificacao', mode: 'fixed', value: 1000}]});
  assert.equal(grat.net, 3631.4, 'gratificação entra na base do INSS: 1.000 − 120 de INSS a mais');
  const mes = netSalary({regime: 'clt', gross: 3000, bonuses: [{type: 'homeoffice', mode: 'fixed', value: 150}, {type: 'bonificacao', mode: 'fixed', value: 1000, varies: true}]});
  assert.equal(mes.hasVariable, true);
  assert.equal(mes.net, 3781.4);
  assert.equal(mes.fixedNet, 2901.4, 'a bonificação (varia) só entra no líquido do mês');
  const vale = netSalary({regime: 'clt', gross: 3000, bonuses: [{type: 'bonificacao-vale', mode: 'fixed', value: 500, varies: true}]});
  assert.equal(vale.net, 3251.4, 'bonificação em vales entra inteira, sem INSS nem imposto');
  assert.equal(vale.fixedNet, 2751.4, 'e como varia, fica fora do fixo');
  assert.equal(netSalary({regime: 'clt', gross: 3000, bonuses: [{type: 'ajuda', mode: 'pct', value: 10}]}).net, 3051.4, 'também em % do salário');
  assert.equal(netSalary({regime: 'clt', gross: 3000, bonuses: [{type: 'homeoffice', mode: 'fixed', value: 150, taxable: true}]}).net, 2901.4 - 18, 'dá para marcar que paga imposto (INSS de 12% sobre os 150)');
});

test('descontos pelo benefício: vale-transporte (até % do salário, nunca mais que o vale) e vale-refeição (% do benefício)', () => {
  assert.equal(workdaysInMonth(2026, 10), 21, 'novembro de 2026 tem 21 dias úteis (segunda a sexta)');
  assert.equal(workdaysInMonth(2026, 1), 20, 'fevereiro de 2026');
  assert.equal(discountAmount({type: 'vt', mode: 'benefit', benefit: 150, pct: 6}, 3000), 150, 'vale de 150 é menor que 6% do salário (180): desconta só os 150');
  assert.equal(discountAmount({type: 'vt', mode: 'benefit', benefit: 400, pct: 6}, 3000), 180, 'vale de 400: desconta 6% do salário');
  assert.equal(discountAmount({type: 'vt', mode: 'benefit', benefit: 400, pct: 3}, 3000), 90, 'a empresa pode descontar bem menos que 6%');
  assert.equal(discountAmount({type: 'refeicao', mode: 'benefit', benefit: 600, pct: 20}, 3000), 120, '20% do que recebeu em vale-refeição');
  assert.equal(discountAmount({type: 'refeicao', mode: 'benefit', benefit: 0, pct: 20}, 3000), 0);
  const r = netSalary({regime: 'clt', gross: 3000, discounts: [{type: 'vt', mode: 'benefit', benefit: 21 * 12, pct: 6}, {type: 'refeicao', mode: 'benefit', benefit: 600, pct: 20}]});
  assert.equal(r.net, 2751.4 - 180 - 120, 'o vale de 21 dias × R$ 12 (252) passa de 6% do salário: desconta 180; o vale-refeição, 120');
  assert.ok(r.lines.some(l => /Vale-transporte \(6% do salário, até o valor do vale\)/.test(l.label)));
});

test('desconto por dias do mês: o que foi cobrado num mês vira valor por dia e acompanha os dias do mês seguinte', () => {
  assert.equal(discountAmount({type: 'vt', mode: 'perday', charged: 21, refDays: 21, days: 20}, 3000), 20, 'R$ 21 em 21 dias = R$ 1 por dia; mês com 20 dias = R$ 20');
  assert.equal(discountAmount({type: 'vt', mode: 'perday', charged: 7, refDays: 21, days: 20}, 3000), 6.67);
  assert.equal(discountAmount({type: 'vt', mode: 'perday', charged: 7, refDays: 21}, 3000), 7, 'sem dias do mês novo vale o próprio valor cobrado');
  assert.equal(discountAmount({type: 'vt', mode: 'perday', charged: 7, refDays: 0, days: 20}, 3000), 0);
  const r = netSalary({regime: 'clt', gross: 3000, discounts: [{type: 'vt', mode: 'perday', charged: 21, refDays: 21, days: 22}]});
  assert.equal(r.net, 2751.4 - 22);
  assert.ok(r.lines.some(l => /Vale-transporte \(22 dias de uso\)/.test(l.label)));
});

test('sobreaviso (1/3 da hora normal) e FGTS (8% depositado pela empresa, fora do líquido)', () => {
  assert.equal(onCallPay(2200, 44, 30), 100, '30 h × R$ 10 × 1/3');
  assert.equal(onCallPay(2200, 44, 0), 0);
  const base = netSalary({regime: 'clt', gross: 3000});
  assert.equal(base.fgts, 240, '8% de R$ 3.000');
  assert.equal(base.net, 2751.4, 'o FGTS não entra no líquido');
  const sa = netSalary({regime: 'clt', gross: 3000, sobreaviso: 30});
  assert.equal(sa.onCall, 136.36);
  assert.equal(sa.extras, 136.36, 'o sobreaviso conta como ganho variável do mês');
  assert.ok(sa.lines.some(l => l.id === 'sobreaviso' && /Sobreaviso \(30 h\)/.test(l.label)));
  assert.equal(sa.hasVariable, true);
  assert.equal(sa.fixedNet, 2751.4, 'fora do líquido fixo');
  assert.equal(sa.net, 2871.4, 'entra na base do INSS: 136,36 − 16,36 de INSS');
  assert.equal(sa.fgts, 250.91, 'o FGTS do mês também cresce com o sobreaviso');
  assert.equal(sa.fixedFgts, 240);
  assert.equal(netSalary({regime: 'servidor', gross: 3000}).fgts, 0, 'servidor estatutário não tem FGTS');
  assert.equal(netSalary({regime: 'mei', gross: 3000}).fgts, 0);
  assert.equal(netSalary({regime: 'mei', gross: 3000, sobreaviso: 30}).onCall, 0, 'só CLT e servidor');
});

test('13º salário: 1ª parcela sem descontos, INSS e imposto só na 2ª, tributado à parte do salário', () => {
  const t = thirteenth({regime: 'clt', gross: 3000});
  assert.equal(t.total, 3000);
  assert.equal(t.first, 1500, 'metade, sem descontos');
  assert.equal(t.inss, 248.6, 'INSS sobre o 13º inteiro');
  assert.equal(t.irrf, 0, 'até 5 mil o imposto zera (Lei 15.270)');
  assert.equal(t.second, 1251.4, '3.000 − 1.500 − 248,60');
  assert.equal(t.net, 2751.4);
  assert.equal(t.fgts, 240, '8% depositado pela empresa');
  assert.equal(thirteenth({regime: 'clt', gross: 3000, thirdMonths: 6}).total, 1500, 'só 6 meses trabalhados: 6/12');
  assert.equal(thirteenth({regime: 'clt', gross: 3000, varAvg: 300}).total, 3300, 'a média das extras entra');
  assert.equal(thirteenth({regime: 'clt', gross: 8000}).irrf, 1037.85, 'acima de 7.350 não há redução: o imposto sai da tabela, com o INSS abatido');
  assert.equal(thirteenth({regime: 'servidor', gross: 3000, rpps: 14}).inss, 420, 'servidor: previdência em %');
  assert.equal(thirteenth({regime: 'servidor', gross: 3000}).fgts, 0);
  assert.equal(thirteenth({regime: 'mei', gross: 3000}), null, 'só CLT e servidor');
});

test('férias: dias gozados + 1/3, abono pecuniário isento e FGTS sobre o que é salário', () => {
  const v = vacation({regime: 'clt', gross: 3000});
  assert.equal(v.days, 30);
  assert.equal(v.pay, 3000);
  assert.equal(v.third, 1000);
  assert.equal(v.taxable, 4000);
  assert.equal(v.inss, 368.6);
  assert.equal(v.irrf, 0);
  assert.equal(v.net, 3631.4);
  assert.equal(v.fgts, 320, '8% sobre férias + 1/3');
  const half = vacation({regime: 'clt', gross: 3000, vacDays: 15});
  assert.equal(half.pay, 1500);
  assert.equal(half.third, 500);
  const sell = vacation({regime: 'clt', gross: 3000, vacSell: true});
  assert.equal(sell.days, 20, 'vendendo 10 dias sobram 20 para gozar');
  assert.equal(sell.abono, 1333.33, '10 dias + 1/3, sem desconto');
  assert.equal(sell.taxable, 2666.67);
  assert.equal(sell.net, 3784.31);
  assert.equal(vacation({regime: 'clt', gross: 3000, vacSell: true, vacDays: 30}).days, 20, 'o máximo continua 20 com o abono');
  assert.equal(vacation({regime: 'autonomo', gross: 3000}), null);
});
