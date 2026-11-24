import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReminders, addDaysKey, safeAppUrl, normalizeRules, customWhen, MAX_CUSTOM} from '../../js/domain/reminders.js';

const salary = {id: 'f1', description: 'Salário', amount: 2751.4, date: '2026-11-06', recurring: true, received: {},
  salary: {rule: {type: 'workday', n: 5, saturday: true}, steps: [{from: '2026-11', gross: 3000, net: 2751.4}], months: {}}};
const card = {id: 'c1', name: 'Nubank', closingDay: 5, dueDay: 12, paidInvoices: []};
const bill = {id: 'b1', name: 'Luz', amount: 120, dueDay: 20, startMonth: '2026-01', every: 1, paid: {}};

test('datas do calendário', () => {
  assert.equal(addDaysKey('2026-11-30', 1), '2026-12-01');
  assert.equal(addDaysKey('2026-03-01', -1), '2026-02-28');
  assert.equal(addDaysKey('2026-12-31', 1), '2027-01-01');
});

test('salário: lembra no dia previsto, só no horizonte e só se ainda não foi recebido', () => {
  const kinds = {salary: true};
  const r = buildReminders({today: '2026-12-01', kinds, forecasts: [salary]});
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].key, r[0].kind, r[0].date, r[0].hour], ['salary:f1:2026-12-05', 'salary', '2026-12-05', 9]);
  assert.match(r[0].body, /Já caiu\?/);
  assert.equal(r[0].url, './#/inicio');
  assert.equal(buildReminders({today: '2026-12-01', kinds, forecasts: [salary], horizon: 2}).length, 0, 'fora do horizonte');
  const got = Object.assign({}, salary, {received: {'2026-12': 2751.4}});
  assert.equal(buildReminders({today: '2026-12-01', kinds, forecasts: [got]}).length, 0, 'já recebido');
  assert.equal(buildReminders({today: '2026-12-01', kinds: {}, forecasts: [salary]}).length, 0, 'tipo desligado');
});

test('fatura: um dia antes do vencimento, só se há o que pagar', () => {
  const tx = [{id: 't1', type: 'expense', amount: 200, date: '2026-11-20', paymentMethod: 'cartao', cardId: 'c1', category: 'compras'}];
  const r = buildReminders({today: '2026-12-10', kinds: {invoice: true}, cards: [card], transactions: tx});
  assert.deepEqual(r.map(x => [x.key, x.date, x.body]), [['invoice:c1:2026-12', '2026-12-11', 'A fatura do Nubank vence amanhã.']]);
  assert.equal(r[0].url, './#/contas');
  const paid = [Object.assign({}, card, {paidInvoices: ['2026-12']})];
  assert.equal(buildReminders({today: '2026-12-10', kinds: {invoice: true}, cards: paid, transactions: tx}).length, 0, 'fatura paga');
  assert.equal(buildReminders({today: '2026-12-10', kinds: {invoice: true}, cards: [card], transactions: []}).length, 0, 'sem compras não há o que pagar');
});

test('conta fixa: um dia antes, não repete e some se foi paga', () => {
  const r = buildReminders({today: '2026-11-17', kinds: {bill: true}, bills: [bill]});
  assert.deepEqual(r.map(x => [x.key, x.date, x.body, x.url]), [['bill:b1:2026-11', '2026-11-19', 'A conta Luz vence amanhã.', './#/lancamentos']]);
  const paid = Object.assign({}, bill, {paid: {'2026-11': {amount: 120}}});
  assert.equal(buildReminders({today: '2026-11-17', kinds: {bill: true}, bills: [paid]}).length, 0, 'conta paga');
  const skipped = Object.assign({}, bill, {paid: {'2026-11': {skipped: true}}});
  assert.equal(buildReminders({today: '2026-11-17', kinds: {bill: true}, bills: [skipped]}).length, 0, 'conta pulada neste mês');
});

test('textos nunca levam valores em reais e cabem nos limites do servidor', () => {
  const longCard = Object.assign({}, card, {name: 'N'.repeat(300)});
  const tx = [{id: 't1', type: 'expense', amount: 1234.56, date: '2026-11-20', paymentMethod: 'cartao', cardId: 'c1', category: 'compras'}];
  const r = buildReminders({today: '2026-12-10', kinds: {invoice: true, salary: true, bill: true}, cards: [longCard], transactions: tx, forecasts: [salary], bills: [bill]});
  assert.ok(r.length >= 1);
  for (const x of r){ assert.ok(x.title.length <= 80 && x.body.length <= 160 && x.key.length <= 120); assert.ok(!/R\$|\d+,\d{2}/.test(x.title + x.body)); }
});

