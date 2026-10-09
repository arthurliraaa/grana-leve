import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
function jsFiles(dir){
  return readdirSync(join(ROOT, dir)).flatMap(f => {
    const p = dir + '/' + f;
    return statSync(join(ROOT, p)).isDirectory() ? jsFiles(p) : (f.endsWith('.js') ? [p] : []);
  });
}

test('o service worker guarda todos os módulos (senão o app não abre sem internet)', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/var SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of jsFiles('js')) assert.ok(shell.includes(f), f + ' falta na lista SHELL do sw.js');
  for (const f of shell) if (f.startsWith('js/')) assert.ok(statSync(join(ROOT, f)).isFile(), f + ' está no SHELL mas não existe');
});
