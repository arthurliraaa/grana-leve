// Relatório do cartão: filtro "De quem" (tudo, minha parte, outras pessoas), barra dividida por fatura
// e quanto é de cada pessoa.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Nubank', 5000, 3, 10);
  const card = (await L.db(page)).cards[0];
  const today = L.dayOffset(0);
  await L.patchDb(page, `
    const base = {type: 'expense', paymentMethod: 'cartao', cardId: arg.card, date: arg.today, createdAt: 1};
    u.transactions = (u.transactions || []).concat([
      Object.assign({}, base, {id: 'm1', amount: 100, category: 'alimentacao', description: 'Mercado'}),
      Object.assign({}, base, {id: 'o1', amount: 200, category: 'compras', description: 'Tênis', forOther: {person: 'Gessi'}}),
      Object.assign({}, base, {id: 's1', amount: 300, category: 'moradia', description: 'Sofá', split: {total: 300, mine: 150, people: [{person: 'Ana', amount: 100}, {person: 'Gessi', amount: 50}]}})
    ]);`, {card: card.id, today});
  await L.tab(page, 'cartoes');
  await page.$eval('[data-card-report="' + card.id + '"]', el => el.click()); await L.sleep(250);
  await L.setVal(page, '#crPeriod', '1'); await L.sleep(100);

  L.section('Tudo');
  let body = await L.text(page, '#crBody');
  L.ok(/Total no período\s*R\$\s?600,00/.test(body), 'total da fatura: 600');
  L.ok(/Minha parte\s*R\$\s?250,00\s*42%/.test(body) && /Outras pessoas\s*R\$\s?350,00\s*58%/.test(body), 'separa minha parte (100 + 150) e outras pessoas (200 + 150)');
  L.ok(await page.$$eval('#crBody .inv-seg.mine', e => e.length) === 1 && await page.$$eval('#crBody .inv-seg.others', e => e.length) === 1, 'barra da fatura dividida nas duas partes');
  L.ok(/Gessi\s*R\$\s?250,00/.test(body) && /Ana\s*R\$\s?100,00/.test(body), 'quanto é de cada pessoa (Gessi 200 + 50; Ana 100)');

  L.section('Só a minha parte');
  await L.setVal(page, '#crWho', 'mine'); await L.sleep(100);
  body = await L.text(page, '#crBody');
  L.ok(/Total no período da sua parte\s*R\$\s?250,00/.test(body) && !/Outras pessoas/.test(body) && !/Gessi/.test(body), 'mostra só a minha parte');
  L.ok(/Moradia\s*R\$\s?150,00/.test(body) && /Alimentação\s*R\$\s?100,00/.test(body) && !/Compras\s*R\$/.test(body), 'categorias pela minha parte (o tênis da Gessi some)');

  L.section('Só de outras pessoas');
  await L.setVal(page, '#crWho', 'others'); await L.sleep(100);
  body = await L.text(page, '#crBody');
  L.ok(/Total no período de outras pessoas\s*R\$\s?350,00/.test(body) && /Gessi/.test(body) && !/Minha parte/.test(body), 'mostra só o que é dos outros, com as pessoas');
  await L.setVal(page, '#crCat', 'alimentacao'); await L.sleep(100);
  L.ok(/Nenhum gasto de outras pessoas/.test(await L.text(page, '#crBody')), 'sem gasto de outros na categoria: avisa');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.setVal(page, '#crWho', 'all'); await L.setVal(page, '#crCat', 'all'); await L.sleep(100);
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');
  await L.closeModal(page);
});
