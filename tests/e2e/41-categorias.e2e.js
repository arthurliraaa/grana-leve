// Categorias conforme o uso: mais usadas primeiro, sugestão pela descrição e telas sem categorias sobrando.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);

  L.section('Sem histórico: lista completa, como sempre');
  await page.click('#fabAdd'); await L.sleep(150);
  L.ok(!(await page.$('#mCategory optgroup')), 'sem lançamentos, não separa “mais usadas”');
  await L.closeModal(page);
  await L.tab(page, 'limites');
  L.ok(!(await page.$('#budgetList .budget-more')) && (await page.$$('#budgetList [data-budget-cat]')).length >= 9, 'Planejar mostra todas as categorias para começar');

  L.section('Sugestão pela descrição');
  await page.click('#fabAdd'); await L.sleep(150);
  await L.setVal(page, '#mAmount', 30);
  await page.type('#mDesc', 'padaria');
  L.ok(await page.$eval('#mCategory', el => el.value) === 'alimentacao' && !(await page.$eval('#mCatHint', el => el.hidden)), '“padaria” sugere Alimentação, com aviso');
  await L.submitModal(page); await L.sleep(200);
  for (const [v, desc, cat] of [[25, 'Cinema', 'lazer'], [40, 'Show', 'lazer'], [15, 'Pipoca', 'lazer'], [12, 'Uber', 'transporte']]) await L.addTx(page, {amount: v, desc, category: cat});
  // Pipoca não é palavra conhecida, mas a pessoa já lançou "Pipoca" em Lazer: a próxima vem em Lazer.
  await page.click('#fabAdd'); await L.sleep(150);
  await page.type('#mDesc', 'pipoca');
  L.ok(await page.$eval('#mCategory', el => el.value) === 'lazer', 'aprende com o que a pessoa já lançou (“pipoca” → Lazer)');
  await L.setVal(page, '#mCategory', 'compras');
  await page.type('#mDesc', ' doce');
  L.ok(await page.$eval('#mCategory', el => el.value) === 'compras', 'depois de escolher na mão, a sugestão não troca mais');
  await L.closeModal(page);

  L.section('Mais usadas primeiro');
  await page.click('#fabAdd'); await L.sleep(150);
  const groups = await page.$$eval('#mCategory optgroup', gs => gs.map(g => ({label: g.label, ids: [...g.querySelectorAll('option')].map(o => o.value)})));
  L.ok(groups.length === 2 && groups[0].label === 'Mais usadas' && groups[0].ids[0] === 'lazer' && groups[0].ids.includes('alimentacao') && groups[0].ids.includes('transporte'), 'Lazer (3x) primeiro, depois as outras usadas');
  L.ok(!groups[0].ids.includes('moradia') && groups[1].ids.includes('moradia'), 'categorias nunca usadas ficam em “Outras”');
  L.ok(await page.$eval('#mCategory', el => el.value) === 'lazer', 'lançamento novo já vem com a categoria mais usada');
  L.ok(await page.$eval('#mCategory > option:last-child', el => el.value) === '__new', '“+ Nova categoria…” continua no fim');
  await L.closeModal(page);
  await L.tab(page, 'lanc');
  L.ok(await page.$eval('#txCategory', el => el.value) === 'lazer' && !!(await page.$('#txCategory optgroup')), 'o formulário da aba também');
  await page.type('#txDesc', 'mercado');
  L.ok(await page.$eval('#txCategory', el => el.value) === 'alimentacao' && !(await page.$eval('#txCatHint', el => el.hidden)), 'e sugere pela descrição');

  L.section('Telas sem categorias sobrando');
  const filter = await page.$$eval('#txFilterCat option', os => os.map(o => o.value));
  L.ok(filter.includes('lazer') && filter.includes('alimentacao') && !filter.includes('moradia') && !filter.includes('salario'), 'filtro só lista categorias com lançamentos');
  await L.tab(page, 'limites');
  const visible = await page.$$eval('#budgetList > .budget-row [data-budget-cat]', is => is.map(i => i.getAttribute('data-budget-cat')));
  L.ok(visible.includes('lazer') && visible.includes('alimentacao') && !visible.includes('moradia'), 'Planejar mostra as categorias em uso');
  L.ok(/Outras categorias \(\d+\): Moradia/.test(await L.text(page, '#budgetList .budget-more summary')), 'as outras ficam recolhidas, com os nomes');
  await page.click('#budgetList .budget-more summary'); await L.sleep(100);
  await page.$eval('[data-budget-cat="moradia"]', el => { el.focus(); });
  await page.keyboard.type('900'); await page.keyboard.press('Tab'); await L.sleep(250);
  const vis2 = await page.$$eval('#budgetList > .budget-row [data-budget-cat]', is => is.map(i => i.getAttribute('data-budget-cat')));
  L.ok(vis2.includes('moradia'), 'pôr um limite numa categoria recolhida faz ela aparecer');
});
