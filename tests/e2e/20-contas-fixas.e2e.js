// Contas fixas: lançamento automático no dia, "Lançar" para o que veio antes do cadastro, mudar o valor
// de um mês, desfazer (não volta sozinho), painel único e Início.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  let d = await L.db(page);
  const acc = d.accounts[0], cur = L.monthKey(0), day = new Date().getDate();
  const bal = async () => { await L.tab(page, 'cartoes'); return L.moneyOf(await L.text(page, '#bankList .account-balance')); };
  const goBills = async () => { await page.goto(L.BASE + '#/lancamentos/contas-fixas'); await L.sleep(300); };
  const row = async name => page.$$eval('#billMonth > .bill-row', (rs, n) => (rs.find(r => r.querySelector('.tx-desc').textContent.startsWith(n)) || {textContent: ''}).textContent.replace(/\s+/g, ' '), name);

  L.section('Cadastro');
  await goBills();
  L.ok(!(await page.$eval('#tab-fixas', el => el.hidden)) && await page.$eval('#segbtn-fixas', el => el.getAttribute('aria-selected')) === 'true', 'Ganhos e gastos tem a parte “Contas fixas” (são gastos do mês)');
  L.ok(await page.$eval('.sidenav [data-tab="lancamentos"]', el => el.classList.contains('active')), 'menu marca “Ganhos e gastos”');
  L.ok(await page.$('#billGrid') === null, 'um painel só (sem a segunda lista de contas)');
  L.ok(await page.$eval('#billName', el => !el.getAttribute('list')) && /Digite o nome/.test(await page.$eval('#billName', el => el.placeholder)), 'nome livre, sem lista para escolher');
  L.ok(await L.text(page, '#billDayLabel') === 'Dia do pagamento', 'com Pix/débito, o campo é “Dia do pagamento”');
  const add = async (name, amount, due, every) => {
    await page.type('#billName', name); await page.type('#billAmount', String(amount)); await page.type('#billDay', String(due));
    if (every) await L.setVal(page, '#billEvery', String(every));
    await L.setVal(page, '#billPay', 'acc:' + acc.id);
    await page.click('#billForm button[type=submit]'); await L.sleep(300);
  };
  await add('Luz', 120, 1);
  if (day < 28) await add('Internet', 100, 28);
  d = await L.db(page);
  L.ok(d.bills.length === (day < 28 ? 2 : 1) && d.bills[0].startMonth === cur, 'contas salvas');
  if (day > 1){
    L.ok(!d.transactions.some(t => t.billId) && /Antes do cadastro: lance se ainda não lançou/.test(await row('Luz')), 'conta cadastrada depois do dia: não lança sozinha (pode já ter sido lançada à mão)');
  }
  if (day < 28) L.ok(/Lança sozinha em 28\//.test(await row('Internet')), 'vencimento futuro: “Lança sozinha em 28/…”');

  L.section('Lançar com outro valor, mudar valor e desfazer');
  const luz = d.bills.find(b => b.name === 'Luz');
  if (day > 1){
    await page.click('[data-bill-pay="' + luz.id + '"]'); await L.sleep(150);
    L.ok(await page.$eval('#bpAmount', el => el.value) === '120', 'vem com o valor previsto');
    L.ok(await page.$eval('#bpDate', el => el.value) === cur + '-01', 'data sugerida: o dia da conta');
    await L.setVal(page, '#bpAmount', '135');
    await L.setVal(page, '#bpDate', L.dayOffset(0));   // pago hoje (depois do cadastro da conta): desconta do saldo
    await page.click('#modalRoot input[name=keep]');
    await L.submitModal(page); await L.sleep(300);
    d = await L.db(page);
    const tx = d.transactions.find(t => t.billId === luz.id);
    L.ok(tx && tx.amount === 135 && tx.accountId === acc.id && tx.billKey === cur, 'vira gasto de 135 na conta');
    L.ok(d.bills.find(b => b.id === luz.id).amounts[0].amount === 135, 'novo valor vale para os próximos meses');
    L.ok(/Lançada em/.test(await row('Luz')) && /R\$\s?135,00/.test(await row('Luz')), 'aparece como lançada');
    L.ok(await bal() === 865, 'saldo da conta 1000 → 865');
    await goBills();
    await page.click('#billMonth [data-edit-tx="' + tx.id + '"]'); await L.sleep(200);
    L.ok(await L.modalTitle(page) === 'Editar lançamento', '“Mudar valor” abre o lançamento do mês');
    await L.setVal(page, '#mAmount', '140');
    await L.submitModal(page); await L.sleep(300);
    L.ok(/R\$\s?140,00/.test(await row('Luz')), 'linha mostra o valor mudado (140)');
    await page.click('[data-bill-undo="' + luz.id + '"]'); await L.sleep(150);
    await L.submitModal(page); await L.sleep(300);
    d = await L.db(page);
    L.ok(!d.transactions.some(t => t.billId === luz.id) && d.bills.find(b => b.id === luz.id).paid[cur].skipped, 'desfazer tira o gasto e marca como desfeito');
    L.ok(/Não lançada \(você desfez\)/.test(await row('Luz')), 'linha diz que foi desfeita');
    await L.reload(page); await goBills();
    L.ok(!(await L.db(page)).transactions.some(t => t.billId === luz.id), 'desfeita não volta a ser lançada sozinha');
  }

  L.section('Lançamento automático no dia');
  // Cadastrada no meio do mês retrasado (uma data fixa: “há 40 dias” caía depois do dia 1 do mês passado
  // a partir do dia 11, e o teste falhava conforme a data).
  await L.patchDb(page, `u.bills.push({id: 'alug', name: 'Aluguel', category: 'moradia', amount: 800, every: 1, dueDay: 1, startMonth: arg.prev, pay: 'acc:' + arg.acc, amounts: [], paid: {}, createdAt: new Date(arg.made + 'T12:00:00').getTime()});`,
    {prev: L.monthKey(-1), made: L.monthKey(-2) + '-15', acc: acc.id});
  await goBills(); await L.sleep(300);
  d = await L.db(page);
  const auto = d.transactions.filter(t => t.billId === 'alug');
  L.ok(auto.length === 2 && auto.every(t => t.autoBill && t.amount === 800 && t.accountId === acc.id), 'conta antiga: o mês passado e este entram sozinhos (800 cada)');
  L.ok(/conta(s)? fixa(s)? (foi|foram) lançada(s)? sozinha/.test(await L.allToasts(page)), 'avisa que lançou sozinho');
  L.ok(/Lançada sozinha em/.test(await row('Aluguel')), 'linha mostra “Lançada sozinha”');
  await L.reload(page); await goBills();
  L.ok((await L.db(page)).transactions.filter(t => t.billId === 'alug').length === 2, 'não lança de novo ao recarregar');

  L.section('Todas as contas: editar, encerrar e excluir no mesmo painel');
  await page.click('#billAll summary'); await L.sleep(100);
  await page.click('#billAll [data-bill-edit="alug"]'); await L.sleep(150);
  await L.setVal(page, '#beAmount', '850');
  await L.submitModal(page); await L.sleep(250);
  L.ok((await L.db(page)).bills.find(b => b.id === 'alug').amounts.some(a => a.amount === 850), 'mudar o valor a partir de um mês');
  await page.click('#billAll summary').catch(() => {});
  if (!(await page.$eval('#billAll', el => el.open))) await page.click('#billAll summary');
  await page.click('#billAll [data-bill-end="alug"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(250);
  L.ok((await L.db(page)).bills.find(b => b.id === 'alug').endMonth === cur, 'encerrar');
  if (!(await page.$eval('#billAll', el => el.open))) await page.click('#billAll summary');
  await page.click('#billAll [data-bill-del="' + luz.id + '"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(250);
  L.ok(!(await L.db(page)).bills.some(b => b.id === luz.id), 'excluir');

  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
