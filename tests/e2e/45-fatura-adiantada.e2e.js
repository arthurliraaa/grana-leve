// Fatura em aberto com pagamento adiantado: mostra o que falta (total menor), tira da conta,
// libera limite e a "Sobra depois de pagar" desconta tudo o que falta das faturas.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Inter');
  await page.$eval('#bankHasAcc', el => { if (!el.checked) el.click(); });
  await page.$eval('#bankHasCard', el => { if (!el.checked) el.click(); });
  await L.setVal(page, '#accBalance', 2000);
  await page.type('#cardLimit', '3000'); await page.type('#cardClosing', '28'); await page.type('#cardDue', '5');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  const d0 = await L.db(page), card = d0.cards[0], acc = d0.accounts[0];
  await L.addTx(page, {amount: 300, desc: 'Mercado no cartão', pay: 'card:' + card.id});
  await L.tab(page, 'cartoes');
  const left = async () => L.moneyOf(await L.text(page, '#bankList .cc-left'));

  L.section('Cartão organizado');
  L.ok(await left() === 300 && /Falta pagar/.test(await L.text(page, '#bankList .cc-invoice')), 'a fatura mostra em destaque quanto falta pagar');
  L.ok(await page.$('#bankList .credit-card .sec-head .card-menu [data-card-edit]') && await page.$('#bankList .credit-card .sec-head .card-menu [data-inv-pdf]'), 'editar, PDF, relatório e excluir ficam no ⋯');

  L.section('Adiantar uma parte');
  await page.click('#bankList [data-inv-paid]'); await L.sleep(200);
  await page.$eval('input[name=mode][value=adiantado]', el => el.click()); await L.sleep(80);
  await page.type('#ipPaid', '100');
  L.ok(/Fica faltando R\$\s?200,00 nesta fatura/.test(await L.text(page, '#ipSum')), 'explica que a fatura continua aberta com o resto');
  await L.setVal(page, '#ipAcc', acc.id);
  await L.submitModal(page); await L.sleep(300);
  let d = await L.db(page);
  L.ok(!(d.cards[0].paidInvoices || []).length && d.cards[0].invoiceAdvances && Object.values(d.cards[0].invoiceAdvances)[0][0].amount === 100, 'grava o adiantamento sem marcar a fatura como paga');
  L.ok(await left() === 200 && /Total R\$\s?300,00 · já pago R\$\s?100,00/.test(await L.text(page, '#bankList .cc-invoice')), 'falta R$ 200; total e já pago aparecem menores');
  L.ok(L.moneyOf(await L.text(page, '#bankList .account-balance')) === 1900, 'o adiantado sai do saldo da conta');
  L.ok(/R\$\s?2\.800,00/.test(await L.text(page, '#bankList .avail')), 'libera limite (3.000 − 200)');
  const sum = await L.text(page, '#walletSummary');
  L.ok(/Fatura aberta: falta\s*R\$\s?200,00\s*total R\$\s?300,00 · pago R\$\s?100,00/.test(sum), 'resumo: falta em destaque, total e pago menores');
  L.ok(/Sobra depois de pagar\s*R\$\s?1\.700,00/.test(sum), 'sobra = 1.900 nas contas − 200 que faltam');

  L.section('Pagar o resto e desfazer');
  await page.click('#bankList [data-inv-paid]'); await L.sleep(200);
  L.ok(/falta R\$\s?200,00 \(total R\$\s?300,00, já pago R\$\s?100,00\)/.test(await L.text(page, '#modalRoot')), 'a janela de pagamento cobra só o que falta');
  await L.setVal(page, '#ipAcc', acc.id);
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.cards[0].paidInvoices.length === 1 && Object.values(d.cards[0].invoicePayments)[0].amount === 200, 'paga os R$ 200 restantes');
  L.ok(L.moneyOf(await L.text(page, '#bankList .account-balance')) === 1700, 'conta: 2.000 − 100 − 200');
  await page.click('#bankList [data-inv-paid]'); await L.sleep(300);
  await page.$eval('#bankList .credit-card details.pay-log', el => { el.open = true; });
  await page.click('#bankList [data-invadv-undo]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(300);
  L.ok(await left() === 300 && L.moneyOf(await L.text(page, '#bankList .account-balance')) === 2000, 'desmarcar e desfazer o adiantamento devolvem tudo');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
