import {test} from 'node:test';
import assert from 'node:assert/strict';
import {termsProblem, termsRecord, termsOk, TERMS_VERSION} from '../../js/domain/terms.js';

test('mensagem de problema: só pede o aceite dos termos', () => {
  assert.match(termsProblem(false), /aceite os Termos/);
  assert.equal(termsProblem(true), '');
});

test('o registro guarda versão e momento, e só vale na versão atual', () => {
  const r = termsRecord(new Date('2026-10-12T12:00:00Z'));
  assert.deepEqual(r, {version: TERMS_VERSION, at: '2026-10-12T12:00:00.000Z'});
  assert.ok(termsOk({terms: r}));
  assert.ok(!termsOk({terms: {...r, version: '0'}}));
  assert.ok(!termsOk({}) && !termsOk(null));
});

test('contas antigas, que aceitaram com a confirmação de idade, continuam valendo', () => {
  assert.ok(termsOk({terms: {version: TERMS_VERSION, at: '2026-10-01T00:00:00Z', adult: true}}));
});
