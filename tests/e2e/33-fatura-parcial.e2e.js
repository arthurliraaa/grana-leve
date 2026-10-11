// Pagar só uma parte da fatura: o resto fica em aberto (vai para a próxima fatura) ou é parcelado
// nas seguintes. Só os juros viram gasto; o saldo que passa adiante não (as compras já contaram).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Itaú'); await page.type('#accBalance', '2000'); await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Nubank', 5000, 3, 10);
  let d = await L.db(page);
  const card = d.cards[0];
  await L.addTx(page, {amount: 1000, pay: 'card:' + card.id, desc: 'Geladeira', category: 'casa', date: L.dayOffset(-45)});
  await L.tab(page, 'cartoes');
  d = await L.db(page);
  const key = await page.evaluate(async (dt, c) => (await import('/js/domain/cards.js')).invoiceKeyFor(dt, c), d.transactions[0].date, card);
  const next = await page.evaluate(async (k) => (await import('/js/domain/dates.js')).shiftMonthKey(k, 1), key);
  const btn = '[data-inv-paid="' + card.id + '"][data-key="' + key + '"]';
  async function showInvoice(k){
    for (let i = 0; i < 6; i++){
      const cur = await page.$eval('[data-inv-pdf="' + card.id + '"]', el => el.getAttribute('data-key'));
      if (cur === k) return;
      await page.$eval('[data-inv-shift="' + card.id + '"][data-dir="' + (cur > k ? -1 : 1) + '"]', el => el.click()); await L.sleep(80);
    }
  }
  const balance = () => page.evaluate(async () => { const s = await import('/js/ui/state.js'); return s.accountBalance(s.State.accounts[0]); });
  const mode = (m) => page.$eval('input[name=mode][value=' + m + ']', el => el.click());

  L.section('Opções ao pagar');
  await showInvoice(key);
  await page.$eval(btn, el => el.click()); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Pagar fatura', 'abre “Pagar fatura”');
  const modal = await L.text(page, '#modalRoot');
  L.ok(/Paguei a fatura toda/.test(modal) && /resto fica em aberto/.test(modal) && /parcelei o resto/.test(modal), 'três formas: toda, parte com resto em aberto, parte com resto parcelado');
  L.ok(await page.$eval('#ipPaid', el => el.closest('[data-part]').hidden), 'pagando tudo, não pede valor');
  await mode('aberto');
  L.ok(!(await page.$eval('#ipPaid', el => el.closest('[data-part]').hidden)), 'pagando uma parte, pede quanto pagou');
  await L.setVal(page, '#ipPaid', 1000);
  await L.submitModal(page);
  L.ok(/paga a fatura toda/.test(await L.modalError(page)), 'valor igual ao total: sugere “fatura toda”');

  L.section('Uma parte, o resto em aberto');
  await L.setVal(page, '#ipPaid', 400); await L.setVal(page, '#ipFee', 30);
  L.ok(/Falta R\$\s?600,00: vai para a fatura de/.test(await L.text(page, '#ipSum')) && /30,00 de juros/.test(await L.text(page, '#ipSum')), 'resumo: quanto falta e para qual fatura vai');
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  const p = d.cards[0].invoicePayments[key];
  L.ok(p.mode === 'aberto' && p.amount === 400 && p.rest === 600, 'grava o pagamento parcial (400 pago, 600 em aberto)');
  L.ok(await balance() === 1600, 'só os 400 saem da conta');
  const fee = d.transactions.filter(t => t.invoiceFee);
  L.ok(fee.length === 1 && fee[0].amount === 30 && fee[0].invoiceKey === next, 'juros viram um gasto de 30 na próxima fatura');
  L.ok(/paga em parte/.test(await L.text(page, '#bankList')) && /faltou R\$\s?600,00/.test(await L.text(page, '#bankList')), 'a fatura aparece “paga em parte”, com o que faltou');
  await showInvoice(next);
  let sec = await L.text(page, '#bankList .credit-card');
  L.ok(/Saldo em aberto da fatura de/.test(sec) && /R\$\s?630,00/.test(sec), 'a próxima fatura traz o saldo (600) + os juros (30) = 630');
  L.ok(/Faturas a pagar|Fatura aberta/.test(await L.text(page, '#walletSummary')), 'resumo das faturas segue aparecendo');

  L.section('Desfazer');
  await showInvoice(key);
  await page.$eval(btn, el => el.click()); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Desfazer o pagamento?', 'desfazer pede confirmação');
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => t.invoiceFee) && !d.cards[0].invoicePayments[key] && await balance() === 2000, 'desfazer tira os juros e devolve o saldo');

  L.section('Uma parte, o resto parcelado');
  await page.$eval(btn, el => el.click()); await L.sleep(200);
  await mode('parcelado');
  await L.setVal(page, '#ipPaid', 400); await L.setVal(page, '#ipN', 4);
  L.ok(await page.$eval('#ipParcel', el => el.value) === '150.00', 'sugere a parcela sem juros (600 ÷ 4)');
  await L.setVal(page, '#ipParcel', 165);
  L.ok(/4x de R\$\s?165,00 = R\$\s?660,00/.test(await L.text(page, '#ipSum')) && /Juros: R\$\s?60,00/.test(await L.text(page, '#ipSum')), 'mostra o total parcelado e os juros');
  await L.setVal(page, '#ipParcel', 100);
  await L.submitModal(page);
  L.ok(/dá menos que o que faltou/.test(await L.modalError(page)), 'parcelas menores que o resto: avisa');
  await L.setVal(page, '#ipParcel', 165);
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  const fees = d.transactions.filter(t => t.invoiceFee).sort((a, b) => a.invoiceKey.localeCompare(b.invoiceKey));
  L.ok(fees.length === 4 && fees.every(t => t.amount === 15) && fees[0].invoiceKey === next, 'juros de 60 divididos em 4 × 15, a partir da próxima fatura');
  L.ok(/resto em 4x de R\$\s?165,00/.test(await L.text(page, '#bankList')), 'a fatura mostra o parcelamento');
  await showInvoice(next);
  sec = await L.text(page, '#bankList .credit-card');
  L.ok(/Parcelamento da fatura de .* \(1\/4\)/.test(sec) && /R\$\s?165,00/.test(sec), 'a próxima fatura traz a parcela 1/4 (150 + 15 de juros)');
  L.ok(/Limite disponível\s*R\$\s?4\.340,00/.test(sec), 'as parcelas do parcelamento (com juros) ocupam o limite: 5000 − 660');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await showInvoice(key);
  await page.$eval(btn, el => el.click()); await L.sleep(200);
  await L.closeModal(page);
  await page.$eval(btn, el => el.click()); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');
  await L.closeModal(page);
});
