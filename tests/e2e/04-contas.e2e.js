// Contas bancárias: saldo, transferências e pagamento de fatura escolhendo a conta.
import * as L from './lib.js';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

L.run(async ({page}) => {
  await L.signup(page);
  const yesterday = L.dayOffset(-1), tomorrow = L.dayOffset(1);
  const bal = async name => page.evaluate((name) => {
    const card = [...document.querySelectorAll('#accountList .account-card')].find(c => c.querySelector('h4').textContent.trim() === name);
    return card ? card.querySelector('.account-balance').textContent : null;
  }, name).then(t => t === null ? null : L.moneyOf(t));
  // Mês das datas de ontem/amanhã: só contam no total do mês se forem do mês atual.
  const cur = L.monthKey(0);
  const inMonth = s => s.slice(0, 7) === cur;

  L.section('Sem contas: tudo como antes');
  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txPayment option', o => o.textContent) === 'Dinheiro, Pix ou débito', 'pagamento padrão continua “Dinheiro, Pix ou débito”');
  await page.click('#typeToggle [data-type="income"]');
  L.ok(await page.$eval('#txAccountField', el => el.hidden), 'sem “Entrou em” quando não há contas');
  await page.click('#typeToggle [data-type="expense"]');
  await L.tab(page, 'cartoes');
  L.ok(await L.text(page, '.sidenav [data-tab="cartoes"]') === 'Contas e cartões', 'menu tem “Contas e cartões”');
  L.ok(/Nenhuma conta cadastrada/.test(await L.text(page, '#accountList')), 'mensagem de nenhuma conta');
  L.ok(await page.$eval('#transferBtn', el => el.hidden), 'sem botão de transferir');

  L.section('Cadastrar contas');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(200);
  await page.type('#accName', 'Itaú'); await page.type('#accBalance', '500');
  await page.click('#accountForm button[type=submit]'); await L.sleep(200);
  L.ok(await bal('Nubank') === 1000 && await bal('Itaú') === 500, 'saldos iniciais 1000 e 500');
  L.ok(!(await page.$eval('#transferBtn', el => el.hidden)), 'botão de transferir aparece com 2 contas');
  let d = await L.db(page);
  const nu = d.accounts.find(a => a.name === 'Nubank'), it = d.accounts.find(a => a.name === 'Itaú');
  await L.tab(page, 'dashboard');
  L.ok(/Disponível nas contas\s*R\$\s?1\.500,00/.test(await L.text(page, '#statTiles')), 'painel mostra o saldo nas contas');

  L.section('Gastos e ganhos ligados à conta');
  await L.tab(page, 'lancamentos');
  const payOpts = await page.$$eval('#txPayment option', os => os.map(o => o.value + '=' + o.textContent));
  L.ok(payOpts[0] === 'acc:' + nu.id + '=Pix ou débito · Nubank' && payOpts.some(o => o === 'conta=Dinheiro (fora das contas)'), 'contas aparecem na forma de pagamento');
  L.ok(await page.$eval('#txPayment', el => el.value) === 'acc:' + nu.id, 'primeira conta vem marcada no formulário');
  await page.type('#txAmount', '100');
  await page.type('#txDesc', 'Farmácia');
  await page.click('#txForm button[type=submit]'); await L.sleep(250);
  d = await L.db(page);
  L.ok(d.transactions.some(t => t.description === 'Farmácia' && t.accountId === nu.id && t.paymentMethod === 'conta'), 'gasto salvo na conta Nubank');
  L.ok(/Farmácia.*Nubank/.test(await L.text(page, '#txList')), 'lista mostra a conta do gasto');
  await L.addTx(page, {type: 'income', amount: 300, desc: 'Freela'});
  d = await L.db(page);
  const freela = d.transactions.find(t => t.description === 'Freela');
  L.ok(freela && freela.accountId === nu.id, 'ganho pelo popup entra na 1ª conta por padrão');
  await page.click('#txList [data-edit-tx="' + freela.id + '"]'); await L.sleep(150);
  L.ok(!(await page.$eval('#mAccField', el => el.hidden)), 'edição de ganho mostra “Entrou em”');
  await L.setVal(page, '#mAcc', it.id);
  await L.submitModal(page);
  await L.tab(page, 'cartoes');
  L.ok(await bal('Nubank') === 900 && await bal('Itaú') === 800, 'saldos: Nubank 900 (−100), Itaú 800 (+300)');
  await L.tab(page, 'lancamentos');
  L.ok(/Freela.*Em Itaú/.test(await L.text(page, '#txList')), 'ganho mostra “Em Itaú”');

  L.section('Datas antes do cadastro e no futuro não mexem no saldo');
  await L.addTx(page, {amount: 40, date: yesterday, desc: 'Ontem'});
  await L.addTx(page, {amount: 60, date: tomorrow, desc: 'Amanhã'});
  await L.tab(page, 'cartoes');
  L.ok(await bal('Nubank') === 900, 'gasto de ontem e de amanhã não mudam o saldo de hoje');
  // “Gastos do mês” conta só o realizado (data até hoje); o de amanhã é agendado.
  const expensesMonth = 100 + (inMonth(yesterday) ? 40 : 0);

  L.section('Transferência');
  await page.click('#transferBtn'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Transferir entre contas', 'abre o popup de transferência');
  await L.setVal(page, '#trTo', nu.id);
  await page.type('#trAmount', '200');
  await L.submitModal(page);
  L.ok(/contas diferentes/.test(await L.modalError(page)), 'recusa mesma conta');
  await L.setVal(page, '#trTo', it.id);
  await page.type('#trDesc', 'reserva');
  await L.submitModal(page);
  L.ok(await bal('Nubank') === 700 && await bal('Itaú') === 1000, 'Nubank 700 e Itaú 1000 depois de transferir 200');
  await L.tab(page, 'dashboard');
  const tiles = await L.text(page, '#statTiles');
  L.ok(/Ganhos do mês\s*R\$\s?300,00/.test(tiles), 'transferência não conta como ganho');
  L.ok(L.moneyOf(tiles.match(/Gastos do mês\s*(R\$\s?[\d.,]+)/)[1]) === expensesMonth, 'transferência não conta como gasto');
  L.ok(/Disponível nas contas\s*R\$\s?1\.700,00/.test(tiles), 'total nas contas continua igual');
  await L.tab(page, 'cartoes');
  await page.evaluate(() => document.querySelectorAll('#accountList details').forEach(x => { x.open = true; }));
  const accTxt = await L.text(page, '#accountList');
  L.ok(/Para Itaú · reserva/.test(accTxt) && /De Nubank · reserva/.test(accTxt), 'movimentações mostram a transferência nas duas contas');
  await page.click('#accountList [data-transfer-del]'); await L.sleep(150);
  await L.submitModal(page);
  L.ok(await bal('Nubank') === 900 && await bal('Itaú') === 800, 'excluir a transferência devolve os saldos');

  L.section('Pagar fatura com a conta de outro banco');
  await L.addCard(page, 'Nubank Roxinho', 2000, 28, 5);
  d = await L.db(page);
  const card = d.cards[0];
  await L.addTx(page, {amount: 250, pay: 'card:' + card.id, desc: 'Tênis'});
  await L.tab(page, 'cartoes');
  L.ok(await bal('Nubank') === 900, 'compra no cartão não mexe na conta');
  let paidBtn = await page.$('[data-inv-paid="' + card.id + '"]');
  if (!paidBtn){ await page.click('[data-inv-shift="' + card.id + '"][data-dir="1"]'); await L.sleep(100); paidBtn = await page.$('[data-inv-paid="' + card.id + '"]'); }
  await paidBtn.click(); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Pagar fatura', 'pergunta de qual conta sai o pagamento');
  L.ok(/R\$\s?250,00/.test(await L.text(page, '#modalRoot')), 'mostra o total da fatura');
  await L.setVal(page, '#ipAcc', it.id);
  await L.submitModal(page);
  L.ok(await bal('Itaú') === 550 && await bal('Nubank') === 900, 'fatura do cartão Nubank paga com o Itaú: Itaú 550');
  L.ok(/paga com Itaú/.test(await L.text(page, '#cardList')), 'fatura mostra “paga com Itaú”');
  L.ok(/conta Itaú/.test(await L.lastToast(page)), 'toast cita a conta');
  await L.tab(page, 'dashboard');
  const tiles2 = await L.text(page, '#statTiles');
  const exp2 = L.moneyOf(tiles2.match(/Gastos do mês\s*(R\$\s?[\d.,]+)/)[1]);
  L.ok(exp2 === expensesMonth || exp2 === expensesMonth + 250, 'pagar a fatura não cria gasto novo');
  await L.tab(page, 'cartoes');
  await page.click('[data-inv-paid="' + card.id + '"]'); await L.sleep(250);
  L.ok(await bal('Itaú') === 800, 'desmarcar a fatura devolve o saldo');
  await page.click('[data-inv-paid="' + card.id + '"]'); await L.sleep(150);
  await L.setVal(page, '#ipAcc', '');
  await L.submitModal(page);
  L.ok(await bal('Itaú') === 800 && await bal('Nubank') === 900, '“Não descontar de nenhuma conta” marca paga sem mexer em saldo');

  L.section('Editar conta: nome e ajuste de saldo');
  await page.click('[data-acc-edit="' + nu.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('#eaBalance', el => el.value) === '900', 'popup traz o saldo atual');
  await page.$eval('#eaName', el => { el.value = ''; });
  await page.type('#eaName', 'Nubank PF');
  await page.$eval('#eaBalance', el => { el.value = ''; });
  await page.type('#eaBalance', '2000');
  await L.submitModal(page);
  L.ok(await bal('Nubank PF') === 2000, 'saldo ajustado para 2000 e nome trocado');
  await L.addTx(page, {amount: 50, desc: 'Padaria'});
  await L.tab(page, 'cartoes');
  L.ok(await bal('Nubank PF') === 1950, 'gasto pelo popup (1ª conta por padrão) desconta depois do ajuste');

  L.section('Editar o lançamento muda o saldo das contas');
  d = await L.db(page);
  const padaria = d.transactions.find(t => t.description === 'Padaria');
  await L.tab(page, 'lancamentos');
  await page.click('#txList [data-edit-tx="' + padaria.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('#mPay', el => el.value) === 'acc:' + nu.id, 'edição traz a conta do gasto');
  await L.setVal(page, '#mPay', 'acc:' + it.id);
  await L.submitModal(page);
  await L.tab(page, 'cartoes');
  L.ok(await bal('Nubank PF') === 2000 && await bal('Itaú') === 750, 'gasto passou do Nubank para o Itaú');

  L.section('Recebimentos e pagamentos escolhem a conta');
  await L.tab(page, 'lancamentos');
  await L.openForecasts(page);
  await page.type('#fcDesc', 'Salário'); await page.type('#fcAmount', '3000');
  await page.click('#forecastForm button[type=submit]'); await L.sleep(200);
  await page.click('[data-fc-receive]'); await L.sleep(150);
  L.ok(await page.$('#askAcc') !== null, '“Recebi” pergunta em qual conta entrou');
  await L.setVal(page, '#askAcc', nu.id);
  await L.submitModal(page);
  await L.tab(page, 'dividas');
  await page.type('#debtName', 'Empréstimo'); await page.type('#debtTotal', '1000');
  await page.click('#debtForm button[type=submit]'); await L.sleep(200);
  await page.click('[data-debt-pay]'); await L.sleep(150);
  await page.$eval('#askAmount', el => { el.value = ''; });
  await page.type('#askAmount', '100');
  await L.setVal(page, '#askAcc', it.id);
  await L.submitModal(page);
  await L.tab(page, 'receber');
  await page.type('#recvPerson', 'Bia'); await page.type('#recvTotal', '80');
  await page.click('#recvForm button[type=submit]'); await L.sleep(200);
  await page.click('[data-recv-get]'); await L.sleep(150);
  await L.setVal(page, '#askAcc', it.id);
  await L.submitModal(page);
  await L.tab(page, 'cartoes');
  L.ok(await bal('Nubank PF') === 5000, 'salário de 3000 entrou no Nubank (5000)');
  L.ok(await bal('Itaú') === 730, 'Itaú: −100 da dívida +80 da Bia (730)');

  L.section('Excluir conta');
  await page.click('[data-acc-del="' + it.id + '"]'); await L.sleep(150);
  await L.submitModal(page);
  d = await L.db(page);
  L.ok(d.accounts.length === 1 && d.transactions.some(t => t.accountId === it.id), 'conta excluída, lançamentos continuam');
  L.ok(await page.$('#transferBtn[hidden]') !== null, 'transferir some com uma conta só');
  await L.tab(page, 'lancamentos');
  L.ok(!(await page.$$eval('#txPayment option', (os, id) => os.some(o => o.value === 'acc:' + id), it.id)), 'conta excluída sai da forma de pagamento');

  L.section('Backup com contas e transferências');
  const backup = {app: 'grana-leve', version: 1, exportedAt: new Date().toISOString(), data: {
    accounts: [{id: 'a1', name: 'Caixa', initialBalance: 100, baseDate: yesterday, baseAt: 0, createdAt: 0}, {id: 'a2', name: 'Inter', initialBalance: 0, baseDate: yesterday, baseAt: 0, createdAt: 0}],
    transfers: [{id: 'x1', fromId: 'a1', toId: 'a2', amount: 30, date: L.dayOffset(0), description: '', createdAt: Date.now()}],
    transactions: [{id: 't1', type: 'income', amount: 50, category: 'salario', date: L.dayOffset(0), description: 'Pix', accountId: 'a2', paymentMethod: null, createdAt: Date.now()}]}};
  const file = join(tmpdir(), 'grana-backup-contas.json');
  writeFileSync(file, JSON.stringify(backup));
  await page.click('[data-info="backup"]'); await L.sleep(150);
  L.ok(/1 contas?/.test(await L.text(page, '#modalRoot')), 'resumo do backup conta as contas');
  await (await page.$('#backupFile')).uploadFile(file); await L.sleep(400);
  await L.submitModal(page); await L.sleep(300);
  await L.tab(page, 'cartoes');
  L.ok(await bal('Caixa') === 70 && await bal('Inter') === 80, 'backup restaurado com saldos certos (70 e 80)');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'cartoes');
  L.ok(await L.noHorizontalScroll(page), 'Contas e cartões cabe na tela');
  await page.click('#transferBtn'); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'popup de transferência cabe na tela');
  await L.closeModal(page);
});
