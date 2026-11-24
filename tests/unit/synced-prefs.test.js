import {test} from 'node:test';
import assert from 'node:assert/strict';

import {planPull} from '../../js/domain/synced-prefs.js';

const NAMES = ['workJobs', 'reminderRules'];
const jobs = nome => ({list: [{id: 'j1', name: nome, profile: {gross: 3000}}], active: 'j1'});

test('o que está na conta e é mais novo chega ao aparelho (o celular recebe o que foi preenchido no computador)', () => {
  const p = planPull({values: {workJobs: jobs('Loja'), reminderRules: {hour: 8}}, at: {workJobs: 2000, reminderRules: 2000}}, {}, {}, 9999, NAMES);
  assert.deepEqual(p.apply.map(a => [a.name, a.at]), [['workJobs', 2000], ['reminderRules', 2000]]);
  assert.equal(p.apply[0].value.list[0].name, 'Loja');
  assert.equal(p.push, false, 'nada a enviar');
});

test('o que este aparelho tem de mais novo não é trocado pelo antigo da conta', () => {
  const p = planPull({values: {workJobs: jobs('Velho')}, at: {workJobs: 1000}}, {workJobs: jobs('Novo')}, {workJobs: 5000}, 9999, NAMES);
  assert.deepEqual(p.apply, []);
  assert.equal(p.push, true, 'e o novo sobe para a conta');
});

test('cada item vale pelo seu próprio instante', () => {
  const p = planPull({values: {workJobs: jobs('Remoto'), reminderRules: {hour: 7}}, at: {workJobs: 1000, reminderRules: 3000}},
    {workJobs: jobs('Local')}, {workJobs: 9000}, 9999, NAMES);
  assert.deepEqual(p.apply.map(a => a.name), ['reminderRules'], 'as regras da conta são mais novas; o salário local é mais novo');
  assert.equal(p.push, true);
});

test('preferência antiga sem marca de hora ganha uma e sobe; conta vazia não apaga nada', () => {
  const p = planPull(null, {workJobs: jobs('Antigo')}, {}, 9999, NAMES);
  assert.deepEqual(p.apply, [], 'nada é apagado nem trocado');
  assert.deepEqual(p.stamp, [{name: 'workJobs', at: 9999}], 'ganhou a marca de hora');
  assert.equal(p.push, true);
  assert.deepEqual(planPull(null, {}, {}, 9999, NAMES), {apply: [], stamp: [], push: false}, 'sem nada dos dois lados, nada a fazer');
});
