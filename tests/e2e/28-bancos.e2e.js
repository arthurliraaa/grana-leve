// Bancos e cartões num cadastro só: conta e cartão do mesmo banco juntos, um bloco por banco.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  const blocks = () => page.$$eval('#bankList .bank-block', bs => bs.map(b => ({
    name: b.getAttribute('aria-label'), acc: !!b.querySelector('.account-card'), cards: b.querySelectorAll('.credit-card').length, text: b.textContent.replace(/\s+/g, ' ') })));
  const check = async (sel, on) => page.$eval(sel, (el, on) => { if (el.checked !== on) el.click(); }, on);
  L.ok(/Nenhum banco cadastrado/.test(await L.text(page, '#bankList')), 'começa sem bancos');
  L.ok(await page.$('#cardForm') === null && await page.$$eval('#tab-cartoes form', f => f.filter(x => x.id !== 'voucherForm').length) === 1, 'um formulário só para conta e cartão');

  L.section('Conta e cartão juntos');
  await page.type('#accName', 'Nubank');
  L.ok(await page.$eval('[data-bank-part="card"]', el => el.hidden), 'campos do cartão escondidos até marcar');
  await check('#bankHasCard', true);
  L.ok(!(await page.$eval('[data-bank-part="card"]', el => el.hidden)) && /no dia do fechamento já vai para a próxima/.test(await L.text(page, '#accountForm')), 'ao marcar o cartão: limite, datas e a regra da fatura');
  await page.type('#accBalance', '1000'); await page.type('#cardLimit', '3000'); await page.type('#cardClosing', '5'); await page.type('#cardDue', '12');
  await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  let d = await L.db(page);
  L.ok(d.accounts.length === 1 && d.cards.length === 1 && d.cards[0].accountId === d.accounts[0].id && d.cards[0].name === 'Nubank', 'cria a conta e o cartão, ligados');
  let b = await blocks();
  L.ok(b.length === 1 && b[0].acc && b[0].cards === 1 && /Saldo hoje\s?R\$\s?1\.000,00/.test(b[0].text) && /Limite disponível\s?R\$\s?3\.000,00/.test(b[0].text), 'um bloco: saldo da conta e limite do cartão');
  L.ok(/Paga com Nubank/.test(b[0].text), 'a fatura é paga pela conta do mesmo banco');
  L.ok(await page.$eval('#bankHasAcc', el => el.checked) && !(await page.$eval('#bankHasCard', el => el.checked)) && await page.$eval('[data-bank-part="card"]', el => el.hidden), 'formulário volta ao padrão');

  L.section('Só conta, e depois o cartão do mesmo banco');
  await page.type('#accName', 'Itaú'); await page.type('#accBalance', '200');
  await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  d = await L.db(page);
  const itau = d.accounts.find(a => a.name === 'Itaú');
  await page.click('[data-bank-addcard="' + itau.id + '"]'); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Cartão de crédito · Itaú', 'botão “Adicionar cartão de crédito deste banco”');
  await page.type('#bcLimit', '1500'); await page.type('#bcClosing', '20'); await page.type('#bcDue', '28');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const itauCard = d.cards.find(c => c.name === 'Itaú');
  L.ok(itauCard && itauCard.accountId === itau.id && itauCard.limit === 1500, 'cartão do Itaú ligado à conta');
  b = await blocks();
  L.ok(b.find(x => x.name === 'Itaú').cards === 1 && b.length === 2, 'continua um bloco por banco');

  L.section('Só cartão (loja), e depois a conta');
  await page.type('#accName', 'Renner'); await check('#bankHasAcc', false); await check('#bankHasCard', true);
  await page.type('#cardLimit', '400'); await page.type('#cardClosing', '1'); await page.type('#cardDue', '10');
  await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  d = await L.db(page);
  const renner = d.cards.find(c => c.name === 'Renner');
  L.ok(renner && !renner.accountId && d.accounts.length === 2, 'só o cartão, sem conta');
  L.ok(/Só cartão, sem conta neste banco/.test((await blocks()).find(x => x.name === 'Renner').text), 'bloco avisa que é só cartão');
  await page.click('[data-bank-addacc="' + renner.id + '"]'); await L.sleep(200);
  await page.type('#baBalance', '50');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.accounts.some(a => a.name === 'Renner') && d.cards.find(c => c.id === renner.id).accountId === d.accounts.find(a => a.name === 'Renner').id, '“Adicionar a conta” cria a conta e liga ao cartão');

  L.section('Nada marcado');
  await page.type('#accName', 'Caixa'); await check('#bankHasAcc', false); await check('#bankHasCard', false);
  await page.click('#accountForm button[type=submit]'); await L.sleep(200);
  L.ok(/Marque o que você tem nesse banco/.test(await L.allToasts(page)), 'pede para marcar conta, cartão ou os dois');
  await page.$eval('#accName', el => { el.value = ''; }); await check('#bankHasAcc', true);

  L.section('Dados antigos (conta e cartão cadastrados separados)');
  await L.patchDb(page, "u.accounts.push({id: 'acx', name: 'Caixa', initialBalance: 10, baseDate: '2026-01-01', baseAt: 1}); u.cards.push({id: 'ccx', name: 'Caixa', limit: 900, closingDay: 2, dueDay: 9, paidInvoices: []});");
  await L.tab(page, 'cartoes');
  b = await blocks();
  L.ok(b.find(x => x.name === 'Caixa').acc && b.find(x => x.name === 'Caixa').cards === 1, 'conta e cartão antigos do mesmo banco aparecem juntos');

  L.section('Excluir a conta mantém o cartão');
  await page.click('[data-acc-del="' + itau.id + '"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(300);
  b = await blocks();
  L.ok(b.find(x => x.name === 'Itaú') && !b.find(x => x.name === 'Itaú').acc && b.find(x => x.name === 'Itaú').cards === 1, 'cartão do Itaú continua, agora como “só cartão”');

  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
