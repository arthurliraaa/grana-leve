// Dividir uma compra com outras pessoas: sua parte nos gastos, a parte de cada um em "A receber".
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Inter', 5000, 5, 12);
  let d = await L.db(page);
  const card = d.cards[0];
  const tile = async label => L.moneyOf(await page.evaluate(l => [...document.querySelectorAll('#statTiles .tile')].find(x => x.querySelector('.tile-lbl').textContent === l).querySelector('.tile-val').textContent, label));

  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txSplitBox', el => el.hidden), 'divisão escondida até marcar');
  await page.type('#txAmount', '600');
  await L.setVal(page, '#txPayment', 'card:' + card.id);
  await L.setVal(page, '#txInstall', '3');
  await page.type('#txDesc', 'Geladeira');
  await page.click('#txForOtherField summary'); await page.click('#txForOther');
  await page.click('#txSplit');
  L.ok(!(await page.$eval('#txForOther', el => el.checked)) && !(await page.$eval('#txSplitBox', el => el.hidden)), '“dividir” e “paguei por outra pessoa” não ficam marcados juntos');
  L.ok(await page.$$eval('#txSplitRows .split-row', r => r.length) === 1, 'já vem uma linha para a primeira pessoa');
  await page.type('#txSplitRows .split-row:nth-child(1) .sp-name', 'Mãe');
  await page.click('#txSplitAdd');
  await page.type('#txSplitRows .split-row:nth-child(2) .sp-name', 'Irmão');
  await page.click('#txSplitEqual');
  L.ok(/Sua parte: R\$\s?200,00 de R\$\s?600,00 · Mãe R\$\s?200,00 · Irmão R\$\s?200,00/.test(await L.text(page, '#txSplitSummary')), '“dividir igualmente”: 200 para cada um');
  await page.click('input[name=txSplitMode][value=pct]');
  await page.$eval('#txSplitRows .split-row:nth-child(1) .sp-val', el => { el.value = '50'; });
  await page.$eval('#txSplitRows .split-row:nth-child(2) .sp-val', el => { el.value = '60'; });
  await page.type('#txSplitRows .split-row:nth-child(2) .sp-val', '');
  L.ok(/passam do total/.test(await L.text(page, '#txSplitSummary')), 'avisa quando as partes passam do total');
  await page.$eval('#txSplitRows .split-row:nth-child(2) .sp-val', el => { el.value = '25'; el.dispatchEvent(new Event('input', {bubbles: true})); });
  L.ok(/Sua parte: R\$\s?150,00 de R\$\s?600,00 · Mãe R\$\s?300,00 · Irmão R\$\s?150,00/.test(await L.text(page, '#txSplitSummary')), 'por porcentagem: mãe 50%, irmão 25%, você 150');
  await page.click('#txForm button[type=submit]'); await L.sleep(500);

  d = await L.db(page);
  const parts = d.transactions.filter(t => t.installment);
  L.ok(parts.length === 3 && parts.every(t => t.amount === 200 && t.split && t.split.mine === 150 && t.split.people.length === 2), 'compra de 600 em 3x com a divisão em cada parcela');
  const mae = d.receivables.find(r => r.person === 'Mãe'), irmao = d.receivables.find(r => r.person === 'Irmão');
  L.ok(mae.totalAmount === 300 && mae.installments === 3 && mae.installmentAmount === 100 && mae.linked && mae.cardId === card.id, 'Mãe: A receber de 300 em 3x de 100, no cartão');
  L.ok(irmao.totalAmount === 150 && irmao.installmentAmount === 50, 'Irmão: 150 em 3x de 50');
  L.ok(await page.$eval('#txSplitBox', el => el.hidden) && !(await page.$eval('#txSplit', el => el.checked)), 'formulário volta ao normal');
  L.ok(/Dividida: sua parte R\$\s?50,00 · Mãe, Irmão/.test(await L.text(page, '#txList')), 'lista mostra a parcela dividida e a sua parte');
  L.ok(/gastos R\$\s?50,00/.test(await L.text(page, '#txSummary')) && /pagos por outras pessoas R\$\s?150,00/.test(await L.text(page, '#txSummary')), 'resumo do mês: sua parte 50, outras pessoas 150');
  await L.tab(page, 'dashboard');
  L.ok(await tile('Gastos do mês') === 50, 'painel: só a sua parte da parcela (50)');
  await L.tab(page, 'cartoes');
  L.ok(/R\$\s?4\.400,00/.test(await L.text(page, '#bankList .avail')), 'cartão: o limite usa o total da compra (600)');

  L.section('Receber a parte de alguém');
  await L.tab(page, 'receber');
  await page.click('[data-recv-get="' + mae.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('input[name=as][value=refund]', el => el.checked), 'parte da compra começa como devolução');
  await L.closeModal(page);
});
