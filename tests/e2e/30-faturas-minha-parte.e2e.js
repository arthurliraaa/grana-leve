// Início: faturas do cartão separadas em "minha parte" e "outras pessoas", com gráfico e tabela.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Nubank', 7700, 20, 28);
  await L.addCard(page, 'MercadoPago', 3000, 1, 10);
  let d = await L.db(page);
  const [nu, mp] = d.cards;
  await L.tab(page, 'dashboard');
  await page.click('#dashDetailsBtn'); await L.sleep(200);
  L.ok(!(await page.$eval('#invSplitCard', el => el.hidden)), 'com cartões, o quadro aparece');

  await L.addTx(page, {amount: 420, pay: 'card:' + nu.id, desc: 'Mercado', category: 'alimentacao'});
  await L.addTx(page, {amount: 90, pay: 'card:' + mp.id, desc: 'Farmácia', category: 'saude'});
  await L.tab(page, 'lancamentos');
  await page.type('#txAmount', '300'); await page.type('#txDesc', 'Ingresso');
  await L.setVal(page, '#txPayment', 'card:' + nu.id);
  await page.click('#txForOtherField summary'); await page.click('#txForOther'); await page.type('#txOtherName', 'Maria');
  await page.click('#txForm button[type=submit]'); await L.sleep(300);
  await page.type('#txAmount', '200'); await page.type('#txDesc', 'Jantar');
  await L.setVal(page, '#txPayment', 'card:' + mp.id);
  await page.click('#txForOtherField summary'); await page.click('#txSplit'); await L.sleep(100);
  await page.type('#txSplitRows .split-row:nth-child(1) .sp-name', 'João'); await page.type('#txSplitRows .split-row:nth-child(1) .sp-val', '100');
  await page.click('#txForm button[type=submit]'); await L.sleep(300);
  await L.addTx(page, {amount: 60.41, pay: 'card:' + mp.id, desc: 'Antiga', date: L.dayOffset(-75)});

  await L.tab(page, 'dashboard'); await L.sleep(200);
  // As faturas aparecem no mês em que vencem: anda pelos meses e junta o que cada um mostra.
  const seen = [];
  let late = '';
  for (let i = 0; i <= 3; i++){
    const wrap = await L.text(page, '#invSplitWrap');
    seen.push(wrap);
    if (i === 0) late = wrap;
    if (i < 3){ await page.$eval('#dashNext', el => el.click()); await L.sleep(150); }
  }
  const all = seen.join(' | ');
  L.ok(/Nubank.*R\$\s?720,00/.test(all), 'Nubank: 420 meus + 300 da Maria = 720');
  L.ok(/MercadoPago.*R\$\s?290,00/.test(all), 'MercadoPago: 190 meus (90 + metade do jantar) + 100 do João = 290');
  await page.$eval('#dashToday', el => el.click()); await L.sleep(150);
  const month = seen.find(t => /Nubank/.test(t));
  L.ok(/Total das faturas\s*R\$\s?(720|1\.010),00/.test(month), 'o quadro mostra o total do mês');
  L.ok(/Minha parte\s*R\$\s?(420|610),00\s*\d+%/.test(month) && /Outras pessoas\s*R\$\s?(300|400),00\s*\d+%/.test(month), 'minha parte e outras pessoas, com valor e %');
  L.ok(/1 fatura\(s\) vencida\(s\)\D*R\$\s?60,41/.test(late), 'avisa da fatura antiga vencida, à parte (no mês atual)');
  L.ok(await page.$$eval('#invSplitWrap .inv-seg', s => s.length >= 2 && s.every(x => x.tabIndex === 0 && x.dataset.label && x.dataset.value)), 'barras com dica por teclado e mouse');
  L.ok(/Faturas do cartão · /.test(await L.text(page, '#invSplitTitle')) && !(await page.$('[data-collapse]')), 'título diz o mês e o quadro não precisa ser aberto');
  L.ok(await page.$eval('#invSplitCard', c => c.getBoundingClientRect().top === document.getElementById('creditDebitCard').getBoundingClientRect().top), 'faturas e crédito × débito ficam lado a lado');
  L.ok(await page.$eval('#invSplitCard', c => c.getBoundingClientRect().top > document.querySelector('.dash-grid').getBoundingClientRect().top), 'ficam abaixo dos gráficos');

  await page.click('[data-view-toggle="invsplit"]'); await L.sleep(150);
  const rows = await page.$$eval('#invSplitWrap table tbody tr', r => r.map(x => x.textContent.replace(/\s+/g, ' ')));
  L.ok(rows.length >= 2 && /Total/.test(rows[rows.length - 1]), '“Ver como tabela” mostra cartão, minha parte, outras pessoas e total');
  L.ok(await L.text(page, '[data-view-toggle="invsplit"]') === 'Ver como gráfico', 'botão alterna para gráfico');
  await page.click('[data-view-toggle="invsplit"]'); await L.sleep(100);

  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
