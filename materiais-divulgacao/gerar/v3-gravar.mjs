// Grava, no app real (conta de demonstração fictícia, modo local), os trechos de tela do vídeo das novidades (celular, 2x).
// Tudo o que aparece é calculado pelo próprio app; só os dados de exemplo (nomes, valores lançados) são inventados.
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {abrir, montarDemo} from './demo.mjs';
import {L, rolarPara} from './util.mjs';

const out = new URL('./clipes-v3/', import.meta.url).pathname; mkdirSync(out, {recursive: true});
const {browser, page, errors, server} = await abrir();

// Círculo verde em cada toque, para quem assiste acompanhar.
const marcarToques = () => page.evaluate(() => {
  if (document.getElementById('toqueCss')) return;
  const css = document.createElement('style'); css.id = 'toqueCss';
  css.textContent = '.toque{position:fixed;z-index:99999;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(14,107,92,.35);border:2px solid rgba(14,107,92,.8);pointer-events:none;animation:toque .55s ease-out forwards}@keyframes toque{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}';
  document.head.appendChild(css);
  addEventListener('pointerdown', e => { const d = document.createElement('div'); d.className = 'toque'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, true);
});
const toque = async sel => {
  const p = await page.$eval(sel, el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
  await page.mouse.move(p.x, p.y, {steps: 6}); await L.sleep(120); await page.mouse.click(p.x, p.y);
};
const suave = async (sel, folga) => { await rolarPara(page, sel, folga, true); await L.sleep(900); };
// SO=importar,salario regrava só esses trechos (os outros ficam como estão).
const so = process.env.SO ? process.env.SO.split(',') : null;
const gravar = async (nome, roteiro) => {
  if (so && !so.includes(nome)){ console.log('pulado', nome); return; }
  const rec = await page.screencast({path: out + nome + '.mp4', scale: 2, fps: 30});
  await L.sleep(500); await roteiro(); await L.sleep(700); await rec.stop();
  console.log('gravado', nome);
};
const digitar = async (sel, texto) => { await page.focus(sel); await page.keyboard.type(texto, {delay: 55}); await L.sleep(300); };

/* ---------- 1) O Grana, na página inicial (ainda sem conta) ---------- */
await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
await page.waitForSelector('#meetGrana .gr-svg'); await L.sleep(500); await marcarToques();
await gravar('grana', async () => {
  await L.sleep(400);
  await suave('#meetGrana', 80); await L.sleep(500);
  await toque('[data-gr-poke]'); await L.sleep(1300);
  await suave('.grana-chatbox', 70);
  for (const pergunta of ['como anoto uma despesa?', 'posso subir o csv do meu banco?', 'quanto sobra do meu salario depois do inss']){
    await digitar('#meetGrana .gr-form input', pergunta);
    await toque('#meetGrana [data-gr-send]'); await L.sleep(2200);
    await page.evaluate(() => { const l = document.querySelector('#meetGrana .gr-log'); l.scrollTo({top: l.scrollHeight, behavior: 'smooth'}); }); await L.sleep(500);
  }
});

/* ---------- Conta de demonstração ---------- */
await montarDemo(page); await marcarToques();
// O salário deste mês será confirmado no vídeo: tira o lançamento de exemplo do mês para não ficar duplicado.
await L.patchDb(page, `var m = new Date().toISOString().slice(0, 7); u.transactions = u.transactions.filter(function(t){ return !(t.category === 'salario' && String(t.date).slice(0, 7) === m); });`, {});
await marcarToques();

/* ---------- 2) Importar extrato (OFX) ---------- */
const hoje = new Date(), d = n => { const x = new Date(hoje.getFullYear(), hoje.getMonth(), Math.max(1, hoje.getDate() - n)); return x.getFullYear() + String(x.getMonth() + 1).padStart(2, '0') + String(x.getDate()).padStart(2, '0'); };
const itens = [[1, -86.40, 'SUPERMERCADO ESTRELA', ''], [1, -42.50, 'IFOOD RESTAURANTE', ''], [2, -63.20, 'FARMACIA SAO JOAO', ''], [3, -58.00, 'INGRESSO CINEMA', ''], [3, -39.90, 'NETFLIX', ''], [4, 150.00, 'PIX RECEBIDO MARIA', ''], [5, -18.90, 'UBER TRIP', '']];
const ofx = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0260<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST>\n' +
  itens.map(([dias, v, nome, memo], i) => `<STMTTRN><TRNTYPE>${v < 0 ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${d(dias)}<TRNAMT>${v.toFixed(2)}<FITID>demo${i}<NAME>${nome}${memo ? '<MEMO>' + memo : ''}</STMTTRN>`).join('\n') + '\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
const arquivoOfx = tmpdir() + '/extrato-nubank.ofx'; writeFileSync(arquivoOfx, ofx, 'latin1');
await L.tab(page, 'lancamentos'); await L.sleep(500);
await gravar('importar', async () => {
  await L.sleep(500);
  await suave('#importStmtBtn', 150); await L.sleep(300);
  await toque('#importStmtBtn'); await L.sleep(1300);
  const campo = await page.$('#isFile'); await campo.uploadFile(arquivoOfx); await L.sleep(1500);
  await toque('#isReview'); await L.sleep(1400);
  await page.evaluate(() => { const l = document.querySelector('.is-list'); l.scrollTo({top: 140, behavior: 'smooth'}); }); await L.sleep(1800);
  await page.evaluate(() => document.getElementById('isGo').scrollIntoView({block: 'center', behavior: 'smooth'})); await L.sleep(900);
  await toque('#isGo'); await L.sleep(1800);
});
await page.evaluate(() => window.scrollTo(0, 0));

/* ---------- 3) Salário líquido (calculadora) ---------- */
await L.tab(page, 'lancamentos'); await L.sleep(500);
await gravar('salario', async () => {
  await L.sleep(400);
  await suave('#forecastToggle', 150);
  await toque('#forecastToggle'); await L.sleep(900);
  await suave('[data-salary-calc="fcAmount"]', 200);
  await toque('[data-salary-calc="fcAmount"]'); await L.sleep(1100);
  await digitar('#scGross', '4900'); await L.sleep(1300);
  await toque('.sc-sec[data-sec="disc"] summary'); await L.sleep(700);
  await toque('[data-add-disc]'); await L.sleep(500);
  await page.$eval('#scDiscList .sc-d-mode', e => { e.value = 'pct'; e.dispatchEvent(new Event('change', {bubbles: true})); }); await L.sleep(300);
  await digitar('#scDiscList .sc-d-value', '3'); await L.sleep(1100);
  await page.evaluate(() => document.querySelector('.sc-extra').scrollIntoView({block: 'start', behavior: 'smooth'})); await L.sleep(700);
  await toque('.sc-extra summary'); await L.sleep(1200);
  await page.evaluate(() => document.getElementById('scExtraRes').scrollIntoView({block: 'start', behavior: 'smooth'})); await L.sleep(2200);
});
await L.closeModal(page); await L.sleep(500);

/* ---------- 4) “Já caiu?”: o salário previsto todo mês ---------- */
await L.tab(page, 'dashboard'); await L.sleep(900);
await gravar('caiu', async () => {
  await L.sleep(500);
  await suave('[data-salary-open]', 160);
  await toque('[data-salary-open]'); await L.sleep(1500);
  await toque('#modalRoot [type=submit]'); await L.sleep(2200);
  await digitar('#scSa', '8'); await L.sleep(900);
  await page.evaluate(() => document.getElementById('scResult').scrollIntoView({block: 'start', behavior: 'smooth'})); await L.sleep(1800);
  await page.evaluate(() => document.getElementById('scCaiu').scrollIntoView({block: 'center', behavior: 'smooth'})); await L.sleep(900);
  await toque('#modalRoot [type=submit]'); await L.sleep(1800);
});

/* ---------- 5) Grana no Início, novidades e o tema que se espalha ---------- */
await L.tab(page, 'dashboard'); await page.evaluate(() => window.scrollTo(0, 0)); await L.sleep(1500);
await gravar('tema', async () => {
  await L.sleep(1800);
  await suave('#newsCard', 90); await L.sleep(500);
  await toque('[data-news-open]'); await L.sleep(1500);
  await page.evaluate(() => { const b = document.querySelector('.wn-body'); b.scrollTo({top: 220, behavior: 'smooth'}); }); await L.sleep(1800);
  await toque('#modalRoot [type=submit]'); await L.sleep(700);
  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'smooth'})); await L.sleep(900);
  await toque('#themeToggle'); await L.sleep(1900);
  await page.evaluate(() => window.scrollTo({top: 260, behavior: 'smooth'})); await L.sleep(1500);
  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'smooth'})); await L.sleep(800);
  await toque('#themeToggle'); await L.sleep(1800);
});
console.log(errors.join('\n') || 'sem erros');
await browser.close(); server.close();
