// Conselhos: card no Início (até 3), aba com todos, dispensar e aplicar uma sugestão de limite.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const day = Number(L.dayOffset(0).slice(8, 10));
  const mk = (o, d) => { const x = new Date(); const y = new Date(x.getFullYear(), x.getMonth() + o, d); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
  await L.patchDb(page, `
    u.transactions = [
      {id: 'p1', type: 'expense', amount: 300, category: 'lazer', date: arg.a, description: 'Cinema', paymentMethod: 'conta', createdAt: 1},
      {id: 'p2', type: 'expense', amount: 300, category: 'lazer', date: arg.b, description: 'Cinema', paymentMethod: 'conta', createdAt: 1},
      {id: 'p3', type: 'expense', amount: 300, category: 'lazer', date: arg.c, description: 'Cinema', paymentMethod: 'conta', createdAt: 1},
      {id: 'n1', type: 'expense', amount: 500, category: 'lazer', date: arg.n, description: 'Show', paymentMethod: 'conta', createdAt: 1},
      {id: 'n2', type: 'expense', amount: 200, category: 'alimentacao', date: arg.n, description: 'Mercado', paymentMethod: 'conta', createdAt: 1}];`,
    {a: mk(-1, 10), b: mk(-2, 10), c: mk(-3, 10), n: mk(0, 1)});
  await L.tab(page, 'dashboard'); await L.sleep(250);

  L.section('Card no Início');
  L.ok(!(await page.$eval('#adviceCard', e => e.hidden)) && /Conselhos do mês/.test(await L.text(page, '#adviceCard')), 'o Início mostra o card “Conselhos do mês”');
  L.ok(await page.$$eval('#adviceCard .advice-item', i => i.length >= 1 && i.length <= 3), 'com no máximo 3 conselhos');
  const card = await L.text(page, '#adviceCard');
  L.ok(/limites/i.test(card) || /Lazer/.test(card), 'fala dos gastos (limites ou Lazer acima do costume)');

  L.section('Aba com todos');
  await page.$eval('#adviceCard [data-advice-go="conselhos"]', e => e.click()); await L.sleep(250);
  L.ok(!(await page.$eval('#tab-conselhos', e => e.hidden)) && await page.$$eval('#adviceList .advice-item', i => i.length) >= 1, '“Ver todos” abre a aba Conselhos');
  const list = await L.text(page, '#adviceList');
  if (day >= 7){
    L.ok(/Lazer está acima do seu costume/.test(list) && /média/.test(list), 'Lazer está acima da média dos meses anteriores (gentil, com números)');
    await page.$eval('#adviceList [data-advice-limit]', e => e.click()); await L.sleep(400);
    const plan = (await L.db(page)).budgets;
    L.ok(JSON.stringify(plan).includes('"lazer":300'), 'um toque define o limite de Lazer em R$ 300 (a média)');
  }

  L.section('Dispensar');
  const before = await page.$$eval('#adviceList .advice-item', i => i.length);
  await page.$eval('#adviceList [data-advice-dismiss]', e => e.click()); await L.sleep(250);
  const after = await page.$$eval('#adviceList .advice-item', i => i.length);
  L.ok(after === before - 1 || (before === 1 && /dispensou/.test(await L.text(page, '#adviceList'))), 'dispensar tira o conselho da lista');
  L.ok(!(await page.$eval('#adviceRestore', e => e.hidden)), 'e aparece “Mostrar de novo os conselhos dispensados”');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
  await page.setViewport({width: 1280, height: 900});
});
