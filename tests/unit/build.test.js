import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildSite} from '../../tools/build.js';

test('o build junta o app em um JavaScript e um CSS com hash (com partes sob demanda em chunks), e o service worker guarda só o que existe', async () => {
  const r = await buildSite();
  const html = readFileSync(join(r.dist, 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="' + r.jsFile + '"></script>'));
  assert.ok(/<link rel="modulepreload" href="js\/chunks\/chunk-[A-Z0-9]+\.js">/.test(html), 'o código compartilhado é pedido junto com o principal (modulepreload)');
  assert.ok(html.includes('<link rel="stylesheet" href="' + r.cssFile + '">'));
  assert.ok(!html.includes('js/app.js') && !html.includes('css/style.css'), 'nada do código-fonte solto');
  assert.match(r.jsFile, /^js\/app-[A-Z0-9]+\.js$/);
  // Nenhum módulo solto do código-fonte: as únicas importações relativas são para os chunks que o próprio build gerou.
  for (const f of [r.jsFile, ...r.chunkFiles]){
    const code = readFileSync(join(r.dist, f), 'utf8');
    for (const m of code.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)){
      const target = join(r.dist, 'js', f.startsWith('js/chunks/') ? 'chunks' : '', m[1]);
      assert.ok(/chunk-[A-Z0-9]+\.js$/.test(m[1]) && existsSync(join(r.dist, 'js', 'chunks', m[1].split('/').pop())) || existsSync(target), f + ' importa ' + m[1] + ', que precisa ser um chunk existente');
    }
  }
  for (const nome of ['admin', 'simulator', 'import-statement', 'salary-plan']){
    assert.ok(r.chunkFiles.some(f => f.startsWith('js/chunks/' + nome + '-')), nome + ' é uma parte sob demanda: vira arquivo próprio (se sumiu, algum módulo carregado de cara passou a importá-lo de forma estática; use withPart)');
  }
  const localRefs = [...html.matchAll(/(?:src|href)="((?!https?:|data:|#)[^"]+)"/g)].map(m => m[1]);
  for (const f of localRefs) assert.ok(existsSync(join(r.dist, f)), f + ' referenciado no index.html existe em dist/');
  const sw = readFileSync(join(r.dist, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/var SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell.filter(x => x !== './')) assert.ok(existsSync(join(r.dist, f)), f + ' está no SHELL e existe em dist/');
  assert.ok(shell.includes(r.jsFile) && shell.includes(r.cssFile) && shell.includes('js/vendor/supabase.umd.js'));
  for (const f of r.chunkFiles) assert.ok(shell.includes(f), f + ' (chunk) precisa estar no SHELL para o app abrir sem internet');
  assert.ok(sw.includes("var CACHE = 'grana-leve-" + r.jsFile.match(/-([A-Z0-9]+)\./)[1]), 'o nome do cache muda quando o código muda');
  assert.ok(!existsSync(join(r.dist, 'tests')) && !existsSync(join(r.dist, 'supabase')), 'só o site vai para dist/');
});
