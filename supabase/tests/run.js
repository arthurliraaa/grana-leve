// Testa as migrações do Supabase num PostgreSQL temporário (Podman ou Docker).
// Uso: npm run test:db
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const DIR = fileURLToPath(new URL('../', import.meta.url));
const engine = ['podman', 'docker'].find(e => spawnSync(e, ['--version']).status === 0);
if (!engine){ console.error('Instale Podman ou Docker para rodar os testes do banco.'); process.exit(1); }

const name = 'grana-leve-db-test-' + process.pid;
const image = process.env.PG_IMAGE || 'docker.io/library/postgres:16-alpine';
function psql(sql){
  return spawnSync(engine, ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=0', '-q'], {input: sql, encoding: 'utf8'});
}
let failed = 0;
try {
  execFileSync(engine, ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=teste', image], {stdio: 'ignore'});
  for (let i = 0; i < 60; i++){
    if (spawnSync(engine, ['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await new Promise(r => setTimeout(r, 800));
  const setup = readFileSync(DIR + 'tests/stub-supabase.sql', 'utf8') +
    readdirSync(DIR + 'migrations').filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(DIR + 'migrations/' + f, 'utf8')).join('\n');
  const s = psql('\\set ON_ERROR_STOP 1\n' + setup);
  if (s.status !== 0 || /ERROR/.test(s.stderr)){ console.error('A migração falhou:\n' + s.stderr); process.exit(1); }
  console.log('Migração aplicada.');
  const r = psql(readFileSync(DIR + 'tests/rls.test.sql', 'utf8'));
  const lines = r.stderr.split('\n')
    .map(l => l.replace(/^psql:[^:]*:\d+: /, '').replace(/^NOTICE:\s*/, ''))
    .filter(l => /^##|✓|✗|ERROR/.test(l.trim()));
  // Erros esperados são capturados por t.fails(); um ERROR solto indica um teste quebrado.
  for (const l of lines) console.log(l.startsWith('##') ? '\n' + l : l);
  const pass = lines.filter(l => l.includes('✓')).length;
  failed = lines.filter(l => l.includes('✗') || /ERROR/.test(l)).length;
  console.log('\n' + pass + ' passaram, ' + failed + ' falharam');
} finally {
  spawnSync(engine, ['rm', '-f', name], {stdio: 'ignore'});
}
process.exit(failed ? 1 : 0);
