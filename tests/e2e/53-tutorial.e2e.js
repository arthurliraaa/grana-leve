// Tutorial de primeiro uso: abre sozinho em conta vazia, segue passo a passo, pode ser pulado e revisto.
import * as L from './lib.js';

L.run(async ({page}) => {
  const tut = sel => L.text(page, '.tut-card ' + sel);
  const stepTitle = () => L.text(page, '#tutTitle');
  const open = async () => (await page.$('.tut-root')) !== null;

  L.section('Abre sozinho em conta nova');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); localStorage.setItem('granaleve_tutorial', 'on'); });
  const email = 'tut' + Date.now() + '@teste.com';
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-action="go-signup"]');
  await page.click('[data-action="go-signup"]');
  await page.type('#signupName', 'Tutu'); await page.type('#signupEmail', email); await page.type('#signupPassword', 'senha@123');
  await L.acceptTerms(page);
  if (await page.$('#signupStorageOk')) await page.click('#signupStorageOk');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('.tut-root', {timeout: 5000});
  L.ok(/Bem-vindo\(a\)/.test(await stepTitle()) && /Passo 1 de 8/.test(await L.text(page, '#tutCount')), 'o tutorial abre no primeiro acesso, no passo 1');
  L.ok(await page.$eval('.tut-card', el => el.getAttribute('role') === 'dialog' && el.getAttribute('aria-modal') === 'true'), 'é um diálogo acessível');
  L.ok(await page.evaluate(() => document.activeElement.getAttribute('data-tut')) === 'next', 'o foco começa no botão de avançar');
  L.ok(!(await page.$eval('.tut-card [data-tut="skip"]', el => el.hidden)), 'dá para pular desde o primeiro passo');
  L.ok(await page.$eval('[data-tut="back"]', el => el.hidden), 'no primeiro passo não há “Voltar”');

  L.section('Passo a passo');
  await page.click('[data-tut="next"]'); await L.sleep(250);
  L.ok(/Seu mês de relance/.test(await stepTitle()) && !(await page.$eval('.tut-spot', el => el.hidden)), 'passo 2: destaca os cartões do Início');
  await L.sleep(400);   // o destaque acompanha a tela enquanto ela termina de montar
  const spot = await page.$eval('.tut-spot', el => { const r = el.getBoundingClientRect(); const t = document.getElementById('summaryCards').getBoundingClientRect(); return r.left <= t.left && r.top <= t.top && r.right >= t.right && r.bottom >= t.bottom; });
  L.ok(spot, 'o destaque cobre os cartões');
  await page.click('[data-tut="next"]'); await L.sleep(250);
  L.ok(/Lançar um gasto/.test(await stepTitle()), 'passo 3: o botão +');
  await page.keyboard.press('ArrowRight'); await L.sleep(250);
  L.ok(/Para onde ir/.test(await stepTitle()), 'a seta para a direita também avança');
  await page.keyboard.press('ArrowLeft'); await L.sleep(250);
  L.ok(/Lançar um gasto/.test(await stepTitle()), 'e a seta para a esquerda volta');
  await page.click('[data-tut="back"]'); await L.sleep(200);
  L.ok(/Seu mês de relance/.test(await stepTitle()), '“Voltar” volta um passo');
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('.tut-card', el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), 'o cartão do tutorial cabe na tela');

  L.section('Pular');
  await page.keyboard.press('Escape'); await L.sleep(200);
  L.ok(!(await open()), 'Esc pula o tutorial');
  L.ok(!(await page.$eval('#viewApp', el => el.hidden)) && await page.$$eval('body > [inert]', els => els.length) === 0, 'o app volta ao normal (nada ficou bloqueado)');
  await L.reload(page); await L.sleep(500);
  L.ok(!(await open()), 'depois de pular, não abre de novo sozinho');

  L.section('Rever pelo Perfil e conta');
  await L.tab(page, 'perfil'); await L.sleep(200);
  await page.click('#profileBody [data-tutorial]'); await L.sleep(400);
  L.ok(await open() && /Bem-vindo\(a\)/.test(await stepTitle()), '“Ver o tutorial” abre de novo');
  for (let n = 0; n < 7; n++){ await page.click('.tut-card [data-tut="next"]'); await L.sleep(180); }
  L.ok(/Tudo pronto/.test(await stepTitle()) && /Passo 8 de 8/.test(await L.text(page, '#tutCount')), 'o último passo é “Tudo pronto!”');
  L.ok(/Cadastrar meu banco/.test(await tut('[data-tut="start"]')) && /Concluir/.test(await tut('[data-tut="done"]')), 'oferece cadastrar o banco ou concluir');
  await page.click('[data-tut="start"]'); await L.sleep(500);
  L.ok(!(await open()) && !(await page.$eval('#tab-cartoes', el => el.hidden)) && await page.evaluate(() => document.activeElement.id) === 'accName', 'cadastrar o banco leva a Contas e cartões, no campo do nome');

  L.section('Celular');
  await page.setViewport({width: 375, height: 780});
  await page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^granaleve_prefs_/.test(x)); const p = JSON.parse(localStorage.getItem(k) || '{}'); delete p.tutorialDone; localStorage.setItem(k, JSON.stringify(p)); });
  await L.tab(page, 'dashboard');
  await page.click('#bottomnav #moreBtn'); await L.sleep(200);
  await page.click('[data-more="tutorial"]'); await L.sleep(500);
  L.ok(await open(), 'o “Mais” do celular tem o tutorial');
  const seen = [];
  for (let n = 0; n < 8; n++){
    const info = await page.evaluate(() => { const c = document.querySelector('.tut-card').getBoundingClientRect(), s = document.querySelector('.tut-spot'), r = s.hidden ? null : s.getBoundingClientRect();
      const overlap = r && !(c.bottom <= r.top || c.top >= r.bottom || c.right <= r.left || c.left >= r.right);
      return {title: document.getElementById('tutTitle').textContent, inside: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, overlap: !!overlap}; });
    seen.push(info);
    if (n < 7){ await page.click('.tut-card [data-tut="next"]'); await L.sleep(250); }
  }
  L.ok(seen.every(x => x.inside), 'no celular, todos os passos cabem na tela');
  L.ok(seen.every(x => !x.overlap), 'e o cartão nunca cobre a parte destacada' + (seen.some(x => x.overlap) ? ' (' + seen.filter(x => x.overlap).map(x => x.title).join('; ') + ')' : ''));
  await page.click('[data-tut="done"]'); await L.sleep(200);
  L.ok(!(await open()), 'Concluir fecha o tutorial');
});
