// Gera a versão publicada em dist/: um único arquivo de JavaScript e um de CSS (minificados, com o
// hash no nome para o navegador guardar para sempre), index.html e service worker apontando para eles.
// O código-fonte (js/, css/) continua igual: é ele que roda no desenvolvimento e nos testes.
// Uso: npm run build   (o Vercel roda isto sozinho a cada publicação)
import {build} from 'esbuild';
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');

export async function buildSite(){
  rmSync(DIST, {recursive: true, force: true});
  mkdirSync(DIST, {recursive: true});

  const common = {absWorkingDir: ROOT, minify: true, legalComments: 'none', metafile: true, write: true, logLevel: 'warning'};
  // splitting: o que o app carrega só quando alguém abre (Administração, Simular, Importar extrato: import() dinâmico em
  // js/ui/shell.js) vira arquivos próprios em dist/js/chunks/; o resto fica no arquivo principal.
  const js = await build({...common, entryPoints: {app: 'js/app.js'}, bundle: true, splitting: true, format: 'esm', target: 'es2020', outdir: 'dist/js', entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]'});
  // As fontes ficam em fonts/ (copiadas abaixo); o CSS (sem bundle) só aponta para elas com ../fonts/.
  const css = await build({...common, entryPoints: {style: 'css/style.css'}, outdir: 'dist/css', entryNames: '[name]-[hash]'});
  const outputs = meta => Object.keys(meta.outputs).filter(f => !f.endsWith('.map')).map(f => f.replace(/^dist\//, ''));
  const jsFile = outputs(js.metafile).find(f => js.metafile.outputs['dist/' + f].entryPoint), cssFile = outputs(css.metafile)[0];
  const chunkFiles = outputs(js.metafile).filter(f => f !== jsFile);

  // index.html: troca o CSS e o módulo pelos arquivos com hash.
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const a = '<link rel="stylesheet" href="css/style.css">', b = '<script type="module" src="js/app.js"></script>';
  if (!html.includes(a) || !html.includes(b)) throw new Error('index.html mudou: ajuste tools/build.js');
  // Os chunks que o arquivo principal importa de cara (o código compartilhado) são pedidos junto com ele: sem isso o navegador só os
  // descobriria depois de ler o principal, uma viagem de rede a mais.
  const staticChunks = [], walk = out => (js.metafile.outputs['dist/' + out].imports || []).filter(i => i.kind === 'import-statement').forEach(i => {
    const f = i.path.replace(/^dist\//, ''); if (!staticChunks.includes(f)){ staticChunks.push(f); walk(f); } });
  walk(jsFile);
  html = html.replace(a, '<link rel="stylesheet" href="' + cssFile + '">').replace(b, staticChunks.map(f => '<link rel="modulepreload" href="' + f + '">\n').join('') + '<script type="module" src="' + jsFile + '"></script>');
  writeFileSync(join(DIST, 'index.html'), html);

  // Arquivos que vão como estão.
  cpSync(join(ROOT, 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'));
  cpSync(join(ROOT, 'icons'), join(DIST, 'icons'), {recursive: true});
  cpSync(join(ROOT, 'fonts'), join(DIST, 'fonts'), {recursive: true});
  mkdirSync(join(DIST, 'js/vendor'), {recursive: true});
  cpSync(join(ROOT, 'js/vendor'), join(DIST, 'js/vendor'), {recursive: true});

  // Service worker: guarda só o que existe na versão publicada; o nome do cache muda com o conteúdo.
  let sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shell = ['./', 'index.html', cssFile, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/outfit-latin.woff2', 'fonts/ibm-plex-sans-latin.woff2', jsFile].concat(chunkFiles, ['js/vendor/supabase.umd.js']);
  const version = (jsFile.match(/-([A-Z0-9]+)\.js$/) || [])[1] + (cssFile.match(/-([A-Z0-9]+)\.css$/) || [])[1];
  if (!/var SHELL = \[[\s\S]*?\];/.test(sw) || !/var CACHE = '[^']*';/.test(sw)) throw new Error('sw.js mudou: ajuste tools/build.js');
  sw = sw.replace(/var SHELL = \[[\s\S]*?\];/, 'var SHELL = ' + JSON.stringify(shell).replace(/"/g, "'") + ';').replace(/var CACHE = '[^']*';/, "var CACHE = 'grana-leve-" + version + "';");
  writeFileSync(join(DIST, 'sw.js'), sw);
  return {dist: DIST, jsFile, cssFile, chunkFiles, shell};
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const r = await buildSite();
  const kb = f => (readFileSync(join(r.dist, f)).length / 1024).toFixed(0) + ' KB';
  console.log('dist/ pronto:', r.jsFile, kb(r.jsFile) + ',', r.cssFile, kb(r.cssFile));
}
