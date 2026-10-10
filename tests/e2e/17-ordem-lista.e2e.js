// Ordem da lista de Ganhos e gastos: mais recentes, ordem de cadastro ou maior valor (lembrada).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addTx(page, {amount: 30, desc: 'Primeiro', date: L.dayOffset(0)});
  await L.addTx(page, {amount: 90, desc: 'Segundo', date: L.dayOffset(-2)});
  await L.addTx(page, {amount: 10, desc: 'Terceiro', date: L.dayOffset(-1)});
  await L.tab(page, 'lancamentos');
  const order = () => page.$$eval('#txList .tx-desc', els => els.map(e => e.textContent).join(','));
  L.ok(await page.$eval('#txSort', el => el.value) === 'recent', 'começa por “mais recentes primeiro”');
  L.ok(await order() === 'Primeiro,Terceiro,Segundo', 'mais recentes: pela data');
  await L.setVal(page, '#txSort', 'added'); await L.sleep(100);
  L.ok(await order() === 'Primeiro,Segundo,Terceiro', 'ordem de cadastro: do primeiro ao último, de cima para baixo');
  await L.setVal(page, '#txSort', 'amount'); await L.sleep(100);
  L.ok(await order() === 'Segundo,Primeiro,Terceiro', 'maior valor primeiro');
  await L.setVal(page, '#txSort', 'added'); await L.sleep(100);
  await L.reload(page); await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txSort', el => el.value) === 'added' && await order() === 'Primeiro,Segundo,Terceiro', 'lembra a escolha depois de recarregar');
  L.ok(!/Filtrando/.test(await L.text(page, '#txSummary')), 'ordenar não conta como filtro');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'filtros cabem no celular');
});
