import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creditDay, creditDate, nextCredit, voucherBalance, tracksCredit} from '../../js/domain/vouchers.js';
import {buildReminders, normalizeRules, REMINDER_KINDS} from '../../js/domain/reminders.js';
import {validateRecord} from '../../js/domain/validate.js';

const vr = {id: 'v1', name: 'VR', amount: 800, carryOver: true, creditDay: 5};

test('dia em que o vale cai: válido de 1 a 31, vazio quando não foi informado', () => {
  assert.equal(creditDay(vr), 5);
  assert.equal(creditDay({}), 0);
  assert.equal(creditDay({creditDay: null}), 0);
  assert.equal(creditDay({creditDay: 0}), 0);
  assert.equal(creditDay({creditDay: 32}), 0);
  assert.equal(creditDay({creditDay: '10'}), 10, 'texto numérico vale');
});

test('data em que o vale cai no mês: mês curto cai no último dia', () => {
  assert.equal(creditDate(vr, '2026-12'), '2026-12-05');
  assert.equal(creditDate({creditDay: 31}, '2026-11'), '2026-11-30');
  assert.equal(creditDate({creditDay: 30}, '2027-02'), '2027-02-28');
  assert.equal(creditDate({}, '2026-12'), '', 'sem dia, sem data');
});

test('próximo crédito: hoje conta; passou o dia, vai para o mês seguinte', () => {
  assert.deepEqual(nextCredit(vr, '2026-11-24'), {date: '2026-12-05', days: 11});
  assert.deepEqual(nextCredit(vr, '2026-12-05'), {date: '2026-12-05', days: 0});
  assert.deepEqual(nextCredit(vr, '2026-12-04'), {date: '2026-12-05', days: 1});
  assert.deepEqual(nextCredit({creditDay: 31}, '2026-12-31'), {date: '2026-12-31', days: 0});
  assert.deepEqual(nextCredit({creditDay: 31}, '2027-01-31'), {date: '2027-01-31', days: 0});
  assert.equal(nextCredit({}, '2026-11-24'), null);
});

test('aviso do vale: no dia em que cai, com antecedência opcional e sem valores', () => {
  const base = {today: '2026-12-01', horizon: 10, kinds: {voucher: true}, vouchers: [vr, {id: 'v2', name: 'Sem dia', amount: 100}]};
  let r = buildReminders(base).filter(x => x.kind === 'voucher');
  assert.equal(r.length, 1, 'só o vale que tem dia informado');
  assert.equal(r[0].date, '2026-12-05');
  assert.match(r[0].body, /O vale VR cai hoje/);
  assert.ok(!/R\$|\d+,\d{2}/.test(r[0].body), 'sem valores em reais');
  r = buildReminders({...base, lead: {voucher: 1}}).filter(x => x.kind === 'voucher');
  assert.equal(r[0].date, '2026-12-04');
  assert.match(r[0].body, /cai amanhã/);
  assert.equal(buildReminders({...base, kinds: {voucher: false}}).filter(x => x.kind === 'voucher').length, 0, 'desligado não avisa');
  assert.ok(REMINDER_KINDS.includes('voucher'));
  assert.equal(normalizeRules({}).kinds.voucher, true, 'ligado por padrão (só vale se houver vale com dia)');
});

test('validação do vale com o dia em que cai', () => {
  assert.equal(validateRecord('vouchers', {id: 'v1', name: 'VR', amount: 800, creditDay: 5}), '');
  assert.equal(validateRecord('vouchers', {id: 'v1', name: 'VR', amount: 800, creditDay: null}), '');
  assert.equal(validateRecord('vouchers', {id: 'v1', name: 'VR', amount: 800}), '', 'vales antigos continuam válidos');
  assert.match(validateRecord('vouchers', {id: 'v1', name: 'VR', amount: 800, creditDay: 40}), /dia/);
});

const gasto = (date, amount) => ({id: 'g' + date + amount, type: 'expense', paymentMethod: 'vale', voucherId: 'v1', date, amount});
const bal = (v, today, list = []) => voucherBalance(v, list, [v], today);

