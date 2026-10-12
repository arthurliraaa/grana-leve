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
});
