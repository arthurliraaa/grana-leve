import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildSite} from '../../tools/build.js';

test('o build junta tudo em um JavaScript e um CSS com hash, e o service worker guarda só o que existe', async () => {
  const r = await buildSite();
  const html = readFileSync(join(r.dist, 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="' + r.jsFile + '"></script>'));
  assert.ok(html.includes('<link rel="stylesheet" href="' + r.cssFile + '">'));
  assert.ok(!html.includes('js/app.js') && !html.includes('css/style.css'), 'nada do código-fonte solto');
  assert.match(r.jsFile, /^js\/app-[A-Z0-9]+\.js$/);
  const bundle = readFileSync(join(r.dist, r.jsFile), 'utf8');
  assert.ok(!/(from|import)\s*["']\.{1,2}\//.test(bundle), 'sem importações de módulos soltos: está tudo dentro do arquivo');
  const localRefs = [...html.matchAll(/(?:src|href)="((?!https?:|data:|#)[^"]+)"/g)].map(m => m[1]);
  for (const f of localRefs) assert.ok(existsSync(join(r.dist, f)), f + ' referenciado no index.html existe em dist/');
  const sw = readFileSync(join(r.dist, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/var SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell.filter(x => x !== './')) assert.ok(existsSync(join(r.dist, f)), f + ' está no SHELL e existe em dist/');
  assert.ok(shell.includes(r.jsFile) && shell.includes(r.cssFile) && shell.includes('js/vendor/supabase.umd.js'));
  assert.ok(sw.includes("var CACHE = 'grana-leve-" + r.jsFile.match(/-([A-Z0-9]+)\./)[1]), 'o nome do cache muda quando o código muda');
  assert.ok(!existsSync(join(r.dist, 'tests')) && !existsSync(join(r.dist, 'supabase')), 'só o site vai para dist/');
});
