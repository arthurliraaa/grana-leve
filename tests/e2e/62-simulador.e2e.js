// Simulador em Ganhos e gastos: compra à vista e parcelada, dinheiro da meta (com aviso), empréstimo e gasto fixo.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1.000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 28, 5);
  await L.patchDb(page, `u.goals.push({id: 'gv', name: 'Viagem', targetAmount: 5000, currentAmount: 2000, targetDate: null, urgency: 'media', deletedAt: null, createdAt: 1,
    moves: [{id: 'm1', date: arg.d, amount: 2000, kind: 'deposit'}]});`, {d: L.dayOffset(-5)});
  const open = async () => { await L.tab(page, 'lancamentos'); await page.$eval('#segbtn-simular', e => e.click()); await L.sleep(300); };
  const result = () => L.text(page, '#simResult');

  L.section('Compra à vista');
  await open();
  L.ok(!(await page.$eval('#tab-simular', e => e.hidden)) && /Simular/.test(await L.text(page, '#segbtn-simular')), 'a guia “Simular” fica em Ganhos e gastos, ao lado de Lançamentos e Contas fixas');
  await page.type('#simName', 'Geladeira'); await page.type('#simAmount', '400');
  await L.setVal(page, '#simPay', 'acc:' + (await L.db(page)).accounts[0].id); await L.sleep(250);
  L.ok(/Cabe nas contas/.test(await result()) && /Simulação/.test(await result()) && /Sobra com/.test(await result()), 'R$ 400 com R$ 1.000 nas contas: cabe, com a tabela por mês');
  await page.$eval('#simAmount', e => { e.value = ''; }); await page.type('#simAmount', '5.000'); await L.sleep(250);
  L.ok(/no vermelho/.test(await result()), 'R$ 5.000 deixa o saldo no vermelho');
  await page.$eval('#simAmount', e => { e.value = ''; }); await page.type('#simAmount', '300'); await L.sleep(200);
  await page.click('#simSubmit'); await L.sleep(400);
  let d = await L.db(page);
  L.ok(d.transactions.some(t => t.description === 'Geladeira' && t.amount === 300 && t.paymentMethod === 'conta' && t.accountId === d.accounts[0].id), '“Registrar de verdade” lança o gasto na conta');

  L.section('Compra parcelada no cartão');
  await open();
  await page.type('#simName', 'Notebook'); await page.type('#simAmount', '1.200');
  await L.setVal(page, '#simPay', 'card:' + d.cards[0].id); await L.sleep(200);
  await page.$eval('#simN', e => { e.value = '3'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(300);
  const r2 = await result();
  L.ok(/Compra em .* fecha dia 28 e vence dia 5/.test(r2) && /entra na fatura de/.test(r2) && /3 parcelas de cerca de R\$\s?400,00, uma por fatura/.test(r2) && /Limite do cartão/.test(r2), 'mostra a fatura onde entra, as parcelas e o limite do cartão');
  L.ok(/Limite do cartão · Inter/.test(r2) && /Disponível agora\s*R\$\s?3\.000,00/.test(r2) && /Disponível depois\s*R\$\s?1\.800,00/.test(r2), 'mostra o limite do cartão: disponível agora (3.000) e depois da compra (1.800)');
  await page.$eval('#simAmount', e => { e.value = ''; }); await page.type('#simAmount', '5.000'); await L.sleep(300);
  const rOver = await result();
  L.ok(/Não cabe no limite do cartão: faltam R\$\s?2\.000,00/.test(rOver) && /não cabe: faltam/.test(rOver), 'compra maior que o limite disponível: avisa que não cabe e quanto falta (2.000)');
  await page.$eval('#simAmount', e => { e.value = ''; }); await page.type('#simAmount', '1.200'); await L.sleep(300);
  await page.click('#simSubmit'); await L.sleep(500);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => /Notebook/.test(t.description || '') || (t.installment && /Notebook/.test(t.installment.baseDescription || ''))).length === 3, 'registrar cria as 3 parcelas nas faturas');

  L.section('Dinheiro da meta');
  await open();
  await page.type('#simName', 'Passagem'); await page.type('#simAmount', '800');
  await L.setVal(page, '#simPay', 'goal:gv'); await L.sleep(250);
  L.ok(/Sai do que você guardou em “Viagem”/.test(await result()) && /40% → 24%/.test(await result()), 'mostra quanto a meta fica (40% → 24%)');
  await page.click('input[name=purpose][value=outro]'); await L.sleep(250);
  L.ok(/Cuidado/.test(await result()) && /outra coisa/.test(await result()), 'usar para outra coisa mostra o aviso de cuidado');
  await page.click('#simSubmit'); await L.sleep(500);
  d = await L.db(page);
  const goal = d.goals.find(g => g.id === 'gv'), last = goal.moves[goal.moves.length - 1];
  L.ok(goal.currentAmount === 1200 && last.kind === 'withdraw' && last.purpose === 'outro' && last.txId, 'tirou 800 da meta, marcado como “outra coisa” e ligado ao lançamento');
  const gasto = d.transactions.find(t => t.id === last.txId);
  L.ok(gasto && gasto.goalId === 'gv' && gasto.accountId === null && /da meta Viagem/.test(gasto.description), 'e entrou em Ganhos e gastos sem mexer no saldo das contas');

  await L.tab(page, 'conselhos'); await L.sleep(300);
  L.ok(/usou dinheiro da meta “Viagem” para outra coisa/.test(await L.text(page, '#adviceList')), 'o uso da meta para outra coisa vira um conselho de atenção');

  L.section('Simular um ganho');
  await open();
  await page.click('input[name=kind][value=ganho]'); await L.sleep(150);
  await page.type('#simName', 'Bônus'); await page.type('#simIncAmount', '500');
  await L.setVal(page, '#simIncStart', '0'); await L.sleep(300);
  const rg = await result();
  L.ok(/Com esse ganho/.test(rg) && /R\$\s?500,00 a mais/.test(rg) && /Entra uma vez só/.test(rg), 'ganho único: mostra quanto o saldo fica e quanto a mais');
  await L.setVal(page, '#simIncFreq', 'monthly'); await L.sleep(300);
  L.ok(/R\$\s?6\.000,00 em um ano/.test(await result()), 'ganho todo mês: 500 × 12 = 6.000 em um ano');
  await L.setVal(page, '#simIncFreq', 'once'); await L.sleep(200);
  await page.click('#simSubmit'); await L.sleep(400);
  d = await L.db(page);
  L.ok(d.transactions.some(t => t.type === 'income' && t.description === 'Bônus' && t.amount === 500), 'registrar o ganho único lança a entrada');
  await open();
  await page.click('input[name=kind][value=ganho]'); await L.sleep(150);
  await page.type('#simName', 'Aumento'); await page.type('#simIncAmount', '300');
  await L.setVal(page, '#simIncFreq', 'monthly'); await L.sleep(200);
  await page.click('#simSubmit'); await L.sleep(400);
  d = await L.db(page);
  L.ok(d.forecasts.some(f => f.description === 'Aumento' && f.amount === 300 && f.recurring === true), 'ganho todo mês vira uma previsão recorrente');

  L.section('Empréstimo e gasto fixo');
  await open();
  await page.click('input[name=kind][value=emprestimo]'); await L.sleep(150);
  await page.type('#simName', 'Financiamento'); await page.type('#simParcel', '100'); await L.sleep(250);
  L.ok(/12 parcelas de R\$\s?100,00 = R\$\s?1\.200,00/.test(await result()), 'empréstimo: 12 × 100 = 1.200');
  await page.click('#simSubmit'); await L.sleep(400);
  d = await L.db(page);
  L.ok(d.debts.some(x => x.name === 'Financiamento' && x.totalAmount === 1200 && x.monthlyPayment === 100), 'registrar cria a dívida em Compromissos');
  await open();
  await page.click('input[name=kind][value=fixo]'); await L.sleep(150);
  await page.type('#simName', 'Academia'); await page.type('#simMonthly', '90'); await L.sleep(250);
  L.ok(/R\$\s?1\.080,00 em um ano/.test(await result()), 'gasto fixo: 90 por mês = 1.080 em um ano');
  await page.click('#simSubmit'); await L.sleep(400);
  d = await L.db(page);
  L.ok(d.bills.some(b => b.name === 'Academia' && b.amount === 90), 'registrar cria a conta fixa');
  // O resultado nunca passa da caixa, em qualquer largura (tabela em telas largas, cartões por mês nas estreitas).
  for (const w of [1280, 1000, 820, 600, 360]){
    await page.setViewport({width: w, height: 800}); await L.sleep(200);
    await open(); await page.type('#simName', 'Teste'); await page.type('#simAmount', '300'); await L.sleep(250);
    const fits = await page.evaluate(() => { const r = document.getElementById('simResult').getBoundingClientRect(), c = document.querySelector('.sim-card').getBoundingClientRect(); return r.right <= c.right + 1 && r.left >= c.left - 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
    L.ok(fits, 'o resultado cabe na caixa com a tela em ' + w + 'px');
  }
});
