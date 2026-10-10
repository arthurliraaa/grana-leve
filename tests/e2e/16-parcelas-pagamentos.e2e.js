// Compra parcelada em andamento (7 de 18), valor por parcela, edição da compra inteira,
// pagamento de várias parcelas de dívida e histórico com "Desfazer".
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '2000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 5000, 5, 12);
  await L.addCard(page, 'C6', 3000, 10, 17);
  let d = await L.db(page);
  const [inter, c6] = d.cards, acc = d.accounts[0];
  const groupTx = () => L.db(page).then(x => x.transactions.filter(t => t.installment).sort((a, b) => a.installment.n - b.installment.n));

  L.section('Compra que já estava em andamento (7 de 18)');
  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txIxExtras', el => el.hidden), 'opções extras escondidas à vista');
  await page.type('#txAmount', '50');
  await L.setVal(page, '#txPayment', 'card:' + inter.id);
  await L.setVal(page, '#txInstall', '18');
  L.ok(!(await page.$eval('#txIxExtras', el => el.hidden)), 'com parcelas aparecem “valor é…” e “parcela atual”');
  await page.click('input[name=txIxMode][value=parcela]');
  await L.setVal(page, '#txIxStart', '7');
  L.ok(/18x de R\$\s?50,00 · total R\$\s?900,00 · começa na 7ª: faltam 12 \(R\$\s?600,00\)/.test(await L.text(page, '#txInstallHint')), 'resumo: 18x de 50, começa na 7ª, faltam 12');
  await L.setVal(page, '#txIxStart', '30');
  L.ok(await page.$eval('#txIxStart', el => el.value) === '18', 'parcela atual não passa do total');
  await L.setVal(page, '#txIxStart', '7');
  await page.type('#txDesc', 'Notebook');
  await page.click('#txForm button[type=submit]'); await L.sleep(400);
  let g = await groupTx();
  L.ok(g.length === 12 && g[0].installment.n === 7 && g[0].date === L.dayOffset(0) && g.every(t => t.amount === 50), 'cria da 7ª à 18ª, de 50 cada, a 7ª hoje');
  L.ok(g[0].installment.totalAmount === 900 && g[0].description === 'Notebook (7/18)', 'guarda o total de 900 e o número certo');
  L.ok(await page.$eval('#txIxStart', el => el.value) === '1' && await page.$eval('input[name=txIxMode][value=total]', el => el.checked), 'formulário volta ao padrão');
  await L.tab(page, 'cartoes');
  const card = await L.text(page, '#cardList');
  L.ok(/Parcela 7 de 18/.test(card) && /6 paga\(s\) antes do cadastro/.test(card), 'cartão mostra “parcela 7 de 18” e 6 pagas antes');
  L.ok(!/adiantada/.test(card), 'não chama as anteriores de adiantadas');

  L.section('Mudar o valor de uma parcela');
  await L.tab(page, 'lancamentos');
  await page.click('#txList [data-edit-tx="' + g[0].id + '"]'); await L.sleep(200);
  L.ok(await page.$eval('#mAmount', el => !el.disabled), 'valor da parcela pode ser editado');
  await L.setVal(page, '#mAmount', '55');
  await L.submitModal(page); await L.sleep(300);
  g = await groupTx();
  L.ok(g[0].amount === 55 && g.slice(1).every(t => t.amount === 50), 'só essa parcela muda (juros)');
  L.ok(g.every(t => t.installment.totalAmount === 905), 'total da compra acompanha (905)');

  L.section('Editar a compra inteira e redefinir os valores');
  await page.click('#txList [data-edit-tx="' + g[0].id + '"]'); await L.sleep(200);
  await page.click('#modalRoot [data-m-group]'); await L.sleep(250);
  L.ok(await L.modalTitle(page) === 'Editar compra parcelada', 'abre a edição da compra inteira');
  L.ok(/valores diferentes/.test(await L.text(page, '#modalRoot')), 'avisa que as parcelas estão com valores diferentes');
  L.ok(await page.$eval('#gInstall', el => el.value) === '18' && await page.$eval('#gIxStart', el => el.value) === '7', 'vem com 18 parcelas e a parcela atual 7');
  await page.$eval('#gAmount', el => { el.value = ''; }); await page.type('#gAmount', '40');
  await page.click('input[name=gIxMode][value=parcela]');
  await L.setVal(page, '#gInstall', '10');
  await L.setVal(page, '#gCard', c6.id);
  L.ok(/10x de R\$\s?40,00 · total R\$\s?400,00 · começa na 7ª: faltam 4/.test(await L.text(page, '#gHint')), 'resumo recalcula');
  await L.submitModal(page); await L.sleep(400);
  g = await groupTx();
  L.ok(g.length === 4 && g.every(t => t.amount === 40 && t.cardId === c6.id && t.installment.total === 10) && g[0].installment.n === 7, 'refaz: 4 parcelas (7 a 10) de 40 no C6');
  L.ok(new Set(g.map(t => t.installment.group)).size === 1 && g[0].description === 'Notebook (7/10)', 'mesma compra, descrição mantida');

  L.section('Popup do + também tem as opções');
  await page.click('#fabAdd'); await L.sleep(150);
  await L.setVal(page, '#mAmount', '30');
  await L.setVal(page, '#mPay', 'card:' + inter.id);
  await L.setVal(page, '#mInstall', '6');
  await page.click('input[name=mIxMode][value=parcela]');
  await L.setVal(page, '#mIxStart', '5');
  L.ok(/6x de R\$\s?30,00 · total R\$\s?180,00 · começa na 5ª: faltam 2/.test(await L.text(page, '#mInstallHint')), 'resumo no popup');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => t.installment && t.installment.total === 6).map(t => t.installment.n).join() === '5,6', 'popup cria só a 5ª e a 6ª');

  L.section('Pagar várias parcelas de uma dívida');
  await L.tab(page, 'dividas');
  await page.type('#debtName', 'Empréstimo'); await page.type('#debtTotal', '1000');
  await page.type('#debtInstallment', '100');
  await page.click('#debtForm button[type=submit]'); await L.sleep(250);
  await page.click('[data-debt-pay]'); await L.sleep(150);
  await L.setVal(page, '#dpN', '3');
  L.ok(await page.$eval('#dpAmount', el => el.value) === '300', '3 parcelas = 300');
  await L.setVal(page, '#dpAcc', acc.id);
  await page.click('#modalRoot input[name=expense]');
  L.ok(/R\$\s?300,00 abate da dívida \(3 parcelas\); sai do saldo de Nubank; não conta como gasto/.test(await L.text(page, '#dpEffect')), 'explica o efeito');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const pay = d.transactions.find(t => t.debtId);
  L.ok(d.debts[0].paidAmount === 300 && pay.amount === 300 && pay.outsideTotals === true && pay.accountId === acc.id, 'abate 300, sai da conta e não conta como gasto');
  L.ok(d.debts[0].payments.length === 1 && d.debts[0].payments[0].n === 3, 'pagamento entra no histórico');
  await L.tab(page, 'cartoes');
  L.ok(L.moneyOf(await L.text(page, '#accountList .account-balance')) === 1700, 'saldo 2000 → 1700');

  L.section('Desfazer um pagamento');
  await L.tab(page, 'dividas');
  await page.click('#debtGrid .pay-log summary');
  L.ok(/R\$\s?300,00 · 3 parcelas/.test(await L.text(page, '#debtGrid .pay-log')), 'histórico mostra valor e parcelas');
  await page.click('[data-pay-undo]'); await L.sleep(150);
  L.ok(/volta a faltar/.test(await L.text(page, '#modalRoot')), 'explica o que desfazer faz');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.debts[0].paidAmount === 0 && !d.transactions.some(t => t.debtId) && d.debts[0].payments[0].undone, 'volta a faltar 1000, lançamento sai e o registro fica como desfeito');
  L.ok(await page.$('#debtGrid .pay-log .list-row.undone') !== null && await page.$('[data-pay-undo]') === null, 'linha riscada, sem novo “Desfazer”');
  await L.tab(page, 'cartoes');
  L.ok(L.moneyOf(await L.text(page, '#accountList .account-balance')) === 2000, 'saldo volta a 2000');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'lancamentos');
  await L.setVal(page, '#txPayment', 'card:' + inter.id);
  await L.setVal(page, '#txInstall', '3');
  L.ok(await L.noHorizontalScroll(page), 'opções de parcela cabem no celular');
});
