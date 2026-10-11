// Compra parcelada feita no passado (parcelas vencidas contam como pagas), valor por parcela, edição da compra inteira,
// pagamento de várias parcelas de dívida e histórico com "Desfazer".
import * as L from './lib.js';
import {firstDueInstallment, invoiceFor} from '../../js/domain/cards.js';
import {addMonthsIso} from '../../js/domain/dates.js';

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
  // Parcelas ainda a pagar (as vencidas antes do cadastro ficam marcadas como acertadas).
  const pending = list => list.filter(t => !t.installment.settled);

  // Valor esperado pela própria regra (não depende do dia em que o teste roda).
  const today = L.dayOffset(0), old = L.dayOffset(-185);
  const startOld18 = firstDueInstallment(old, 18, inter, today);
  const invNow = invoiceFor(today, inter);

  L.section('Fatura da compra no formulário');
  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txIxExtras', el => el.hidden), 'opção do valor escondida à vista');
  await page.type('#txAmount', '50');
  await L.setVal(page, '#txPayment', 'card:' + inter.id);
  L.ok(new RegExp('À vista · entra na fatura de ' + invNow.label + ' \\(fecha ' + L.br(invNow.closing).slice(0, 5) + ', vence ' + L.br(invNow.due).slice(0, 5) + '\\)').test(await L.text(page, '#txInstallHint')),
    'à vista no cartão: mostra a fatura, com fechamento e vencimento');
  L.ok(await page.$('#txIxStart') === null, 'não pergunta mais a “parcela atual”');

  L.section('Compra antiga: parcelas vencidas contam como pagas sozinhas');
  await L.setVal(page, '#txInstall', '18');
  await page.click('input[name=txIxMode][value=parcela]');
  await L.setVal(page, '#txDate', old);
  const hint = await L.text(page, '#txInstallHint');
  L.ok(startOld18 > 2 && new RegExp('as parcelas 1 a ' + (startOld18 - 1) + ' já venceram \\(contam como pagas\\) · faltam ' + (19 - startOld18)).test(hint), 'resumo calcula pela data da compra: ' + hint.slice(0, 120));
  L.ok(new RegExp('a ' + startOld18 + 'ª parcela entra na fatura de ' + invoiceFor(addMonthsIso(old, startOld18 - 1), inter).label).test(hint), 'diz em qual fatura entra a próxima parcela');
  await page.type('#txDesc', 'Notebook');
  await page.click('#txForm button[type=submit]'); await L.sleep(400);
  const all = await groupTx();
  let g = pending(all);
  L.ok(all.length === 18 && all[0].date === old && all.filter(t => t.installment.settled).length === startOld18 - 1, 'cria as 18 parcelas (a 1ª na data da compra, no histórico); as vencidas ficam como pagas antes do cadastro');
  L.ok(g.length === 19 - startOld18 && g[0].installment.n === startOld18 && g.every(t => t.amount === 50), 'a pagar: da 1ª ainda não vencida em diante, de 50 cada');
  L.ok(g[0].installment.totalAmount === 900 && g[0].purchaseDate === old && g[0].date === addMonthsIso(old, startOld18 - 1), 'guarda o total, a data da compra e a data de cada parcela');
  L.ok(await page.$eval('input[name=txIxMode][value=total]', el => el.checked), 'formulário volta ao padrão');
  await L.tab(page, 'cartoes');
  const card = await L.text(page, '#bankList');
  // "Parcela X de 18" conta as vencidas antes do cadastro e as que já entraram na fatura aberta.
  const shown = (startOld18 - 1) + g.filter(t => t.date <= today).length;
  L.ok(new RegExp('Parcela ' + shown + ' de 18').test(card) && new RegExp((startOld18 - 1) + ' paga\\(s\\) antes do cadastro').test(card), 'cartão mostra a parcela certa e as pagas antes');
  L.ok(!/adiantada/.test(card), 'não chama as anteriores de adiantadas');
  await L.tab(page, 'lancamentos');
  await L.setVal(page, '#txAmount', '10'); await L.setVal(page, '#txInstall', '3'); await L.setVal(page, '#txDate', L.dayOffset(-800));
  L.ok(/Todas as 3 parcelas dessa compra já venceram/.test(await L.text(page, '#txInstallHint')), 'compra muito antiga: avisa que não há nada a lançar');
  await L.setVal(page, '#txDate', today); await L.setVal(page, '#txAmount', ''); await L.setVal(page, '#txInstall', '1');

  L.section('Mudar o valor de uma parcela');
  const goTo = async id => {
    await L.tab(page, 'lancamentos');
    const sel = '#txList [data-edit-tx="' + id + '"]';
    while (!(await page.$(sel)) && await page.$eval('#nextMonth', el => !el.disabled)){ await page.click('#nextMonth'); await L.sleep(60); }
    for (let i = 0; i < 24 && !(await page.$(sel)); i++){ await page.click('#prevMonth'); await L.sleep(60); }
    await page.click(sel); await L.sleep(200);
  };
  await goTo(g[0].id);
  L.ok(await page.$eval('#mAmount', el => !el.disabled), 'valor da parcela pode ser editado');
  await L.setVal(page, '#mAmount', '55');
  await L.submitModal(page); await L.sleep(300);
  g = pending(await groupTx());
  L.ok(g[0].amount === 55 && g.slice(1).every(t => t.amount === 50), 'só essa parcela muda (juros)');
  L.ok(g.every(t => t.installment.totalAmount === 905), 'total da compra acompanha (905)');

  L.section('Editar a compra inteira e redefinir os valores');
  await goTo(g[0].id);
  await page.click('#modalRoot [data-m-group]'); await L.sleep(250);
  L.ok(await L.modalTitle(page) === 'Editar compra parcelada', 'abre a edição da compra inteira');
  L.ok(/valores diferentes/.test(await L.text(page, '#modalRoot')), 'avisa que as parcelas estão com valores diferentes');
  L.ok(await page.$eval('#gInstall', el => el.value) === '18' && await page.$eval('#gDate', el => el.value) === old, 'vem com 18 parcelas e a data da compra');
  await page.$eval('#gAmount', el => { el.value = ''; }); await page.type('#gAmount', '40');
  await page.click('input[name=gIxMode][value=parcela]');
  await L.setVal(page, '#gInstall', '24');
  await L.setVal(page, '#gCard', c6.id);
  const startC6 = firstDueInstallment(old, 24, c6, today);
  L.ok(new RegExp('24x de R\\$\\s?40,00 · total R\\$\\s?960,00 · as parcelas 1 a ' + (startC6 - 1) + ' já venceram').test(await L.text(page, '#gHint')), 'resumo recalcula com o outro cartão');
  await L.submitModal(page); await L.sleep(400);
  g = pending(await groupTx());
  L.ok(g.length === 25 - startC6 && g.every(t => t.amount === 40 && t.cardId === c6.id && t.installment.total === 24) && g[0].installment.n === startC6, 'refaz as parcelas que faltam, de 40, no C6');
  L.ok(new Set(g.map(t => t.installment.group)).size === 1 && g[0].description === 'Notebook (' + startC6 + '/24)', 'mesma compra, descrição mantida');

  L.section('Popup do + também calcula pela data');
  await page.click('#fabAdd'); await L.sleep(150);
  await L.setVal(page, '#mAmount', '30');
  await L.setVal(page, '#mPay', 'card:' + inter.id);
  await L.setVal(page, '#mInstall', '6');
  await page.click('input[name=mIxMode][value=parcela]');
  const old6 = L.dayOffset(-100), start6 = firstDueInstallment(old6, 6, inter, today);
  await L.setVal(page, '#mDate', old6);
  L.ok(new RegExp('6x de R\\$\\s?30,00 · total R\\$\\s?180,00' + (start6 > 1 ? ' · a' : '')).test(await L.text(page, '#mInstallHint')), 'resumo no popup');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const six = d.transactions.filter(t => t.installment && t.installment.total === 6);
  L.ok(six.length === 6 && pending(six).map(t => t.installment.n).sort((a, b) => a - b).join() === Array.from({length: 7 - start6}, (_, i) => start6 + i).join(), 'popup cria as 6 parcelas; a pagar só as ainda não vencidas');

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
  L.ok(L.moneyOf(await L.text(page, '#bankList .account-balance')) === 1700, 'saldo 2000 → 1700');

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
  L.ok(L.moneyOf(await L.text(page, '#bankList .account-balance')) === 2000, 'saldo volta a 2000');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'lancamentos');
  await L.setVal(page, '#txPayment', 'card:' + inter.id);
  await L.setVal(page, '#txInstall', '3');
  L.ok(await L.noHorizontalScroll(page), 'opções de parcela cabem no celular');
});
