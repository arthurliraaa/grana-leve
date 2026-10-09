// Roda todos os testes E2E (arquivos *.e2e.js) com um servidor local próprio.
// Uso: npm run test:e2e   |   CHROME_PATH=/caminho/do/chrome npm run test:e2e
import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startServer} from './server.js';

const dir = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5510);
const only = process.argv.slice(2);
const files = readdirSync(dir).filter(f => f.endsWith('.e2e.js') && (!only.length || only.some(o => f.includes(o)))).sort();
const server = await startServer(port);
let failed = 0;
for (const f of files){
  console.log('\n=== ' + f + ' ===');
  const code = await new Promise(resolve => {
    const p = spawn(process.execPath, [dir + f], {stdio: 'inherit', env: {...process.env, BASE: 'http://127.0.0.1:' + port + '/'}});
    p.on('exit', resolve);
  });
  if (code !== 0) failed++;
}
server.close();
console.log('\n' + (failed ? failed + ' arquivo(s) com falha.' : 'Todos os testes E2E passaram.'));
process.exit(failed ? 1 : 0);
