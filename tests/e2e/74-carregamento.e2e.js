// Tela de carregamento: aparece ao abrir e ao entrar na conta, com o Grana animado, e some sozinha (nem aparece com “reduzir movimento”).
import * as L from './lib.js';

L.run(async ({page}) => {
  const splash = () => page.evaluate(() => { const e = document.getElementById('splash'); return e ? {vis: getComputedStyle(e).display !== 'none', leaving: e.classList.contains('is-leaving'), svg: !!e.querySelector('.gr-svg'), brand: /grana\s+leve/i.test(e.textContent)} : null; });

  L.section('Com “reduzir movimento”');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-action="go-signup"]'); await L.sleep(500);
  L.ok(await splash() === null, 'quem pede menos movimento não vê a tela de carregamento (e ela sai da página)');

  L.section('Com movimento: ao abrir o site');
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#splash', {timeout: 5000});
  const a = await splash();
  L.ok(a && a.vis && a.svg && a.brand, 'a tela já está lá desde o começo, com o Grana e o nome (' + JSON.stringify(a) + ')');
  await page.waitForFunction(() => !document.getElementById('splash'), {timeout: 6000});
  L.ok(true, 'e some sozinha quando o app abriu');
  L.ok(!(await page.$eval('#viewLanding', e => e.hidden)), 'deixando a página inicial à vista');

  L.section('Com movimento: ao entrar na conta');
  await page.click('[data-action="go-signup"]');
  const email = 't' + Date.now() + '@teste.com';
  await page.type('#signupName', 'Ana Teste'); await page.type('#signupEmail', email); await page.type('#signupPassword', 'senha@123');
  await L.acceptTerms(page);
  if (await page.$('#signupStorageOk')) await page.click('#signupStorageOk');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#splash', {timeout: 5000});
  L.ok(/Entrando/.test(await L.text(page, '#splashMsg')), 'ao entrar, aparece “Entrando na sua conta…”');
  await page.waitForFunction(() => !document.getElementById('splash'), {timeout: 6000});
  L.ok(!(await page.$eval('#viewApp', e => e.hidden)), 'e depois mostra o app');
});
