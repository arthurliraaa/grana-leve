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

test('Vercel publica o site estático sem build e sem cache velho do service worker', () => {
  assert.equal(vercel.outputDirectory, '.');
  const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf8'));
  assert.equal(pkg.scripts.build, undefined, 'sem script de build: o Vercel publica os arquivos como estão');
  const sw = vercel.headers.find(h => h.source === '/sw.js');
  assert.equal(sw.headers[0].value, 'no-cache');
  const ignore = readFileSync(ROOT + '.vercelignore', 'utf8');
  for (const p of ['node_modules', 'tests', '.github']) assert.ok(ignore.split('\n').includes(p), p + ' fora da publicação');
});
