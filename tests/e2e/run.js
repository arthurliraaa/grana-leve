// Roda todos os testes E2E (arquivos *.e2e.js) com um servidor local próprio, vários arquivos ao mesmo tempo.
// Uso: npm run test:e2e   |   npm run test:e2e -- 25 52   |   CHROME_PATH=/caminho/do/chrome npm run test:e2e
// E2E_JOBS=1 roda um por vez (útil para depurar); E2E_REALDATE=1 usa a data de hoje em vez do relógio fixo (ver lib.js).
import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {cpus} from 'node:os';
import {fileURLToPath} from 'node:url';
import {startServer} from './server.js';

const dir = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5510);
const only = process.argv.slice(2);
const files = readdirSync(dir).filter(f => f.endsWith('.e2e.js') && (!only.length || only.some(o => f.includes(o)))).sort();
const jobs = Math.max(1, Math.min(files.length, Number(process.env.E2E_JOBS) || Math.min(4, Math.max(1, Math.floor(cpus().length / 4)))));
const server = await startServer(port);
const failedFiles = [];
let next = 0;

function runFile(f){
  return new Promise(resolve => {
    const out = [];
    const p = spawn(process.execPath, [dir + f], {stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, BASE: 'http://127.0.0.1:' + port + '/'}});
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => out.push(d));
    p.on('exit', code => resolve({f, code, text: Buffer.concat(out).toString()}));
  });
}
// Cada arquivo imprime o resultado inteiro de uma vez (sem misturar com os outros).
async function worker(){
  while (next < files.length){
    const r = await runFile(files[next++]);
    process.stdout.write('\n=== ' + r.f + ' ===\n' + r.text);
    if (r.code !== 0) failedFiles.push(r.f);
  }
}
await Promise.all(Array.from({length: jobs}, worker));
server.close();
console.log('\n' + (failedFiles.length ? failedFiles.length + ' arquivo(s) com falha: ' + failedFiles.sort().join(', ') + '.' : 'Todos os testes E2E passaram.'));
process.exit(failedFiles.length ? 1 : 0);
