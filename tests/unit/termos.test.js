import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ageOn, termsProblem, termsRecord, termsOk, TERMS_VERSION} from '../../js/domain/terms.js';

test('idade completa na data de hoje (aniversário ainda não chegou conta um ano a menos)', () => {
  assert.equal(ageOn('2008-10-12', '2026-10-12'), 18, 'faz 18 hoje');
  assert.equal(ageOn('2008-10-13', '2026-10-12'), 17, 'faz 18 amanhã');
  assert.equal(ageOn('1995-05-20', '2026-10-12'), 31);
  assert.equal(ageOn('2000-02-29', '2026-02-28'), 25, 'bissexto: ainda não fez');
  assert.equal(ageOn('2000-02-29', '2026-03-01'), 26);
});

test('datas inválidas, futuras ou antigas demais não têm idade', () => {
  for (const d of ['', 'abc', '2026-02-31', '2030-01-01', '1800-01-01', '2026-13-01']) assert.equal(ageOn(d, '2026-10-12'), null, d);
});

test('mensagem de problema: data, menor de idade e termos', () => {
  const t = '2026-10-12';
  assert.match(termsProblem('', true, t), /data de nascimento/);
  assert.match(termsProblem('2026-02-31', true, t), /Confira a data/);
  assert.match(termsProblem('2012-03-01', true, t), /maiores de 18 anos/);
  assert.match(termsProblem('1995-03-01', false, t), /aceite os Termos/);
  assert.equal(termsProblem('1995-03-01', true, t), '');
  assert.equal(termsProblem('2008-10-12', true, t), '', '18 anos hoje pode');
});

test('o registro guarda versão, momento e maioridade, e só vale na versão atual', () => {
  const r = termsRecord(new Date('2026-10-12T12:00:00Z'));
  assert.deepEqual(r, {version: TERMS_VERSION, at: '2026-10-12T12:00:00.000Z', adult: true});
  assert.ok(termsOk({terms: r}));
  assert.ok(!termsOk({terms: {...r, version: '0'}}));
  assert.ok(!termsOk({terms: {...r, adult: false}}));
  assert.ok(!termsOk({}) && !termsOk(null));
});
