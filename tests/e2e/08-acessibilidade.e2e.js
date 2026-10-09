// Acessibilidade: auditoria automática (axe-core, WCAG 2.1 AA) e uso só com teclado.
import * as L from './lib.js';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

L.run(async ({page}) => {
  async function audit(where){
    await page.evaluate(axeSource);
    const v = await page.evaluate(async () => (await window.axe.run(document, {runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']})).violations
      .map(x => x.id + ' (' + x.nodes.slice(0, 2).map(n => n.target.join(' ')).join('; ') + ')'));
    L.ok(v.length === 0, 'sem problemas de acessibilidade: ' + where + (v.length ? ' → ' + v.join(' | ') : ''));
  }

  L.section('Auditoria automática (axe-core)');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'domcontentloaded'}); await L.sleep(300);
  await audit('apresentação');
  await page.click('[data-action="go-signup"]'); await L.sleep(100);
  await audit('cadastro');
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '100'); await page.click('#accountForm button[type=submit]'); await L.sleep(150);
  await page.type('#accName', 'Itaú'); await page.type('#accBalance', '50'); await page.click('#accountForm button[type=submit]'); await L.sleep(150);
  await L.addCard(page, 'Inter', 1000, 3, 10);
  for (let i = 0; i < 5; i++) await L.addTx(page, {amount: 10 + i, category: 'alimentacao'});
  for (const theme of ['light', 'dark']){
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    for (const t of ['dashboard', 'lancamentos', 'cartoes', 'limites', 'metas', 'dividas', 'receber', 'aprenda', 'conexoes']){
      await L.tab(page, t);
      await audit((theme === 'dark' ? 'escuro' : 'claro') + ' · ' + t);
    }
    await page.click('#fabAdd'); await L.sleep(150);
    await audit(theme + ' · popup de lançamento');
    await page.click('[data-m-chat]'); await L.sleep(150);
    await page.type('#chatInput', 'gastei 30 no mercado e 45 na lojinha'); await L.submitModal(page); await L.sleep(150);
    await audit(theme + ' · prévia do chat');
    await page.click('#chatLog [data-preview-discard]'); await L.sleep(100);
    await L.closeModal(page);
    await page.click('#storageBtn'); await L.sleep(150);
    await audit(theme + ' · seus dados e backup');
    await L.closeModal(page);
    await L.tab(page, 'cartoes');
    await page.click('#transferBtn'); await L.sleep(150);
    await audit(theme + ' · transferência');
    await L.closeModal(page);
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

  L.section('Teclado: menu e Compromissos');
  await L.tab(page, 'dashboard');
  L.ok(await page.$eval('.sidenav [data-tab="dashboard"]', el => el.getAttribute('aria-current')) === 'page', 'item atual do menu marcado com aria-current');
  await page.focus('.sidenav [data-tab="metas"]');
  await page.keyboard.press('Enter'); await L.sleep(120);
  L.ok(!(await page.$eval('#tab-metas', el => el.hidden)) && await page.evaluate(() => location.hash) === '#/metas', 'Enter no menu abre a área e muda o endereço');
  await page.evaluate(() => history.back()); await L.sleep(200);
  L.ok(!(await page.$eval('#tab-dashboard', el => el.hidden)) && await page.evaluate(() => location.hash) === '#/inicio', 'Voltar do navegador volta para o Início');
  await page.evaluate(() => history.forward()); await L.sleep(200);
  L.ok(!(await page.$eval('#tab-metas', el => el.hidden)), 'Avançar volta para Metas');
  await L.tab(page, 'dividas');
  await page.focus('#segbtn-dividas');
  await page.keyboard.press('ArrowRight'); await L.sleep(100);
  L.ok(await page.evaluate(() => document.activeElement.id) === 'segbtn-receber' && !(await page.$eval('#tab-receber', el => el.hidden)), 'seta troca para “Me devem”');
  L.ok(await page.$eval('#segbtn-receber', el => el.getAttribute('aria-selected')) === 'true' && await page.evaluate(() => location.hash) === '#/compromissos/me-devem', 'aba marcada e endereço próprio');

  L.section('Teclado: popup');
  await page.focus('#fabAdd');
  await page.keyboard.press('Enter'); await L.sleep(150);
  L.ok(await page.evaluate(() => document.activeElement.id) === 'mAmount', 'popup abre com o foco no valor');
  L.ok(await page.$eval('main', el => el.hasAttribute('inert')) && await page.$eval('header', el => el.hasAttribute('inert')), 'fundo fica inerte enquanto o popup está aberto');
  let inside = true;
  for (let i = 0; i < 25; i++){
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement.closest('#modalRoot') || document.activeElement === document.body))){ inside = false; break; }
  }
  L.ok(inside, 'Tab não sai do popup');
  await page.keyboard.press('Escape'); await L.sleep(150);
  L.ok(!(await L.modalOpen(page)), 'Esc fecha o popup');
  L.ok(await page.evaluate(() => document.activeElement.id) === 'fabAdd', 'foco volta para o botão que abriu');
  L.ok(!(await page.$eval('main', el => el.hasAttribute('inert'))), 'fundo volta a funcionar');
  await page.click('#fabAdd'); await L.sleep(150);
  await L.submitModal(page);
  L.ok(await page.$eval('#modalRoot [data-modal-error]', el => el.getAttribute('role')) === 'alert' && /maior que zero/.test(await L.modalError(page)), 'erro do formulário é anunciado (role=alert)');
  await L.closeModal(page);

  L.section('Teclado: pular para o conteúdo');
  await L.reload(page);
  await page.keyboard.press('Tab');
  L.ok(await page.evaluate(() => document.activeElement.classList.contains('skip-link')), 'primeiro Tab mostra “Pular para o conteúdo”');
  L.ok(await page.$eval('.skip-link', el => el.getBoundingClientRect().top >= 0), 'o link aparece na tela ao receber foco');
  await page.keyboard.press('Enter'); await L.sleep(100);
  L.ok(await page.evaluate(() => document.activeElement.id) === 'main', 'Enter leva o foco ao conteúdo');
});
