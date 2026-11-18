// PDF (jsPDF do CDN, com verificação de integridade): a fatura é gerada sem erro.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const ok = await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF, {timeout: 15000}).then(() => true).catch(() => false);
  if (!ok){ console.log('Pulado: sem internet para baixar o jsPDF do CDN.'); return; }
  L.ok(await page.evaluate(() => window.jspdf.jsPDF.version) === '4.2.1', 'carrega o jsPDF 4.2.1 (integridade conferida pelo navegador)');
  await L.addCard(page, 'Inter', 3000, 5, 12);
  const d = await L.db(page);
  await L.addTx(page, {amount: 120, pay: 'card:' + d.cards[0].id, desc: 'Mercado', category: 'alimentacao'});
  await L.tab(page, 'cartoes');
  await L.menuAction(page, '[data-inv-pdf]'); await L.sleep(800);
  L.ok(/Fatura Inter/.test(await L.modalTitle(page)) && await page.$('#modalRoot iframe, #modalRoot embed, #modalRoot object, #modalRoot a[download]') !== null, 'fatura em PDF gerada e mostrada');
  await L.closeModal(page);
  // PDF de todos os cartões: a fatura da compra vence em dezembro (mês que vem) ou neste mês, conforme o dia.
  const inv = (await page.$('[data-allinv-pdf="0"]')) && (await page.$('[data-allinv-pdf="1"]'));
  L.ok(!!inv, 'botões do PDF de todas as faturas aparecem em Contas e cartões');
  for (const off of ['0', '1']){
    await page.click('[data-allinv-pdf="' + off + '"]'); await L.sleep(800);
    if (/Faturas/.test(await L.modalTitle(page).catch(() => '') || '')){ L.ok(true, 'PDF das faturas de todos os cartões gerado e mostrado'); await L.closeModal(page); break; }
  }
});
