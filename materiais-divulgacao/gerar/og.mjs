// Imagem de pré-visualização do link (LinkedIn, WhatsApp...): 1200×630, em icons/og-image.png.
import {readFileSync} from 'node:fs';
import {L} from './util.mjs';
const aqui = new URL('./', import.meta.url).pathname;
const img = nome => 'data:image/png;base64,' + readFileSync(aqui + 'brutas/' + nome + '.png').toString('base64');
const logo = `<svg width="64" height="64" viewBox="0 0 48 48"><rect width="48" height="48" rx="15" fill="#0E6B5C"/><path d="M14 33c4-15 13-23 27-25-2 14-10 23-25 27m2-3 14-13" transform="translate(-10 -2) scale(.95)" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
const pagina = `<!doctype html><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=IBM+Plex+Sans:wght@500;600&display=swap');
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;overflow:hidden;background:#F7F5EF;position:relative;font-family:'IBM Plex Sans',Arial,sans-serif;color:#123E35}
.b{position:absolute;border-radius:50%}.b1{width:560px;height:560px;right:-120px;top:-200px;background:#E1EFE9}.b2{width:380px;height:380px;left:-120px;bottom:-190px;background:#F3EBD9}
.marca{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:18px;font:700 44px Outfit;letter-spacing:-.6px}.marca b{color:#0E6B5C}
h1{position:absolute;left:72px;top:168px;width:600px;font:700 66px/1.05 Outfit;letter-spacing:-2px}
p{position:absolute;left:72px;top:400px;width:560px;font:500 28px/1.35 'IBM Plex Sans';color:#3F5A53}
.fone{position:absolute;right:92px;top:70px;width:300px;background:#123E35;border-radius:50px;padding:10px;transform:rotate(4deg);box-shadow:0 30px 60px -24px rgba(18,62,53,.5)}
.tela{overflow:hidden;border-radius:41px;height:640px}.tela img{width:100%;display:block}
.pill{position:absolute;left:72px;bottom:52px;background:#0E6B5C;color:#fff;font:700 28px Outfit;padding:14px 26px;border-radius:18px}
</style><body><div class="b b1"></div><div class="b b2"></div>
<div class="marca">${logo}<span>grana <b>leve</b></span></div>
<h1>Seu dinheiro em ordem, sem planilha e sem susto.</h1>
<p>Controle financeiro gratuito, nascido de um projeto de extensão universitária.</p>
<div class="fone"><div class="tela"><img src="${img('inicio')}"></div></div>
<div class="pill">grana-leve.vercel.app</div></body>`;
const {browser, page} = await L.launch();
await page.setViewport({width: 1200, height: 630, deviceScaleFactor: 1});
await page.setContent(pagina, {waitUntil: 'load', timeout: 60000});
await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 10000))]));
await L.sleep(500);
await page.screenshot({path: aqui + '../../icons/og-image.png'});
await browser.close();
