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
  const js = await build({...common, entryPoints: {app: 'js/app.js'}, bundle: true, format: 'esm', target: 'es2020', outdir: 'dist/js', entryNames: '[name]-[hash]'});
  // As fontes ficam em fonts/ (copiadas abaixo); o CSS (sem bundle) só aponta para elas com ../fonts/.
  const css = await build({...common, entryPoints: {style: 'css/style.css'}, outdir: 'dist/css', entryNames: '[name]-[hash]'});
  const only = meta => Object.keys(meta.outputs).filter(f => !f.endsWith('.map'))[0].replace(/^dist\//, '');
  const jsFile = only(js.metafile), cssFile = only(css.metafile);

  // index.html: troca o CSS e o módulo pelos arquivos com hash.
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const a = '<link rel="stylesheet" href="css/style.css">', b = '<script type="module" src="js/app.js"></script>';
  if (!html.includes(a) || !html.includes(b)) throw new Error('index.html mudou: ajuste tools/build.js');
  html = html.replace(a, '<link rel="stylesheet" href="' + cssFile + '">').replace(b, '<script type="module" src="' + jsFile + '"></script>');
  writeFileSync(join(DIST, 'index.html'), html);

  // Arquivos que vão como estão.
  cpSync(join(ROOT, 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'));
  cpSync(join(ROOT, 'icons'), join(DIST, 'icons'), {recursive: true});
  cpSync(join(ROOT, 'fonts'), join(DIST, 'fonts'), {recursive: true});
  mkdirSync(join(DIST, 'js/vendor'), {recursive: true});
  cpSync(join(ROOT, 'js/vendor'), join(DIST, 'js/vendor'), {recursive: true});

  // Service worker: guarda só o que existe na versão publicada; o nome do cache muda com o conteúdo.
  let sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shell = ['./', 'index.html', cssFile, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/outfit-latin.woff2', 'fonts/ibm-plex-sans-latin.woff2', jsFile, 'js/vendor/supabase.umd.js'];
  const version = (jsFile.match(/-([A-Z0-9]+)\.js$/) || [])[1] + (cssFile.match(/-([A-Z0-9]+)\.css$/) || [])[1];
  if (!/var SHELL = \[[\s\S]*?\];/.test(sw) || !/var CACHE = '[^']*';/.test(sw)) throw new Error('sw.js mudou: ajuste tools/build.js');
  sw = sw.replace(/var SHELL = \[[\s\S]*?\];/, 'var SHELL = ' + JSON.stringify(shell).replace(/"/g, "'") + ';').replace(/var CACHE = '[^']*';/, "var CACHE = 'grana-leve-" + version + "';");
  writeFileSync(join(DIST, 'sw.js'), sw);
  return {dist: DIST, jsFile, cssFile, shell};
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const r = await buildSite();
  const kb = f => (readFileSync(join(r.dist, f)).length / 1024).toFixed(0) + ' KB';
  console.log('dist/ pronto:', r.jsFile, kb(r.jsFile) + ',', r.cssFile, kb(r.cssFile));
}
