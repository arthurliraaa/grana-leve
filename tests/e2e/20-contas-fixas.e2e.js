// Contas fixas: cadastro, vencimentos do mês, pagar (vira gasto), mudar valor, desfazer, encerrar e Início.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  let d = await L.db(page);
  const acc = d.accounts[0];
  const day = new Date().getDate();
  const cur = L.monthKey(0), next = L.monthKey(1);

  L.section('Cadastro');
  await page.goto(L.BASE + '#/compromissos/contas-fixas'); await L.sleep(300);
  L.ok(!(await page.$eval('#tab-fixas', el => el.hidden)) && await page.$eval('#segbtn-fixas', el => el.getAttribute('aria-selected')) === 'true', 'Compromissos tem a aba “Contas fixas” (com endereço próprio)');
  L.ok(await page.$eval('#billStart', el => el.value) === cur && /Nenhuma conta fixa/.test(await L.text(page, '#billMonth')), 'começa no mês atual e sem contas');
  L.ok(await page.$$eval('#billNames option', o => o.length) > 5, 'sugere nomes (água, luz, internet…)');
  const add = async (name, amount, due, every) => {
    await page.type('#billName', name); await page.type('#billAmount', String(amount)); await page.type('#billDay', String(due));
    if (every) await L.setVal(page, '#billEvery', String(every));
    await L.setVal(page, '#billPay', 'acc:' + acc.id);
    await page.click('#billForm button[type=submit]'); await L.sleep(250);
  };
  await add('Luz', 120, 1);
  await add('Internet', 100, 28);
  await add('Seguro', 600, 15, 6);
  d = await L.db(page);
  L.ok(d.bills.length === 3 && d.bills[0].startMonth === cur && d.bills[0].pay === 'acc:' + acc.id, 'contas salvas com início e forma de pagamento');
  const month = await L.text(page, '#billMonth');
  L.ok(/3 conta\(s\) · total R\$\s?820,00 · pagas R\$\s?0,00 · faltam R\$\s?820,00/.test(month), 'resumo do mês: 3 contas, 820');
  if (day > 1) L.ok(/Luz.*Atrasada/.test(month), 'Luz (vence dia 1) aparece atrasada');

  L.section('Início');
  await L.tab(page, 'dashboard');
  L.ok(/Luz/.test(await L.text(page, '#summaryCards')) && /Internet/.test(await L.text(page, '#summaryCards')), 'Início lista as contas fixas em “Próximo compromisso”');
  L.ok(/já tirando R\$\s?820,00 de contas fixas/.test(await L.text(page, '#statTiles')), 'saldo previsto do mês já desconta as contas fixas');

  L.section('Pagar');
  await page.goto(L.BASE + '#/compromissos/contas-fixas'); await L.sleep(300);
  const luz = d.bills.find(b => b.name === 'Luz');
  await page.click('[data-bill-pay="' + luz.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('#bpAmount', el => el.value) === '120' && await page.$eval('#bpPay', el => el.value) === 'acc:' + acc.id, 'vem com o valor e a forma de pagamento da conta');
  L.ok(await page.$eval('#bpKeepField', el => el.hidden), '“usar nos próximos meses” só aparece se mudar o valor');
  await L.setVal(page, '#bpAmount', '135');
  L.ok(!(await page.$eval('#bpKeepField', el => el.hidden)), 'mudou o valor: oferece manter nos próximos meses');
  await page.click('#modalRoot input[name=keep]');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const tx = d.transactions.find(t => t.billId === luz.id);
  const luz2 = d.bills.find(b => b.id === luz.id);
  L.ok(tx && tx.amount === 135 && tx.paymentMethod === 'conta' && tx.accountId === acc.id && tx.billKey === cur && tx.category === 'moradia', 'pagamento vira gasto de 135 na conta, categoria Moradia');
  L.ok(luz2.paid[cur].txId === tx.id && luz2.amounts[0].from === cur && luz2.amounts[0].amount === 135, 'mês marcado como pago e novo valor a partir deste mês');
  L.ok(/pagas R\$\s?135,00/.test(await L.text(page, '#billMonth')) && /Luz.*Paga/.test(await L.text(page, '#billMonth')), 'aparece como paga');
  await L.tab(page, 'cartoes');
  L.ok(L.moneyOf(await L.text(page, '#bankList .account-balance')) === 865, 'saldo da conta 1000 → 865');

  L.section('Próximo mês');
  await page.goto(L.BASE + '#/compromissos/contas-fixas'); await L.sleep(300);
  await page.click('#billNext'); await L.sleep(100);
  const nm = await L.text(page, '#billMonth');
  L.ok(/2 conta\(s\) · total R\$\s?235,00/.test(nm) && !/Seguro/.test(nm), 'mês que vem: Luz (135) e Internet; Seguro só a cada 6 meses');
  await page.click('#billPrev'); await L.sleep(100);

  L.section('Desfazer, mudar valor, encerrar e excluir');
  await page.click('[data-bill-undo="' + luz.id + '"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.transactions.some(t => t.billId) && !d.bills.find(b => b.id === luz.id).paid[cur], 'desfazer tira o gasto e reabre o mês');
  const net = d.bills.find(b => b.name === 'Internet');
  await page.click('[data-bill-edit="' + net.id + '"]'); await L.sleep(150);
  await L.setVal(page, '#beAmount', '110');
  await page.$eval('#beFrom', (el, v) => { el.value = v; }, next);
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  L.ok(d.bills.find(b => b.id === net.id).amounts.some(a => a.from === next && a.amount === 110), 'novo valor da internet vale a partir do mês que vem');
  L.ok(/Internet[^]*R\$\s?100,00/.test(await L.text(page, '#billMonth')), 'este mês continua 100');
  const seg = d.bills.find(b => b.name === 'Seguro');
  await page.click('[data-bill-end="' + seg.id + '"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(250);
  L.ok((await L.db(page)).bills.find(b => b.id === seg.id).endMonth === cur && /Encerrada em/.test(await L.text(page, '#billGrid')), 'encerrar mantém o histórico e para os próximos');
  await page.click('[data-bill-del="' + seg.id + '"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(250);
  L.ok((await L.db(page)).bills.length === 2, 'excluir remove a conta');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'contas fixas cabem no celular');
});
