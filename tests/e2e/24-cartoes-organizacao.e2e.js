// Contas e cartões: resumo no topo, atalhos e conta padrão para pagar a fatura.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  L.ok(await page.$eval('#walletSummary', el => el.children.length === 0), 'sem contas nem cartões, o resumo não aparece');
  for (const [n, b] of [['Itaú', '500'], ['Nubank', '1000']]){ await page.type('#accName', n); await page.type('#accBalance', b); await page.click('#accountForm button[type=submit]'); await L.sleep(250); }
  await L.addCard(page, 'Nubank', 3000, 3, 10);
  let d = await L.db(page);
  const [itau, nuAcc] = d.accounts, card = d.cards[0];
  // Compra antiga: a fatura dela já fechou.
  await L.addTx(page, {amount: 200, pay: 'card:' + card.id, desc: 'Mercado', category: 'alimentacao', date: L.dayOffset(-45)});
  await L.tab(page, 'cartoes');
  const sum = await L.text(page, '#walletSummary');
  L.ok(/Nas contas\s*R\$\s?1\.500,00/.test(sum), 'resumo: dinheiro nas contas');
  L.ok(/Faturas a pagar\s*R\$\s?200,00/.test(sum) && /Sobra depois de pagar\s*R\$\s?1\.300,00/.test(sum), 'resumo: faturas a pagar e quanto sobra');
  L.ok(/paga com Nubank/i.test(await L.text(page, '#bankList')), 'cartão Nubank sugere pagar com a conta Nubank (mesmo banco)');

  L.section('Pagar a fatura');
  await page.click('#bankList [data-inv-shift][data-dir="-1"]'); await L.sleep(100);
  for (let i = 0; i < 3 && !(await page.$('#bankList [data-inv-paid]')); i++){ await page.click('#bankList [data-inv-shift][data-dir="-1"]'); await L.sleep(100); }
  await page.click('#bankList [data-inv-paid]'); await L.sleep(200);
  L.ok(await page.$eval('#ipAcc', el => el.value) === nuAcc.id, 'pagar fatura já vem com a conta Nubank');
  await L.closeModal(page);

  L.section('Escolher a conta no cartão');
  await page.click('[data-card-edit="' + card.id + '"]'); await L.sleep(200);
  await L.setVal(page, '#ecPayAcc', itau.id);
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  L.ok(d.cards[0].payAccountId === itau.id && /paga com Itaú/i.test(await L.text(page, '#bankList')), 'conta escolhida fica salva e aparece no cartão');
  await page.click('#bankList [data-inv-paid]'); await L.sleep(200);
  L.ok(await page.$eval('#ipAcc', el => el.value) === itau.id, 'e vem marcada ao pagar');
  await L.submitModal(page); await L.sleep(300);
  L.ok(/Faturas a pagar\s*R\$\s?0,00/.test(await L.text(page, '#walletSummary')) && /Nas contas\s*R\$\s?1\.300,00/.test(await L.text(page, '#walletSummary')), 'resumo atualiza ao pagar');

  L.section('Atalhos');
  await page.click('[data-jump="secVouchers"]'); await L.sleep(400);
  L.ok(await page.$eval('#secVouchers', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100; }), '“Vales” leva até a seção (fica visível)');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
