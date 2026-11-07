// Excluir lançamento com itens ligados (A2-03, A2-06): a compra leva junto o estorno e o "A receber"
// (depois de perguntar), e o gasto de conta fixa excluído à mão vale como "Desfazer".
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 3, 10);
  let d = await L.db(page);
  const acc = d.accounts[0], card = d.cards[0], today = L.dayOffset(0), cur = L.monthKey(0);
  const gastos = async () => {
    await L.tab(page, 'dashboard'); await L.sleep(150);
    return L.moneyOf(await page.evaluate(() => { const t = [...document.querySelectorAll('#statTiles .tile')].find(e => e.querySelector('.tile-lbl').firstChild.textContent.trim() === 'Gastos do mês'); return t ? t.querySelector('.tile-val').textContent : ''; }));
  };
  // Clica na lixeira do lançamento, indo ao mês dele na lista de Ganhos e gastos.
  const clickDel = async id => {
    await L.tab(page, 'lancamentos');
    const sel = '#txList [data-del-tx="' + id + '"]';
    while (!(await page.$(sel)) && await page.$eval('#nextMonth', el => !el.disabled)){ await page.click('#nextMonth'); await L.sleep(60); }
    for (let i = 0; i < 24 && !(await page.$(sel)); i++){ await page.click('#prevMonth'); await L.sleep(60); }
    await page.$eval(sel, el => el.click()); await L.sleep(200);
  };

  L.section('Compra com estorno');
  await L.patchDb(page, `
    const t = (id, o) => u.transactions.push(Object.assign({id, type: 'expense', category: 'lazer', date: arg.today, description: id, createdAt: 1, paymentMethod: 'conta', accountId: arg.acc}, o));
    t('Lanche', {amount: 50});
    t('Tenis', {amount: 80, category: 'compras', createdAt: 2});
    t('rv1', {amount: -30, description: 'Estorno de Tenis', reversal: {of: 'Tenis'}, createdAt: 3});
  `, {today, acc: acc.id});
  L.ok(await gastos() === 100, 'antes: gastos do mês 50 + 80 − 30 = 100');
  await clickDel('Tenis');
  L.ok(await L.modalTitle(page) === 'Excluir a compra e o que está ligado a ela?', 'pergunta na janela do app (título)');
  const msg1 = await L.text(page, '#modalRoot');
  L.ok(/Também apaga o estorno ligado \(R\$\s?30,00\)/.test(msg1), 'a mensagem diz que o estorno vai junto');
  L.ok(/Excluir tudo/.test(await L.text(page, '#modalRoot .modal-actions')), 'botão “Excluir tudo”');
  await L.closeModal(page);
  d = await L.db(page);
  L.ok(d.transactions.some(t => t.id === 'Tenis') && d.transactions.some(t => t.id === 'rv1'), 'cancelar não apaga nada');
  await clickDel('Tenis');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => t.id === 'Tenis' || t.id === 'rv1'), 'confirmar apaga a compra e o estorno');
  L.ok(!d.transactions.some(t => t.reversal && !d.transactions.some(x => x.id === t.reversal.of)), 'nenhum estorno órfão');
  L.ok(await gastos() === 50, 'gastos do mês voltam a 50 (o valor de antes da compra)');
  await L.reload(page);
  L.ok(await gastos() === 50 && !(await L.db(page)).transactions.some(t => t.reversal), 'depois de recarregar continua 50, sem estorno');

  L.section('Compra parcelada paga por outra pessoa, com recebimento registrado');
  await L.patchDb(page, `
    u.receivables = (u.receivables || []).concat([
      {id: 'rM', person: 'Maria', kind: 'cartao', description: 'Celular', totalAmount: 300, receivedAmount: 100, linked: true, installments: 3, installmentAmount: 100,
        payments: [{id: 'p1', date: arg.today, amount: 100, accountId: arg.acc, asIncome: false, txId: 'dev1'}], createdAt: 1},
      {id: 'rJ', person: 'João', description: 'Outro', totalAmount: 40, receivedAmount: 0, payments: [], createdAt: 1}]);
    const dates = [arg.today, arg.d2, arg.d3];
    [1, 2, 3].forEach(n => u.transactions.push({id: 'cel' + n, type: 'expense', amount: 100, category: 'compras', date: dates[n - 1], purchaseDate: arg.today,
      description: 'Celular (' + n + '/3)', paymentMethod: 'cartao', cardId: arg.card, createdAt: 10 + n,
      installment: {group: 'gcel', n, total: 3, totalAmount: 300, baseDescription: 'Celular'}, forOther: {person: 'Maria', receivableId: 'rM'}}));
    u.transactions.push({id: 'dev1', type: 'income', amount: 100, category: 'recebimento', date: arg.today, description: 'Devolução de Maria', paymentMethod: null, accountId: arg.acc, receivableId: 'rM', refund: true, createdAt: 20});
    u.transactions.push({id: 'pao', type: 'expense', amount: 40, category: 'alimentacao', date: arg.today, description: 'Pão', paymentMethod: 'conta', accountId: arg.acc, forOther: {person: 'João', receivableId: 'rJ'}, createdAt: 21});
  `, {today, d2: L.plusMonths(today, 1), d3: L.plusMonths(today, 2), acc: acc.id, card: card.id});
  await clickDel('cel1');
  L.ok(await L.modalTitle(page) === 'Excluir a compra e o que está ligado a ela?', 'pergunta antes de apagar');
  const msg2 = await L.text(page, '#modalRoot');
  L.ok(/apaga as 3 parcelas/.test(msg2) && /o valor a receber de Maria em “Me devem”/.test(msg2) && /o recebimento já registrado/.test(msg2), 'a mensagem diz o que vai junto: parcelas, “A receber” de Maria e o recebimento');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => t.installment && t.installment.group === 'gcel') && !d.transactions.some(t => t.id === 'dev1'), 'apaga as parcelas e o recebimento ligado');
  L.ok(!d.receivables.some(r => r.id === 'rM'), 'apaga o “A receber” de Maria');
  L.ok(d.receivables.some(r => r.id === 'rJ') && d.transactions.some(t => t.id === 'pao'), 'o que não está ligado fica');
  await L.reload(page);
  d = await L.db(page);
  L.ok(!d.receivables.some(r => r.id === 'rM') && !d.transactions.some(t => t.id === 'dev1' || (t.forOther && t.forOther.receivableId === 'rM')), 'depois de recarregar continua tudo apagado');

  L.section('Lançamento sem nada ligado: como antes');
  await L.addTx(page, {amount: 12, desc: 'Café', pay: 'acc:' + acc.id});
  d = await L.db(page);
  const cafe = d.transactions.find(t => t.description === 'Café');
  await clickDel(cafe.id);
  L.ok(await L.modalTitle(page) === 'Excluir lançamento?' && !/Também apaga/.test(await L.text(page, '#modalRoot')), 'pergunta simples, sem itens ligados');
  await L.submitModal(page); await L.sleep(250);
  L.ok(!(await L.db(page)).transactions.some(t => t.id === cafe.id), 'exclui');

  L.section('Conta fixa lançada sozinha e excluída à mão');
  await L.patchDb(page, `u.bills.push({id: 'alug', name: 'Aluguel', category: 'moradia', amount: 800, every: 1, dueDay: 1, startMonth: arg.cur, pay: 'acc:' + arg.acc, amounts: [], paid: {}, createdAt: new Date(arg.made + 'T12:00:00').getTime()});`,
    {cur, made: L.monthKey(-1) + '-15', acc: acc.id});
  await L.sleep(300);
  d = await L.db(page);
  const auto = d.transactions.find(t => t.billId === 'alug' && t.billKey === cur);
  L.ok(auto && auto.autoBill, 'a conta fixa do mês foi lançada sozinha');
  await clickDel(auto.id);
  L.ok(/A conta fixa “Aluguel” fica como não lançada neste mês/.test(await L.text(page, '#modalRoot')), 'a mensagem avisa que a conta fica como não lançada');
  L.ok(!(await page.$('#modalRoot input[name=skip]')), 'com conta fixa a pergunta não oferece “Não perguntar novamente”');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => t.billId === 'alug') && d.bills.find(b => b.id === 'alug').paid[cur].skipped, 'excluir vale como “Desfazer”: o mês fica pulado');
  await L.reload(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => t.billId === 'alug'), 'depois de recarregar a conta não é lançada de novo');
  await page.goto(L.BASE + '#/lancamentos/contas-fixas'); await L.sleep(300);
  const row = await page.$$eval('#billMonth > .bill-row', rs => (rs.find(r => r.querySelector('.tx-desc').textContent.startsWith('Aluguel')) || {textContent: ''}).textContent.replace(/\s+/g, ' '));
  L.ok(/Não lançada/.test(row), 'a linha da conta mostra “Não lançada”');

  L.section('Compra parcelada adiantada e cobrança compartilhada (A4, A2)');
  await L.patchDb(page, `
    u.receivables = (u.receivables || []).concat([{id: 'rL', person: 'Lia Souza', kind: 'cartao', description: 'Notebook', totalAmount: 300, receivedAmount: 0, linked: true,
      installments: 3, installmentAmount: 100, sharedId: 'sh1', sharedWith: true, payments: [], createdAt: 1}]);
    const dates = [arg.today, arg.d2, arg.d3];
    [1, 2, 3].forEach(n => u.transactions.push({id: 'nb' + n, type: 'expense', amount: 100, category: 'compras', date: dates[n - 1], purchaseDate: arg.today,
      description: 'Notebook (' + n + '/3)', paymentMethod: 'cartao', cardId: arg.card, createdAt: 30 + n,
      installment: {group: 'gnb', n, total: 3, totalAmount: 300, baseDescription: 'Notebook'}, forOther: {person: 'Lia Souza', receivableId: 'rL'}}));
  `, {today, d2: L.plusMonths(today, 1), d3: L.plusMonths(today, 2), card: card.id});
  await L.tab(page, 'cartoes'); await L.sleep(150);
  await page.$eval('[data-adv-group="gnb"]', el => el.click()); await L.sleep(200);
  await L.setVal(page, '#advCount', '2');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const advTx = d.transactions.find(t => t.installmentAdvance && t.installmentAdvance.group === 'gnb');
  L.ok(advTx && advTx.amount === 200, 'adiantou as 2 últimas parcelas (200)');
  await clickDel('nb1');
  const msg3 = await L.text(page, '#modalRoot');
  L.ok(/apaga a parcela desta compra/.test(msg3) && /o adiantamento de parcelas \(R\$\s?200,00\)/.test(msg3), 'a mensagem diz que o adiantamento vai junto');
  L.ok(/A cobrança compartilhada também deixa de existir para Lia\./.test(msg3), 'avisa que a cobrança compartilhada deixa de existir');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => (t.installment && t.installment.group === 'gnb') || (t.installmentAdvance && t.installmentAdvance.group === 'gnb')), 'apaga a parcela restante e o adiantamento');
  L.ok(!d.receivables.some(r => r.id === 'rL'), 'apaga o “A receber” da compra');
  L.ok(!d.transactions.some(t => t.forOther && t.forOther.receivableId === 'rL'), 'nenhum lançamento órfão apontando para o “A receber”');
});
