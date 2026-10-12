// Guia "Como usar": passos na ordem, áreas atuais (com Contas fixas e Compromissos) e atalhos que funcionam.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'aprenda');
  const guide = await L.text(page, '#howTo');
  L.ok(await page.$$eval('#howTo .howto-steps > li', ls => ls.length) === 5, 'cinco primeiros passos numerados');
  L.ok(/Cadastre seus bancos e cartões.*Anote o que entra e o que sai.*Cadastre as contas de todo mês.*Planeje e guarde.*Acompanhe pelo Início/.test(guide), 'na ordem em que fazem sentido');
  const areas = await page.$$eval('#howTo .howto-area strong', s => s.map(x => x.textContent));
  const nav = (await page.$$eval('.sidenav .sidenav-links a.nav-item:not([hidden])', as => as.map(a => a.textContent.trim()))).concat(['Contas fixas']);
  L.ok(nav.every(n => areas.includes(n)), 'explica cada área do menu (' + nav.join(', ') + ')');
  L.ok(/Eu devo/.test(guide) && /Me devem/.test(guide) && /contas que se repetem/i.test(guide), 'fala de Eu devo / Me devem e de Contas fixas');
  L.ok(!/\bPainel\b/.test(guide) && !/só neste navegador/i.test(guide), 'sem nomes antigos (Painel) nem informação que não vale para todos');
  L.ok(/1\.500,00/.test(guide) && /⋯/.test(guide) && /1 hora/.test(guide), 'dicas das novidades: valor no formato do banco, menu ⋯ e link de senha');
  await page.click('#howTo [data-go="fixas"]'); await L.sleep(200);
  L.ok(!(await page.$eval('#tab-fixas', el => el.hidden)), '“Ir para Contas fixas” abre a área');

  L.section('Pelo rodapé');
  await page.click('[data-info="como-usar"]'); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Como usar o Grana Leve' && await page.$$eval('#modalRoot .howto-steps > li', ls => ls.length) === 5, 'abre o mesmo guia');
  L.ok(!(await page.$('#modalRoot [data-go]')), 'na janela, sem atalhos (que não funcionariam ali)');
  await L.closeModal(page);
  await page.setViewport({width: 360, height: 760}); await L.tab(page, 'aprenda'); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