test('saldo segue o dia em que o vale cai (acumulando): antes do dia o crédito do mês ainda não conta', () => {
  const v = {id: 'v1', name: 'VR', amount: 800, carryOver: true, creditDay: 30, startDate: '2026-11-10'};
  assert.equal(bal(v, '2026-11-28'), 0, 'o de novembro ainda não caiu');
  assert.equal(bal(v, '2026-11-30'), 800, 'caiu no dia 30');
  assert.equal(bal(v, '2026-12-29'), 800, 'o de dezembro ainda não');
  assert.equal(bal(v, '2026-12-30', [gasto('2026-12-01', 100)]), 1500, 'dois créditos menos o gasto');
  assert.equal(bal({...v, creditDay: 5}, '2026-11-28'), 800, 'dia já passado: conta como antes');
});

test('com saldo informado, só soma o que cai depois dele', () => {
  const v = {id: 'v1', name: 'VR', amount: 800, carryOver: true, creditDay: 30, startDate: '2026-11-10', initialBalance: 120};
  assert.equal(bal(v, '2026-11-28'), 120);
  assert.equal(bal(v, '2026-11-30', [gasto('2026-11-20', 20)]), 900, '120 − 20 + 800');
  assert.equal(bal({...v, creditDay: 5}, '2026-11-28'), 120, 'o crédito do dia 5 já estava no saldo informado em 10/11');
});

test('“Já caiu” antes do dia soma na hora; “Ainda não caiu” tira o do mês mesmo depois do dia', () => {
  const v = {id: 'v1', name: 'VR', amount: 800, carryOver: true, creditDay: 30, startDate: '2026-11-10'};
  assert.equal(bal({...v, credited: {'2026-11': '2026-11-27'}}, '2026-11-28'), 800, 'caiu antes');
  assert.equal(bal({...v, credited: {'2026-11': '2026-11-27'}}, '2026-11-30'), 800, 'não soma de novo quando chega o dia');
  assert.equal(bal({...v, creditDay: 5, credited: {'2026-11': false}}, '2026-11-28'), 0, 'o dia passou mas não caiu');
  assert.equal(bal({...v, credited: {'2026-12': '2026-11-28'}}, '2026-11-28'), 800, 'o de dezembro adiantado conta já em novembro');
  assert.equal(bal({...v, credited: {'2026-11': '2026-12-02'}}, '2026-11-30'), 0, 'marcado para depois de hoje ainda não conta');
});

test('sem acúmulo: vale o último crédito que caiu, menos o gasto desde então', () => {
  const v = {id: 'v1', name: 'VR', amount: 800, carryOver: false, creditDay: 30, startDate: '2026-09-01'};
  const list = [gasto('2026-11-02', 500)];
  assert.equal(bal(v, '2026-11-28', list), 300, 'ainda é o crédito de 30/10');
  assert.equal(bal(v, '2026-11-30', list), 800, 'caiu o novo: zera e recomeça');
  assert.equal(bal({...v, credited: {'2026-11': '2026-11-27'}}, '2026-11-28', list), 800, 'caiu antes');
  assert.equal(bal({id: 'v1', name: 'VR', amount: 800, carryOver: false, creditDay: 30, startDate: '2026-11-20', initialBalance: 90}, '2026-11-28'), 90, 'saldo informado antes do próximo crédito');
});

test('sem dia informado e sem marcação, o saldo é como antes; marcar “não caiu” também funciona sem dia', () => {
  const v = {id: 'v1', name: 'VR', amount: 800, carryOver: true, startDate: '2026-11-10'};
  assert.equal(tracksCredit(v), false);
  assert.equal(bal(v, '2026-11-28'), 800);
  assert.equal(bal({...v, carryOver: false}, '2026-11-28', [gasto('2026-11-02', 100)]), 700);
  assert.equal(bal({...v, credited: {'2026-11': false}}, '2026-11-28'), 0);
});
