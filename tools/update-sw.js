// Atualiza a lista de arquivos guardados pelo service worker (sw.js) com todos os módulos de js/
// e troca a versão do cache, para que quem já instalou o app receba a versão nova.
// Uso: npm run sw:update
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
function jsFiles(dir){
  return readdirSync(join(ROOT, dir)).flatMap(f => {
    const p = dir + '/' + f;
    return statSync(join(ROOT, p)).isDirectory() ? jsFiles(p) : (f.endsWith('.js') ? [p] : []);
  }).sort();
}
const swPath = join(ROOT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/\n  'js\/[^\]]*\];/, "\n  '" + jsFiles('js').join("', '") + "'];");
sw = sw.replace(/var CACHE = 'grana-leve-v(\d+)';/, (m, n) => "var CACHE = 'grana-leve-v" + (Number(n) + 1) + "';");
writeFileSync(swPath, sw);
console.log('sw.js atualizado:', jsFiles('js').length, 'módulos,', sw.match(/grana-leve-v\d+/)[0]);
