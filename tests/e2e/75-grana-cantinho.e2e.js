// O Grana no cantinho de toda tela: animado, com dicas, sem ocupar a barra principal e com opção de descanso.
import * as L from './lib.js';

L.run(async ({page}) => {
  await page.evaluateOnNewDocument(() => { localStorage.setItem('granaleve_grana', 'on'); });   // este teste liga o Grana do cantinho
  const rect = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height}; });
  const hiddenNow = () => page.$eval('#granaCorner', e => e.hidden).catch(() => true);

  L.section('Dentro do app');
  await L.signup(page);
  await L.sleep(300);
  L.ok(!(await hiddenNow()), 'o Grana está no cantinho do Início');
  let r = await rect('#granaCorner .gr-corner-btn');
  L.ok(r.w > 40 && r.w < 100 && r.r <= 1280 && r.b <= 900, 'é pequeno (' + Math.round(r.w) + ' px) e fica dentro da tela');
  const fab = await rect('#fabAdd');
  L.ok(r.b <= fab.t + 2 || r.r <= fab.l || r.l >= fab.r, 'e não cobre o botão + de lançar');
  for (const tab of ['lancamentos', 'cartoes', 'limites', 'metas', 'perfil']){
    await L.tab(page, tab); await L.sleep(150);
    if (await hiddenNow()){ L.ok(false, 'o Grana some em ' + tab); }
  }
  L.ok(!(await hiddenNow()), 'e continua no cantinho em Ganhos e gastos, Contas, Planejar, Metas e Perfil');
  await L.tab(page, 'lancamentos');
  await page.waitForFunction(() => { const b = document.getElementById('granaCornerBubble'); return b && !b.hidden && b.textContent.length > 10; }, {timeout: 9000}).catch(() => {});
  const dica = await L.text(page, '#granaCornerBubble');
  L.ok(dica.length > 10, 'depois de uns segundos ele fala uma dica (“' + dica.replace(/×$/, '').slice(0, 60) + '…”)');
  await page.$eval('#granaCornerBubble', e => e.click()); await L.sleep(800);
  L.ok(/Converse com o Grana/.test(await L.modalTitle(page)), 'tocar na dica abre a conversa');
  L.ok(await page.$eval('#granaCorner', e => getComputedStyle(e).display) === 'none', 'com um pop-up aberto o Grana sai da frente');
  await L.closeModal(page); await L.sleep(300);

  L.section('Descanso');
  await page.$eval('#granaCorner [data-gr-hide]', e => e.click()); await L.sleep(300);
  L.ok(await hiddenNow(), 'o botão × manda o Grana descansar');
  await L.reload(page); await L.sleep(400);
  L.ok(await hiddenNow(), 'e a escolha vale nas próximas aberturas');
  await L.tab(page, 'perfil'); await L.sleep(200);
  await page.$eval('#pfCorner', e => e.click()); await L.sleep(300);
  L.ok(!(await hiddenNow()), 'em Perfil dá para chamar o Grana de volta');

  L.section('Celular');
  await page.setViewport({width: 375, height: 760, isMobile: true}); await L.sleep(300);
  await L.tab(page, 'dashboard'); await L.sleep(300);
  r = await rect('#granaCorner .gr-corner-btn');
  const nav = await rect('#bottomnav');
  L.ok(r.b <= nav.t + 2 && r.r <= 375 && r.w < 80, 'no celular ele fica acima da barra de baixo, sem cobri-la');
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');

  L.section('Página inicial (sem conta)');
  await page.setViewport({width: 1280, height: 900});
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#meetGrana .gr-svg'); await L.sleep(500);
  await page.evaluate(() => window.scrollTo(0, 0)); await L.sleep(400);
  L.ok(!(await hiddenNow()), 'na página inicial ele também aparece no cantinho');
  await page.$eval('#meetGrana', e => e.scrollIntoView({block: 'center'})); await L.sleep(600);
  L.ok(await hiddenNow(), 'e sai do cantinho quando o Grana grande está à vista');
});