test('só rotas do próprio app são aceitas como destino', () => {
  assert.equal(safeAppUrl('./#/contas'), './#/contas');
  assert.equal(safeAppUrl('https://golpe.exemplo.com'), './#/inicio');
  assert.equal(safeAppUrl('./#/../x'), './#/inicio');
  assert.equal(safeAppUrl(undefined), './#/inicio');
});

test('mais de um emprego: um lembrete por previsão, com o nome do emprego', () => {
  const b = Object.assign({}, salary, {id: 'f2', description: 'Salário · Escola', salary: {rule: {type: 'day', day: 10}, steps: [{from: '2026-11', gross: 2000, net: 1844.31}], months: {}, jobId: 'j2', jobName: 'Escola'}});
  const a = Object.assign({}, salary, {salary: Object.assign({}, salary.salary, {jobId: 'j1', jobName: 'Emprego principal'})});
  const r = buildReminders({today: '2026-12-01', kinds: {salary: true}, forecasts: [a, b]});
  assert.deepEqual(r.map(x => x.key), ['salary:f1:2026-12-05', 'salary:f2:2026-12-10']);
  assert.match(r[1].body, /\(Escola\)/);
  assert.match(r[0].body, /\(Emprego principal\)/);
  assert.ok(!/\(/.test(buildReminders({today: '2026-12-01', kinds: {salary: true}, forecasts: [salary]})[0].body), 'com um só, sem o nome');
});

test('avisos programáveis: antecedência, hora e avisos próprios (mensal, semanal e uma vez)', () => {
  const base = {today: '2026-12-10', horizon: 10, kinds: {bill: true}, bills: [bill], hour: 8, lead: {bill: 3}};
  const r = buildReminders(base).filter(x => x.kind === 'bill');
  assert.ok(r.length >= 1, 'a conta aparece');
  assert.equal(r[0].date, '2026-12-17', 'avisa 3 dias antes do vencimento (20/12)');
  assert.equal(r[0].hour, 8, 'na hora escolhida');
  assert.match(r[0].body, /vence em 3 dias/);

  const custom = [
    {id: 'a', type: 'expense', repeat: 'monthly', day: 31, hour: 20},
    {id: 'b', type: 'statement', repeat: 'weekly', weekday: 1, hour: 18},
    {id: 'c', type: 'custom', title: 'Pagar a escola', repeat: 'once', date: '2026-11-28', hour: 8},
    {id: 'd', type: 'expense', repeat: 'monthly', day: 25, hour: 9, enabled: false}
  ];
  const list = buildReminders({today: '2026-11-24', horizon: 10, custom});
  const by = id => list.find(x => x.key.startsWith('custom:' + id + ':'));
  assert.equal(by('a').date, '2026-11-30', 'dia 31 num mês de 30 dias cai no último dia');
  assert.equal(by('a').title, 'Lançar os gastos');
  assert.equal(by('b').date, '2026-11-30', 'toda segunda-feira (30/11 é segunda)');
  assert.equal(by('b').kind, 'statement');
  assert.equal(by('c').title, 'Pagar a escola', 'o texto é o da pessoa');
  assert.equal(by('c').hour, 8);
  assert.equal(by('d'), undefined, 'desligado não agenda');
  assert.ok(list.every(r => !/R\$|\d+,\d{2}/.test(r.body)), 'nenhum valor em reais nos textos');
});

test('regras dos avisos: limites e formato antigo', () => {
  const r = normalizeRules({lead: {invoice: 99, bill: -2}, hour: 30, custom: [{id: 'x', type: 'custom', repeat: 'once', date: 'ontem'}, {id: 'y', type: 'custom', title: 'ok', repeat: 'monthly', day: 99}]}, {salary: false});
  assert.equal(r.lead.invoice, 7, 'antecedência máxima de 7 dias');
  assert.equal(r.lead.bill, 0);
  assert.equal(r.hour, 23);
  assert.equal(r.kinds.salary, false, 'a escolha antiga dos tipos é respeitada');
  assert.equal(r.custom.length, 1, 'aviso sem data válida é descartado');
  assert.equal(r.custom[0].day, 31, 'dia do mês entre 1 e 31');
  const many = normalizeRules({custom: Array.from({length: 30}, (_, i) => ({id: 'i' + i, type: 'expense', repeat: 'monthly', day: 1}))});
  assert.equal(many.custom.length, MAX_CUSTOM, 'no máximo 10 avisos próprios');
  assert.equal(customWhen({repeat: 'monthly', day: 5, hour: 9}), 'todo dia 5 às 9h');
  assert.equal(customWhen({repeat: 'weekly', weekday: 1, hour: 18}), 'toda segunda-feira às 18h');
});
