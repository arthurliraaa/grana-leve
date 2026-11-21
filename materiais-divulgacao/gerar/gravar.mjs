// Grava, na conta de demonstração, os trechos de tela (celular, 2x) usados no vídeo.
import {mkdirSync} from 'node:fs';
import {abrir, montarDemo} from './demo.mjs';
import {L, rolarPara} from './util.mjs';
const out = new URL('./clipes/', import.meta.url).pathname; mkdirSync(out, {recursive: true});
const {browser, page, errors, server} = await abrir();
await montarDemo(page);

// Marca cada toque com um círculo que some, para quem assiste acompanhar o que foi tocado.
await page.evaluate(() => {
  const css = document.createElement('style');
  css.textContent = '.toque{position:fixed;z-index:99999;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(14,107,92,.35);border:2px solid rgba(14,107,92,.8);pointer-events:none;animation:toque .55s ease-out forwards}@keyframes toque{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}';
  document.head.appendChild(css);
  addEventListener('pointerdown', e => { const d = document.createElement('div'); d.className = 'toque'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, true);
});
const toque = async sel => {
  const p = await page.$eval(sel, el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
  await page.mouse.move(p.x, p.y, {steps: 6}); await L.sleep(120); await page.mouse.click(p.x, p.y); 
};
const suave = async (sel, folga) => { await rolarPara(page, sel, folga, true); await L.sleep(900); };
const gravar = async (nome, roteiro) => {
  const rec = await page.screencast({path: out + nome + '.mp4', scale: 2, fps: 30});
  await L.sleep(500); await roteiro(); await L.sleep(700); await rec.stop();
  console.log('gravado', nome);
};

// 1) Chat: a frase vira lançamentos para conferir; só depois salva.
await L.tab(page, 'dashboard'); await L.sleep(600);
await gravar('chat', async () => {
  await L.sleep(300);
  await toque('#fabAdd'); await L.sleep(550);
  await toque('[data-m-chat]'); await L.sleep(650);
  await page.focus('#chatInput');
  await page.keyboard.type('gastei 32 no mercado e 18 de uber ontem', {delay: 55}); await L.sleep(350);
  await toque('#modalRoot .modal-actions button[type=submit]'); await L.sleep(900);
  // Mostra a mensagem e o primeiro item; depois desce até o botão de salvar.
  await page.evaluate(() => { const log = document.getElementById('chatLog'); const msg = [...log.querySelectorAll('*')].find(e => e.children.length === 0 && /^gastei 32/.test(e.textContent)); if (msg) log.scrollTo({top: msg.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 12, behavior: 'smooth'}); });
  await L.sleep(1500);
  await page.evaluate(() => document.querySelector('[data-preview-save]').scrollIntoView({block: 'center', behavior: 'smooth'}));
  await L.sleep(1300);
  await toque('[data-preview-save]'); await L.sleep(1400);
});
await L.closeModal(page); await L.sleep(500);
console.log('transações', (await L.db(page)).transactions.length, 'modal aberto:', await L.modalOpen(page));
await page.evaluate(() => window.scrollTo(0, 0));

// 2) Início e gráficos do mês.
await L.tab(page, 'dashboard'); await L.sleep(500);
await gravar('inicio', async () => {
  await L.sleep(1100);
  await page.evaluate(() => window.scrollTo({top: 300, behavior: 'smooth'})); await L.sleep(900);
  await page.$eval('#dashDetailsBtn', e => e.scrollIntoView({block: 'center'})); await L.sleep(200);
  await toque('#dashDetailsBtn'); await L.sleep(700);
  await suave('#donutStyle', 150); await L.sleep(500);
  await toque('[data-donut-style="pizza"]'); await L.sleep(900);
  await toque('[data-donut-style="blocos"]'); await L.sleep(1000);
  await toque('[data-donut-style="rosca"]'); await L.sleep(700);
  await suave('#dashNav', 80);
  await toque('#dashPrev'); await L.sleep(1000);
  await toque('#dashPrev'); await L.sleep(1000);
  await toque('#dashToday'); await L.sleep(1100);
});
await page.evaluate(() => window.scrollTo(0, 0));

// 3) Cartões: faturas e o que sobra.
await gravar('cartoes', async () => {
  await page.evaluate(() => { location.hash = '#/contas'; }); await L.sleep(1200);
  await suave('#walletSummary', 90); await L.sleep(1300);
  await page.evaluate(() => { location.hash = '#/inicio'; }); await L.sleep(900);
  await suave('#invSplitCard', 90); await L.sleep(1500);
});

// 4) Metas.
await gravar('metas', async () => {
  await page.evaluate(() => { location.hash = '#/metas'; }); await L.sleep(500);
  await suave('#goalGrid', 90); await L.sleep(1300);
  await page.evaluate(() => window.scrollBy({top: 240, behavior: 'smooth'})); await L.sleep(1800);
});
console.log(errors.join('\n') || 'sem erros');
await browser.close(); server.close();
