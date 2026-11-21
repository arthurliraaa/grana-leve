import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateJobs, activeJob, addJob, removeJob, setActive, renameJob, setProfile, ensureJob, summarizeJobs, MAX_JOBS} from '../../js/domain/jobs.js';
import {netSalary} from '../../js/domain/salary.js';

test('quem só tinha o perfil único vira um emprego principal, sem perder nada', () => {
  const legacy = {regime: 'clt', gross: 3000, discounts: [{type: 'vt', mode: 'fixed', value: 90}]};
  const s = migrateJobs({workProfile: legacy});
  assert.equal(s.list.length, 1);
  assert.deepEqual(s.list[0], {id: 'j1', name: 'Emprego principal', profile: legacy});
  assert.equal(s.active, 'j1');
  const vazio = migrateJobs({});
  assert.deepEqual(vazio.list[0].profile, {}, 'sem nada guardado: um emprego vazio');
});

test('a lista guardada vale mais que o perfil antigo e o ativo cai no primeiro se sumiu', () => {
  const s = migrateJobs({workProfile: {gross: 1}, workJobs: {list: [{id: 'j1', name: 'Loja', profile: {gross: 2000}}, {id: 'j2', name: 'Freela fixo', profile: {gross: 1000}}], active: 'j9'}});
  assert.equal(s.list.length, 2);
  assert.equal(s.active, 'j1');
  assert.equal(activeJob(s).name, 'Loja');
  assert.equal(migrateJobs({workJobs: {list: [{id: 'j2', profile: {}}], active: 'j2'}}).list[0].name, 'Emprego 1', 'nome em branco ganha um padrão');
});

test('adicionar, trocar, renomear e remover empregos', () => {
  let s = migrateJobs({workProfile: {gross: 3000}});
  s = addJob(s, '  Empresa   B  ');
  assert.deepEqual(s.list.map(j => [j.id, j.name]), [['j1', 'Emprego principal'], ['j2', 'Empresa B']], 'espaços sobrando saem');
  assert.equal(s.active, 'j2', 'o novo vira o ativo');
  s = setProfile(s, 'j2', {gross: 1500});
  s = setActive(s, 'j1');
  assert.equal(activeJob(s).id, 'j1');
  assert.equal(setActive(s, 'nao-existe').active, 'j1');
  s = renameJob(s, 'j1', 'Escola');
  assert.equal(s.list[0].name, 'Escola');
  assert.equal(renameJob(s, 'j1', '   ').list[0].name, 'Escola', 'nome vazio mantém o anterior');
  s = removeJob(s, 'j1');
  assert.deepEqual(s.list.map(j => j.id), ['j2']);
  assert.equal(s.active, 'j2');
  assert.equal(removeJob(s, 'j2').list.length, 1, 'o último emprego não sai');
  let cheio = migrateJobs({});
  for (let i = 0; i < 10; i++) cheio = addJob(cheio, '');
  assert.equal(cheio.list.length, MAX_JOBS, 'limite de empregos');
  assert.equal(addJob(migrateJobs({}), 'x').list[1].id, 'j2');
});

test('ids não se repetem depois de remover', () => {
  let s = addJob(addJob(migrateJobs({}), 'B'), 'C');
  s = removeJob(s, 'j2');
  s = addJob(s, 'D');
  assert.deepEqual(s.list.map(j => j.id), ['j1', 'j3', 'j2'], 'reaproveita o menor número livre sem colidir');
  assert.equal(ensureJob(s, 'j3', 'x').list.length, 3, 'já existe: não duplica');
  assert.equal(ensureJob(s, 'j9', 'Outro').list.length, 4);
});

test('total de todos os empregos: cada um calculado à parte e somado', () => {
  let s = migrateJobs({workProfile: {regime: 'clt', gross: 3000}});
  s = setProfile(addJob(s, 'Segundo'), 'j2', {regime: 'mei', gross: 2000, meiKind: 'services'});
  const r = summarizeJobs(s, p => { const n = netSalary(p); return {gross: n.gross, fixedNet: n.fixedNet}; });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].fixedNet, 2751.4);
  assert.equal(r.rows[1].fixedNet, 2000 - 86.05);
  assert.equal(r.gross, 5000);
  assert.equal(r.fixedNet, 2751.4 + 1913.95);
  assert.equal(r.count, 2);
  const vazio = summarizeJobs(migrateJobs({}), p => netSalary(p));
  assert.equal(vazio.fixedNet, 0);
  assert.equal(vazio.count, 0, 'emprego sem salário não conta');
});
