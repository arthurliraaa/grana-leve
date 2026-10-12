// Previsões recolhidas no card de novo lançamento, termo da pesquisa e transições.
import * as L from './lib.js';

L.run(async ({page}) => {
  L.section('Cadastro enxuto e senha');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.click('[data-action="go-signup"]');
  L.ok(!(await page.$('#signupResearch')) && !(await page.$('#signupBirth')) && !(await page.$('.research-optin')), 'o cadastro não pede data de nascimento nem traz a caixa da pesquisa');
  L.ok(await page.$$eval('#signupPwRules li.bad', els => els.length) === 4, 'cadastro mostra as 4 regras da senha em vermelho antes de digitar');
  await page.type('#signupPassword', 'abc1');
  L.ok(await page.$$eval('#signupPwRules li.ok', els => els.map(e => e.dataset.rule).join(',')) === 'letter,number', 'regras cumpridas ficam verdes');
  L.ok(await page.$eval('#signupPassword', el => el.getAttribute('aria-describedby')) === 'signupPwRules', 'leitor de tela lê as regras junto com o campo');
  await page.$eval('#signupPassword', el => { el.value = ''; });
  const email = 'pesq' + Date.now() + '@teste.com';
  await page.evaluate((key) => localStorage.setItem('granaleve_prefs_' + key, JSON.stringify({quickEntryOff: true})), email);
  await page.type('#signupName', 'Bia'); await page.type('#signupEmail', email); await page.type('#signupPassword', 'senha@123'); await L.acceptTerms(page);
  await page.click('#signupStorageOk');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(300);
  const profile = await page.evaluate((key) => JSON.parse(localStorage.getItem('granaleve_local_db_v1')).users[key].profile, email);
  L.ok(profile.research && profile.research.consent === false && profile.terms && profile.terms.version === '1', 'a pesquisa começa desligada e o aceite dos termos fica salvo');

  L.section('Participar do estudo em “Seus dados” (opcional)');
  await page.click('#storageBtn'); await L.sleep(150);
  L.ok(/não participa/.test(await L.text(page, '#researchStatus')), 'começa sem participar');
  await page.click('#modalRoot [data-research]'); await L.sleep(200);
  await L.submitModal(page);
  L.ok(/18 anos ou mais e aceita/.test(await L.modalError(page)), 'para participar precisa marcar o aceite');
  await page.click('#modalRoot input[name=accept]');
  await L.submitModal(page); await L.sleep(150);
  const p = await page.evaluate((key) => JSON.parse(localStorage.getItem('granaleve_local_db_v1')).users[key].profile.research, email);
  L.ok(p.consent === true, 'passou a participar');

  L.section('Previsões recolhidas no card de novo lançamento');
  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#forecastPanel', el => el.hidden) && await page.$eval('#forecastToggle', el => el.getAttribute('aria-expanded')) === 'false', 'previsões começam recolhidas');
  L.ok(await page.$eval('#forecastPanel', el => !!el.closest('.card') && el.closest('.card').querySelector('h3').textContent === 'Novo lançamento'), 'ficam dentro do card de novo lançamento');
  L.ok(await page.$eval('#forecastCount', el => el.hidden), 'sem previsões, sem contador');
  await page.click('#forecastToggle'); await L.sleep(80);
  L.ok(!(await page.$eval('#forecastPanel', el => el.hidden)) && await page.evaluate(() => document.activeElement.id) === 'fcDesc', 'ícone abre o painel com foco na descrição');
  await page.type('#fcDesc', 'Salário'); await page.type('#fcAmount', '3000');
  await page.click('#forecastForm button[type=submit]'); await L.sleep(200);
  L.ok(!(await page.$eval('#forecastPanel', el => el.hidden)), 'painel continua aberto depois de adicionar');
  L.ok(await page.$eval('#forecastCount', el => !el.hidden && el.textContent === '1'), 'contador mostra 1 previsão pendente');
  L.ok(/^Previstas\s*1 a receber$/.test(await L.text(page, '#forecastToggle')), 'leitor de tela ouve “Previstas 1 a receber”');
  await page.click('[data-fc-receive]'); await L.sleep(150);
  await L.submitModal(page);
  L.ok(await page.$eval('#forecastCount', el => el.hidden), 'depois de “Recebi”, contador some');
  await page.click('#forecastToggle'); await L.sleep(80);
  L.ok(await page.$eval('#forecastPanel', el => el.hidden), 'ícone fecha o painel');

  L.section('Transições ao trocar de área');
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);
  await L.tab(page, 'metas');
  L.ok(await page.$eval('#tab-metas', el => getComputedStyle(el).animationName) === 'panelIn', 'área nova entra com animação');
  await page.click('#fabAdd'); await L.sleep(50);
  L.ok(await page.$eval('#modalRoot .modal', el => getComputedStyle(el).animationName) === 'modalIn', 'popup abre com animação');
  await L.closeModal(page);
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await L.tab(page, 'dashboard');
  L.ok(await page.$eval('#tab-dashboard', el => getComputedStyle(el).animationName) === 'none', 'quem pede menos movimento não vê animação');
});
