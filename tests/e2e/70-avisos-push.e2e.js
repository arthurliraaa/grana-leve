// Avisos no celular: o cartão em Perfil explica por que não dá (sem chave do servidor e sem conta online) e nada quebra.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'perfil'); await L.sleep(250);
  L.ok(await page.$eval('#profileBody', e => /Avisos no celular/.test(e.textContent)), 'Perfil tem o cartão “Avisos no celular”');
  L.ok(/Os avisos ainda não foram ligados neste app/.test(await L.text(page, '#pfT10 ~ .card-sub')), 'sem a chave do servidor explica que os avisos ainda não foram ligados');
  L.ok(!(await page.$('#pfPushOn')), 'e não oferece o botão de ligar');
  L.ok(await page.evaluate(() => 'serviceWorker' in navigator), 'o service worker existe (os avisos são mostrados por ele)');
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');
});
