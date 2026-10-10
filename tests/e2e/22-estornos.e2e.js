// Estornos: Pix volta para a conta, cartão com fatura aberta/fechada e compra parcelada.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 1, 8);
  let d = await L.db(page);
  const acc = d.accounts[0], card = d.cards[0];
  const tile = async label => L.moneyOf(await page.evaluate(l => [...document.querySelectorAll('#statTiles .tile')].find(x => x.querySelector('.tile-lbl').textContent === l).querySelector('.tile-val').textContent, label));
  // Abre a edição do lançamento, indo ao mês dele na lista de Ganhos e gastos.
  const openEdit = async id => {
    await L.tab(page, 'lancamentos');
    const sel = '#txList [data-edit-tx="' + id + '"]';
    while (!(await page.$(sel)) && await page.$eval('#nextMonth', el => !el.disabled)){ await page.click('#nextMonth'); await L.sleep(60); }
    for (let i = 0; i < 24 && !(await page.$(sel)); i++){ await page.click('#prevMonth'); await L.sleep(60); }
    await page.click(sel); await L.sleep(200);
  };

  L.section('Pix: o valor volta para a conta');
  await L.addTx(page, {amount: 80, pay: 'acc:' + acc.id, desc: 'Tênis', category: 'compras'});
  d = await L.db(page);
  const pix = d.transactions[0];
  await openEdit(pix.id);
  await page.click('#modalRoot [data-m-reversal]'); await L.sleep(250);
  L.ok(await L.modalTitle(page) === 'Registrar estorno' && await page.$eval('#rvAmount', el => el.value) === '80', 'abre o estorno com o valor da compra');
  L.ok(await page.$('#rvInv') === null && /volta para o saldo de Nubank/.test(await L.text(page, '#modalRoot')), 'sem cartão: explica que volta para a conta');
  await L.setVal(page, '#rvAmount', '100');
  await L.submitModal(page); await L.sleep(150);
  L.ok(/não pode passar de R\$\s?80,00/.test(await L.modalError(page)), 'não estorna mais que a compra');
  await L.setVal(page, '#rvAmount', '30');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const rv = d.transactions.find(t => t.reversal);
  L.ok(rv.amount === -30 && rv.reversal.of === pix.id && rv.accountId === acc.id, 'estorno parcial de 30 ligado à compra');
  L.ok(d.transactions.some(t => t.id === pix.id && t.amount === 80), 'compra original continua no histórico');
  const txt = await L.text(page, '#txList');
  L.ok(/Estornado: R\$\s?30,00/.test(txt) && /Estorno de Tênis/.test(txt) && /\+ R\$\s?30,00/.test(txt), 'lista: compra “estornada”, estorno como crédito (+)');
  await L.tab(page, 'cartoes');
  L.ok(L.moneyOf(await L.text(page, '#bankList .account-balance')) === 950, 'saldo: 1000 − 80 + 30 = 950');
  await L.tab(page, 'dashboard');
  L.ok(await tile('Gastos do mês') === 50, 'gastos do mês: 80 − 30 = 50');
  await openEdit(rv.id);
  L.ok(!(await L.modalOpen(page)) && /Estornos não são editados/.test(await L.allToasts(page)), 'estorno não é editado (exclui e registra de novo)');

  L.section('Cartão: fatura já fechada → crédito na próxima, ou escolher a da compra');
  const old = L.dayOffset(-40);
  await L.addTx(page, {amount: 200, pay: 'card:' + card.id, desc: 'Mochila', category: 'compras', date: old});
  d = await L.db(page);
  const moch = d.transactions.find(t => t.description === 'Mochila');
  await openEdit(moch.id);
  await page.click('#modalRoot [data-m-reversal]'); await L.sleep(250);
  const opts = await page.$$eval('#rvInv option', o => o.map(x => [x.value, x.textContent]));
  const def = await page.$eval('#rvInv', el => el.value);
  L.ok(opts.length >= 2 && /fechada|vencida/.test(opts[0][1]) && def !== opts[0][0], 'lista as faturas desde a da compra; padrão: a aberta');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const rv2 = d.transactions.find(t => t.reversal && t.reversal.of === moch.id);
  L.ok(rv2.invoiceKey === def && rv2.cardId === card.id && rv2.amount === -200, 'crédito de 200 na fatura aberta');
  await L.tab(page, 'cartoes');

  L.section('Parcelada: estornar também as parcelas futuras');
  await L.addTx(page, {amount: 300, pay: 'card:' + card.id, install: 3, desc: 'Fone', category: 'compras'});
  d = await L.db(page);
  const fone = d.transactions.filter(t => t.installment && t.installment.baseDescription === 'Fone').sort((a, b) => a.installment.n - b.installment.n);
  await openEdit(fone[0].id);
  await page.click('#modalRoot [data-m-reversal]'); await L.sleep(250);
  L.ok(/Parcelas já cobradas: 1 \(R\$\s?100,00\) · futuras: 2 \(R\$\s?200,00\)/.test(await L.text(page, '#modalRoot')), 'mostra parcelas cobradas e futuras');
  await L.submitModal(page); await L.sleep(400);
  d = await L.db(page);
  const revs = d.transactions.filter(t => t.reversal && fone.some(f => f.id === t.reversal.of));
  L.ok(revs.length === 3 && revs.every(r => r.amount === -100), 'três créditos de 100 (a cobrada e as duas futuras)');
  L.ok(fone.slice(1).every(f => revs.some(r => r.reversal.of === f.id && r.date === f.date)), 'cada parcela futura é estornada na própria data (mesma fatura)');
  await openEdit(fone[0].id);
  await page.click('#modalRoot [data-m-reversal]'); await L.sleep(250);
  L.ok(/já foi estornada por completo/.test(await L.allToasts(page)), 'não deixa estornar de novo o que já foi estornado');
  await L.tab(page, 'cartoes');
  L.ok(/R\$\s?3\.000,00/.test(await L.text(page, '#bankList .credit-card .avail')), 'limite do cartão volta ao total');
});
