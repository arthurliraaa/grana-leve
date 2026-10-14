import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));
const html = readFileSync(ROOT + 'index.html', 'utf8');

test('a política de segurança do Vercel é a mesma do index.html (mais frame-ancestors)', () => {
  const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const header = vercel.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.equal(header, meta + "; frame-ancestors 'none'");
});

test('Vercel gera o site com npm run build, publica dist/ e guarda os arquivos com hash para sempre', () => {
  assert.equal(vercel.outputDirectory, 'dist');
  assert.equal(vercel.buildCommand, 'npm run build');
  const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf8'));
  assert.equal(pkg.scripts.build, 'node tools/build.js');
  assert.ok(pkg.devDependencies.esbuild, 'esbuild é dependência de desenvolvimento (o Vercel instala antes do build)');
  const sw = vercel.headers.find(h => h.source === '/sw.js');
  assert.equal(sw.headers[0].value, 'no-cache');
  for (const src of ['/js/app-(.*)', '/css/style-(.*)']) assert.match(vercel.headers.find(h => h.source === src).headers[0].value, /immutable/, src + ' com cache longo (o nome muda quando o conteúdo muda)');
  assert.equal(vercel.headers.find(h => h.source === '/(index.html)?').headers[0].value, 'no-cache', 'o index.html nunca fica velho');
  const ignore = readFileSync(ROOT + '.vercelignore', 'utf8').split('\n');
  for (const p of ['node_modules', 'tests', '.github']) assert.ok(ignore.includes(p), p + ' fora da publicação');
  assert.ok(!ignore.includes('tools') && !ignore.includes('js') && !ignore.includes('css'), 'o que o build precisa não pode ficar de fora');
});
