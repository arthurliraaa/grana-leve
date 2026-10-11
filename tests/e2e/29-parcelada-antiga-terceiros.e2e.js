// Compra antiga parcelada para outra pessoa (R$ 1.000 em 10x, há 3 meses): parcelas vencidas pelas
// regras da fatura, total original em Me devem, fatura de cada parcela e contas fixas no cartão.
import * as L from './lib.js';
import {firstDueInstallment, invoiceFor} from '../../js/domain/cards.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Inter', 5000, 10, 20);
  let d = await L.db(page);
  const card = d.cards[0], today = L.dayOffset(0), old = L.dayOffset(-92);
  const k = firstDueInstallment(old, 10, card, today) - 1;   // parcelas que já venceram
  const fillPurchase = async (person) => {
    await L.tab(page, 'lancamentos');
    await page.type('#txAmount', '1000'); await page.type('#txDesc', 'Celular');
    await L.setVal(page, '#txPayment', 'card:' + card.id); await L.setVal(page, '#txInstall', '10'); await L.setVal(page, '#txDate', old);
    await page.click('#txForOtherField summary'); await page.click('#txForOther'); await page.type('#txOtherName', person); await L.sleep(100);
  };

  L.section('Formulário avisa das parcelas que já venceram');
  await fillPurchase('Maria');
  L.ok(k >= 2, 'há parcelas vencidas (' + k + ')');
  L.ok(!(await page.$eval('#txPriorBox', el => el.hidden)) && new RegExp('As ' + k + ' primeiras parcelas já venceram antes deste cadastro \\(R\\$\\s?' + (k * 100) + ',00\\)').test(await L.text(page, '#txPriorBox')), 'avisa quantas parcelas já venceram e o valor');
  L.ok(await page.$eval('input[name=txPrior][value=paid]', el => el.checked), 'padrão: a pessoa já devolveu essas');
  await page.click('#txForm button[type=submit]'); await L.sleep(400);

  d = await L.db(page);
  const parts = d.transactions.filter(t => t.installment).sort((a, b) => a.installment.n - b.installment.n);
  const maria = d.receivables.find(r => r.person === 'Maria');
  L.ok(parts.length === 10 && parts.filter(t => t.installment.settled).length === k && parts[0].date === old, 'as 10 parcelas existem; as vencidas ficam como pagas antes do cadastro');
  L.ok(maria.totalAmount === 1000 && maria.installments === 10 && maria.installmentAmount === 100, 'Me devem: total original de 1.000 em 10x');
  L.ok(maria.receivedAmount === k * 100 && maria.priorSettled.count === k && maria.priorSettled.paid, 'parcelas vencidas já contam como devolvidas');

  L.section('Me devem mostra total, pagas e restantes');
  await L.tab(page, 'receber');
  const txt = await L.text(page, '#recvGrid');
  L.ok(new RegExp('Compra de R\\$\\s?1\\.000,00 em 10x: as ' + k + ' primeiras parcelas \\(R\\$\\s?' + (k * 100) + ',00\\) já tinham vencido antes do cadastro e já foram acertadas').test(txt), 'aviso claro de que parte já foi paga');
  L.ok(/Total: R\$\s?1\.000,00/.test(txt) && new RegExp('Falta: R\\$\\s?' + ((10 - k) * 100) + ',00').test(txt) && new RegExp('Parcela ' + (k + 1) + ' de 10').test(txt), 'total, falta e a próxima parcela');

  L.section('Ganhos e gastos: a compra fica no histórico e cada parcela diz a fatura');
  await L.tab(page, 'lancamentos');
  for (let i = 0; i < 4 && !(await page.$('#txList .tx-row [data-edit-tx="' + parts[0].id + '"]')); i++){ await page.click('#prevMonth'); await L.sleep(80); }
  const first = await page.$eval('#txList .tx-row [data-edit-tx="' + parts[0].id + '"]', el => el.closest('.tx-row').textContent);
  L.ok(/Celular \(1\/10\).*fatura \w{3}\/\d{4} · paga antes do cadastro/.test(first), 'no mês da compra: 1ª parcela, com a fatura e “paga antes do cadastro”');
  const next = parts[k];
  const nextInv = invoiceFor(next.date, card);
  while (await page.$eval('#nextMonth', el => !el.disabled) && !(await page.$('#txList .tx-row [data-edit-tx="' + next.id + '"]'))){ await page.click('#nextMonth'); await L.sleep(80); }
  L.ok(new RegExp('Celular \\(' + (k + 1) + '/10\\).*fatura ' + nextInv.label.slice(0, 3) + '/' + nextInv.label.slice(-4)).test(await page.$eval('#txList .tx-row [data-edit-tx="' + next.id + '"]', el => el.closest('.tx-row').textContent)), 'próxima parcela mostra a fatura dela');
  const lastTag = await (async () => { while (await page.$eval('#nextMonth', el => !el.disabled)){ await page.click('#nextMonth'); await L.sleep(60); }
    return page.$eval('#txList .tx-row [data-edit-tx="' + parts[9].id + '"]', el => el.closest('.tx-row').textContent); })();
  L.ok(/fatura \w{3}\/\d{4} · futura/.test(lastTag), 'última parcela: fatura futura');

  L.section('Fatura: nada antigo a pagar e aviso de que são as mesmas compras');
  await L.tab(page, 'dashboard');
  const tiles = await L.text(page, '#statTiles');
  L.ok(!/venceu/.test(tiles), 'nenhuma fatura antiga aparece vencida');
  await L.tab(page, 'cartoes');
  L.ok(/mesmas compras de “Ganhos e gastos”/.test(await page.$eval('#bankList', el => el.innerHTML)), 'dentro do cartão: são as mesmas compras, não somam de novo');

  L.section('Ainda me deve as parcelas vencidas');
  await fillPurchase('João');
  await page.click('input[name=txPrior][value=owed]');
  await page.click('#txForm button[type=submit]'); await L.sleep(400);
  d = await L.db(page);
  const joao = d.receivables.find(r => r.person === 'João');
  L.ok(joao.receivedAmount === 0 && joao.totalAmount === 1000 && joao.priorSettled.paid === false, 'falta receber o total');
  await L.tab(page, 'receber');
  L.ok(/já tinham vencido antes do cadastro e ainda estão em aberto/.test(await L.text(page, '#recvGrid')), 'avisa que essas parcelas ainda estão em aberto');

  L.section('Conta fixa no cartão');
  await page.goto(L.BASE + '#/lancamentos/contas-fixas'); await L.sleep(300);
  await L.setVal(page, '#billPay', 'card:' + card.id);
  await page.type('#billDay', '15');
  L.ok(await L.text(page, '#billDayLabel') === 'Dia da compra no cartão', 'no cartão, o campo vira “Dia da compra no cartão”');
  L.ok(/fecha dia 10 e vence dia 20.*dia 15 \(no fechamento ou depois\): entra na fatura seguinte/.test(await L.text(page, '#billDayHint')), 'explica em qual fatura a compra entra');
  await page.$eval('#billDay', el => { el.value = ''; }); await page.type('#billDay', '5');
  L.ok(/antes do fechamento\): entra na fatura que fecha no dia 10 do mesmo mês e vence dia 20 desse mês/.test(await L.text(page, '#billDayHint')), 'antes do fechamento: fatura do mesmo mês');
  await page.type('#billName', 'Streaming de música'); await page.type('#billAmount', '21.90');
  await L.setVal(page, '#billCat', 'lazer');
  await page.click('#billForm button[type=submit]'); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.bills.some(b => b.name === 'Streaming de música' && b.category === 'lazer' && b.pay === 'card:' + card.id && b.dueDay === 5), 'nome livre, categoria e cartão salvos');
  L.ok(/compra no cartão .* · fatura de /i.test(await L.text(page, '#billMonth')), 'vencimentos mostram a fatura da compra');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
