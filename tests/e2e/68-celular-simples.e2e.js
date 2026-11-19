// Celular mais simples: sem botão repetido em Ganhos e gastos e sem “Sair” solto no topo (fica em Perfil).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);

  L.section('Computador');
  L.ok(await page.$eval('#logoutBtn', e => e.getBoundingClientRect().width > 0), 'no computador o “Sair” continua no topo');

  L.section('Celular');
  await page.setViewport({width: 390, height: 844, isMobile: true}); await L.sleep(200);
  L.ok(await page.$eval('#logoutBtn', e => e.getBoundingClientRect().width === 0), 'no celular o topo não tem “Sair” (evita sair sem querer)');
  await L.tab(page, 'lancamentos'); await L.sleep(200);
  L.ok(await page.$eval('.tx-mobile-open', e => e.getBoundingClientRect().width === 0), 'em Ganhos e gastos não há um segundo botão de lançar (o + do menu de baixo faz isso)');
  L.ok(!!(await page.$('#fabAdd')) && await page.$eval('#fabAdd', e => e.getBoundingClientRect().width > 0), 'o + do menu de baixo continua à vista');
  L.ok(await page.$eval('#forecastToggle', e => e.getBoundingClientRect().width > 0), 'Previstas continua na página');

  L.section('Sair pelo Perfil');
  await L.tab(page, 'perfil'); await L.sleep(250);
  L.ok(!!(await page.$('#pfLogout')), 'Perfil tem “Sair da conta”');
  await page.$eval('#pfLogout', e => e.click()); await L.sleep(400);
  L.ok(await page.$eval('#viewLanding', e => !e.hidden), 'sai da conta e volta para a página inicial');
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
