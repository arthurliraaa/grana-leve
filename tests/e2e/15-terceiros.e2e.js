// Gasto pago para outra pessoa: fora dos seus gastos, devolução que não é ganho, "não vai devolver",
// lista de pessoas e "Eu devo" sem repetir as compras parceladas do cartão.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const tile = async label => page.evaluate(l => {
    const t = [...document.querySelectorAll('#statTiles .tile')].find(x => x.querySelector('.tile-lbl').textContent === l);
    return t ? {val: t.querySelector('.tile-val').textContent, sub: (t.querySelector('.tile-sub') || {}).textContent || ''} : null;
  }, label);
  const bal = async () => L.moneyOf(await L.text(page, '#accountList .account-balance'));

  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  let d = await L.db(page);
  const acc = d.accounts[0];

  L.section('Paguei por outra pessoa');
  await L.tab(page, 'lancamentos');
  await page.type('#txAmount', '100');
  await L.setVal(page, '#txPayment', 'acc:' + acc.id);
  await page.type('#txDesc', 'Ingresso do show');
  await page.click('#txForOther'); await L.sleep(50);
  await page.type('#txOtherName', 'Maria');
  await page.click('#txForm button[type=submit]'); await L.sleep(300);
  d = await L.db(page);
  const tx = d.transactions[0], recv = d.receivables[0];
  L.ok(recv.linked === true && recv.person === 'Maria' && tx.forOther && tx.forOther.receivableId === recv.id, 'gasto fica ligado ao “A receber” da Maria');
  L.ok(/Pago por Maria · vai devolver · fora dos seus gastos/.test(await L.text(page, '#txList')), 'lista mostra a etiqueta “pago por Maria”');
  L.ok(/gastos R\$\s?0,00/.test(await L.text(page, '#txSummary')) && /pagos por outras pessoas R\$\s?100,00 \(fora dos gastos\)/.test(await L.text(page, '#txSummary')), 'resumo do mês: gastos 0 e 100 pagos por outras pessoas');
  await L.setVal(page, '#txFilterType', 'others'); await L.sleep(100);
  L.ok(await page.$$eval('#txList .tx-row', r => r.length) === 1, 'filtro “Pagos por outras pessoas” mostra o gasto');
  await L.setVal(page, '#txFilterType', 'all');
  await L.tab(page, 'dashboard');
  let g = await tile('Gastos do mês');
  L.ok(L.moneyOf(g.val) === 0 && /Fora daqui: R\$\s?100,00 pagos por outras pessoas/.test(g.sub), 'painel: não entra em “Gastos do mês” e aparece à parte');
  await L.tab(page, 'cartoes');
  L.ok(await bal() === 900, 'o dinheiro saiu da conta (1000 → 900)');

  L.section('Devolução não é ganho');
  await L.tab(page, 'receber');
  await page.click('[data-recv-get="' + recv.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('input[name=as][value=refund]', el => el.checked), 'gasto pago pela pessoa: começa como devolução');
  await page.$eval('#rcvOther', el => { el.value = ''; }); await page.type('#rcvOther', '60');
  await L.setVal(page, '#rcvAcc', acc.id);
  L.ok(/R\$\s?60,00 sai do que Maria te deve; entra no saldo de Nubank; não conta como ganho/.test(await L.text(page, '#rcvEffect')), 'explica o efeito antes de confirmar');
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  const refund = d.transactions.find(t => t.refund);
  L.ok(refund && refund.amount === 60 && refund.accountId === acc.id && refund.receivableId === recv.id, 'devolução registrada na conta');
  await L.tab(page, 'cartoes');
  L.ok(await bal() === 960, 'saldo volta 60 (900 → 960)');
  await L.tab(page, 'dashboard');
  L.ok(L.moneyOf((await tile('Ganhos do mês')).val) === 0, 'devolução não conta em “Ganhos do mês”');
  L.ok(L.moneyOf((await tile('A receber')).val) === 40, 'falta receber 40');

  L.section('Não vai devolver');
  await L.tab(page, 'receber');
  await page.click('[data-recv-forgive="' + recv.id + '"]'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Não vai devolver?' && await page.$eval('#modalRoot input[name=own]', el => el.checked), 'pergunta e já sugere contar como gasto seu');
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  const off = d.transactions.find(t => t.writeOff);
  L.ok(off && off.amount === 40 && off.paymentMethod === null && d.receivables[0].forgiven === true, 'vira gasto de 40 sem mexer em conta');
  L.ok(/Não vai devolver \(R\$\s?40,00\)/.test(await L.text(page, '#recvGrid')), 'Me devem mostra “não vai devolver”');
  await L.tab(page, 'dashboard');
  L.ok(L.moneyOf((await tile('Gastos do mês')).val) === 40 && L.moneyOf((await tile('A receber')).val) === 0, 'painel: gastos 40 e nada a receber');
  await L.tab(page, 'cartoes');
  L.ok(await bal() === 960, 'saldo continua 960');

  L.section('Lista de pessoas');
  await L.tab(page, 'receber');
  L.ok(await page.$$eval('#peopleList option', o => o.map(x => x.value).join()) === 'Maria', 'nomes já usados aparecem como sugestão');
  L.ok(await page.$eval('#recvPerson', el => el.getAttribute('list')) === 'peopleList' && await page.$eval('#txOtherName', el => el.getAttribute('list')) === 'peopleList', 'sugestão no “A receber” e no “paguei por outra pessoa”');

  L.section('Ganho combinado');
  await page.type('#recvPerson', 'João'); await page.type('#recvTotal', '50');
  await L.setVal(page, '#recvKind', 'combinado');
  await page.click('#recvForm button[type=submit]'); await L.sleep(250);
  d = await L.db(page);
  const joao = d.receivables.find(r => r.person === 'João');
  await page.click('[data-recv-get="' + joao.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('input[name=as][value=income]', el => el.checked), 'valor combinado começa como ganho');
  await L.submitModal(page); await L.sleep(250);
  await L.tab(page, 'dashboard');
  L.ok(L.moneyOf((await tile('Ganhos do mês')).val) === 50, 'conta como ganho do mês');

  L.section('Eu devo sem repetir as parceladas');
  await L.addCard(page, 'Inter', 3000, 5, 12);
  d = await L.db(page);
  await L.tab(page, 'lancamentos');
  await page.type('#txAmount', '300');
  await L.setVal(page, '#txPayment', 'card:' + d.cards[0].id);
  await L.setVal(page, '#txInstall', '3');
  await page.click('#txForm button[type=submit]'); await L.sleep(300);
  await L.tab(page, 'dividas');
  L.ok(await page.$$eval('#installDebtWrap .debt-card', x => x.length) === 0 && /1 compra\(s\) parcelada\(s\) no cartão/.test(await L.text(page, '#installDebtWrap')), 'Eu devo só avisa (a lista fica nos cartões)');
  await page.click('[data-goto="cartoes"]'); await L.sleep(200);
  L.ok(await page.evaluate(() => location.hash) === '#/contas', '“Ver nos cartões” leva para Contas e cartões');
  L.ok(await page.$eval('#cardList .credit-card details.budget-details:last-of-type', el => !el.open), 'parceladas do cartão começam recolhidas');
  await L.tab(page, 'dashboard');
  g = await tile('Dívida restante');
  L.ok(L.moneyOf(g.val) === 0 && /Parcelas do cartão à parte/.test(g.sub), '“Dívida restante” não soma as parcelas do cartão de novo');
});
