import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Uma chave aberta a mais no CSS faz o navegador ignorar tudo o que vem depois, sem erro nenhum.
test('o CSS tem as chaves equilibradas', () => {
  const css = readFileSync(new URL('../../css/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""');
  let depth = 0, line = 1;
  for (const c of css){
    if (c === '\n') line++;
    if (c === '{') depth++;
    if (c === '}'){ depth--; assert.ok(depth >= 0, 'chave fechada sem abrir perto da linha ' + line); }
  }
  assert.equal(depth, 0, 'há ' + depth + ' chave(s) aberta(s) sem fechar');
});
