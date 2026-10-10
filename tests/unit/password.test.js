import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordProblem, PASSWORD_RULES} from '../../js/data/auth.js';

test('senha exige 6 caracteres, letra, número e caractere especial', () => {
  assert.match(passwordProblem('a1!'), /6 caracteres/);
  assert.match(passwordProblem('abcdef!'), /uma letra e um número/);
  assert.match(passwordProblem('123456!'), /uma letra e um número/);
  assert.match(passwordProblem('senha123'), /caractere especial/);
  assert.equal(passwordProblem('senha@123'), '');
  assert.equal(passwordProblem('Grana#2026'), '');
  for (const s of ['!', '@', '#', '$', '%', '-', '_', '.', '?', '~', '\\', '"', "'"]) assert.equal(passwordProblem('senha12' + s), '', 'aceita ' + s);
});

test('acento e espaço não contam como caractere especial (o Supabase também não conta)', () => {
  assert.match(passwordProblem('ação1234'), /caractere especial/);
  assert.match(passwordProblem('senha 123'), /caractere especial/);
});

test('regras para a lista ao vivo', () => {
  const ok = pw => PASSWORD_RULES.filter(r => r.test(pw)).map(r => r.id);
  assert.deepEqual(ok(''), []);
  assert.deepEqual(ok('abc'), ['letter']);
  assert.deepEqual(ok('abc1!'), ['letter', 'number', 'symbol']);
  assert.deepEqual(ok('abcd1!'), ['length', 'letter', 'number', 'symbol']);
});
