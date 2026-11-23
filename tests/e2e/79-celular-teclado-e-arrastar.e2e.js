// Celular: o teclado não abre sozinho ao abrir um popup, entrar/criar conta é uma folha que se fecha arrastando para baixo,
// e o popup do + tem “É salário? Calcular o líquido” (no celular é o único formulário de lançamento).
import * as L from './lib.js';

L.run(async ({page}) => {
  await page.setViewport({width: 390, height: 800, isMobile: true, hasTouch: true});
  const swipe = (sel, from, to) => page.evaluate((sel, from, to) => {
    const el = document.querySelector(sel);
    const touch = y => new Touch({identifier: 7, target: el, clientX: 120, clientY: y});
    const fire = (type, y) => el.dispatchEvent(new TouchEvent(type, {bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch(y)], changedTouches: [touch(y)]}));
    fire('touchstart', from); fire('touchmove', from + 30); fire('touchmove', to); fire('touchend', to);
  }, sel, from, to);
  const typing = () => page.evaluate(() => { const a = document.activeElement; return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); });

  L.section('Entrar / criar conta: folha que fecha arrastando');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-action="go-signup"]', {visible: true}); await L.sleep(300);
  await page.$eval('[data-action="go-signup"]', e => e.click()); await L.sleep(500);
  L.ok(!(await page.$eval('#viewAuth', e => e.hidden)), 'a janela de criar conta abre');
  L.ok(await page.$eval('.auth-card .sheet-grip', e => getComputedStyle(e).display !== 'none'), 'com a alça no topo, como os outros popups');
  L.ok(!(await typing()), 'o teclado não abre sozinho (nenhum campo recebe o foco)');
  await swipe('.auth-head', 300, 330); await L.sleep(300);
  L.ok(!(await page.$eval('#viewAuth', e => e.hidden)), 'um arrasto curto não fecha');
  await swipe('.auth-head', 300, 540); await L.sleep(600);
  L.ok(await page.$eval('#viewAuth', e => e.hidden), 'arrastar para baixo fecha');
  await page.$eval('[data-action="go-signup"]', e => e.click()); await L.sleep(500);
  L.ok(!(await page.$eval('#viewAuth', e => e.hidden)) && await page.$eval('.auth-card', e => !e.style.transform || e.style.transform === 'none'), 'abre de novo no lugar certo (sem ficar deslocada)');
  await page.type('#signupName', 'Arthur Teste');   // quem toca no campo digita normalmente
  await page.$eval('[data-auth-close]', e => e.click()); await L.sleep(300);

  L.section('Dentro do app');
  await L.signup(page);
  await page.setViewport({width: 390, height: 800, isMobile: true, hasTouch: true});
  await page.click('#fabAdd'); await L.sleep(400);
  L.ok(!(await typing()), 'o popup do + abre sem o teclado');
  L.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('modal')), 'o foco fica na própria janela (leitores de tela continuam dentro dela)');
  await page.tap('#mAmount'); await L.sleep(100);
  L.ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'mAmount'), 'ao tocar no campo, ele recebe o foco');
  await L.closeModal(page); await L.sleep(300);

  L.section('Os outros popups também não abrem o teclado');
  await L.tab(page, 'limites'); await L.sleep(200);
  await page.$eval('#budgetManageCats', e => e.click()); await L.sleep(400);
  L.ok(!(await typing()), 'Personalizar categorias');
  await L.closeModal(page); await L.sleep(200);
  await page.$eval('#moreBtn', e => e.click()); await L.sleep(400);
  L.ok(await L.modalOpen(page) && !(await typing()), 'o menu Mais');
  await L.closeModal(page); await L.sleep(200);

  L.section('Ganho no celular: calcular o líquido do salário');
  await page.click('#fabAdd'); await L.sleep(300);
  L.ok(await page.$eval('#mSalaryLink', e => e.hidden), 'em gasto o link não aparece');
  await page.click('#mType button[data-type="income"]'); await L.sleep(200);
  L.ok(await page.$eval('#mSalaryLink', e => !e.hidden), 'em ganho aparece “É salário? Calcular o líquido”');
  await page.$eval('#mSalaryLink', e => e.click()); await L.sleep(500);
  L.ok(/Calcular o salário líquido/.test(await L.modalTitle(page)), 'abre a calculadora');
  await page.type('#scGross', '3000'); await L.sleep(500);
  await L.submitModal(page); await L.sleep(600);
  L.ok(/Novo lançamento/.test(await L.modalTitle(page)), 'volta para o lançamento');
  const v = await page.evaluate(() => ({amount: document.getElementById('mAmount').value, cat: document.getElementById('mCategory').value, income: document.querySelector('#mType .active').getAttribute('data-type')}));
  L.ok(v.income === 'income' && v.cat === 'salario' && Number(String(v.amount).replace(',', '.')) > 2000, 'já com o líquido (' + v.amount + ') como ganho de Salário');
  L.ok(!(await typing()), 'e sem abrir o teclado');
});
