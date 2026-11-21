// Tira as capturas reais (celular, 2x) que alimentam o carrossel.
import {mkdirSync} from 'node:fs';
import {abrir, montarDemo} from './demo.mjs';
import {L, rolarPara, abrirChat} from './util.mjs';
const out = new URL('./brutas/', import.meta.url).pathname; mkdirSync(out, {recursive: true});
const {browser, page, errors, server} = await abrir();
await montarDemo(page);
const foto = async nome => { await L.sleep(800); await page.screenshot({path: out + nome + '.png'}); };

await L.tab(page, 'dashboard'); await foto('inicio');
// Chat: a frase vira dois lançamentos para conferir.
await abrirChat(page);
await page.type('#chatInput', 'gastei 32 no mercado e 18 de uber ontem'); await L.submitModal(page); await L.sleep(500);
await page.evaluate(() => { const log = document.getElementById('chatLog'); const msg = [...log.querySelectorAll('*')].find(e => e.children.length === 0 && /^gastei 32/.test(e.textContent)); if (msg) log.scrollTop = msg.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 12; });
await foto('chat');
await page.$eval('[data-preview-discard]', e => e.click()); await L.sleep(500); await L.closeModal(page); await L.sleep(500);
await page.$eval('#dashDetailsBtn', e => e.click()); await L.sleep(400);
await rolarPara(page, '#donutStyle', 150); await foto('graficos-rosca');
await page.$eval('[data-donut-style="blocos"]', e => e.click()); await foto('graficos-blocos');
await page.$eval('[data-donut-style="rosca"]', e => e.click());
await rolarPara(page, '#invSplitCard', 90); await foto('faturas');
await L.tab(page, 'cartoes'); await rolarPara(page, '#walletSummary', 90); await foto('cartoes');
await L.tab(page, 'metas'); await rolarPara(page, '#goalGrid', 90); await foto('metas');
await L.tab(page, 'limites'); await rolarPara(page, '.budget-summary', 100); await foto('planejar');
console.log(errors.join('\n') || 'sem erros');
await browser.close(); server.close();
