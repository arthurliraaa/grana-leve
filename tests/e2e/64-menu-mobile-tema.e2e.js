// Celular: o menu ⋯ abre como folha de baixo. Tema: a troca é suave e termina limpa.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1.000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 28, 5);

  L.section('Menu ⋯ no celular');
  await page.setViewport({width: 390, height: 800, isMobile: true, hasTouch: true}); await L.sleep(400);
  await L.tab(page, 'cartoes'); await L.sleep(300);
  await page.evaluate(() => document.querySelector('.credit-card .card-menu > summary').scrollIntoView({block: 'center'})); await L.sleep(200);
  const pos = await page.evaluate(() => { const r = document.querySelector('.credit-card .card-menu > summary').getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
  await page.touchscreen.tap(pos.x, pos.y); await L.sleep(350);
  L.ok(/Mais ações/.test(await L.modalTitle(page)) && await page.$$eval('#modalRoot .sheet-act', b => b.length) >= 2, 'tocar nos 3 pontinhos abre a folha “Mais ações” com as ações do cartão');
  L.ok(/Relatório do cartão/.test(await L.text(page, '#modalRoot')), 'com “Relatório do cartão” entre elas');
  await page.$$eval('#modalRoot .sheet-act', b => { const x = b.find(e => /Relatório do cartão/.test(e.textContent)); x.click(); }); await L.sleep(500);
  L.ok(/Relatório/.test(await L.modalTitle(page)), 'tocar numa ação executa (abre o relatório)');
  await L.closeModal(page);
  await page.setViewport({width: 1280, height: 900}); await L.sleep(300);

  L.section('Tema suave');
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const during = await page.evaluate(() => { document.getElementById('themeToggle').click(); return document.documentElement.classList.contains('theme-vt') || document.documentElement.classList.contains('theme-fade') || matchMedia('(prefers-reduced-motion: reduce)').matches; });
  await L.sleep(1500);
  const after = await page.evaluate(() => ({theme: document.documentElement.getAttribute('data-theme'), vt: document.documentElement.classList.contains('theme-vt'), fade: document.documentElement.classList.contains('theme-fade')}));
  L.ok(after.theme && after.theme !== before, 'o tema trocou (' + before + ' → ' + after.theme + ')');
  L.ok(during, 'durante a troca há uma transição suave (ou troca direta, para quem pediu menos movimento)');
  L.ok(!after.vt && !after.fade, 'e ela termina limpa, sem deixar estilos presos');
  await page.click('#themeToggle'); await L.sleep(1500);
  L.ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === before, 'trocar de novo volta ao tema anterior');
});
