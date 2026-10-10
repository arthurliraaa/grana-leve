// Cor e ícone de cartões e contas: banco reconhecido pelo nome, escolhido na lista e personalizado.
import * as L from './lib.js';

const rgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';

L.run(async ({page}) => {
  await L.signup(page);
  const top = i => '#cardList .credit-card:nth-child(' + i + ') .credit-card-top';
  const st = sel => page.$eval(sel, el => ({bg: el.style.background, color: el.style.color, attr: el.getAttribute('style'), text: el.textContent}));

  L.section('Cartão: reconhece o banco pelo nome');
  await L.tab(page, 'cartoes');
  L.ok(await page.$eval('#cardForm .brand-details', el => !el.open), '“Cor e ícone” fica recolhido (é opcional)');
  await page.type('#cardName', 'Nubank');
  L.ok(await L.text(page, '#cardNewPreview') === 'Nu' && (await st('#cardNewPreview .bank-badge')).bg === rgb('#820ad1'), 'prévia mostra “Nu” no roxo enquanto digita');
  await page.click('#cardForm .brand-details summary');
  L.ok(/Reconhecemos: Nubank/.test(await L.text(page, '#ncPHint')), 'avisa que reconheceu o Nubank');
  await page.type('#cardLimit', '2000'); await page.type('#cardClosing', '3'); await page.type('#cardDue', '10');
  await page.click('#cardForm button[type=submit]'); await L.sleep(300);
  let d = await L.db(page);
  L.ok(d.cards[0].bank === null && d.cards[0].color === null && d.cards[0].mark === null, 'salva “automático” (segue o nome se ele mudar)');
  L.ok((await st(top(1))).bg.includes(rgb('#820ad1')) && (await st(top(1))).color === rgb('#ffffff'), 'cartão fica roxo com texto branco');
  L.ok(await L.text(page, top(1) + ' .bank-badge') === 'Nu', 'selo “Nu” no cartão');
  L.ok(await L.text(page, '#cardNewPreview') === 'Cd' || await page.$eval('#cardName', el => el.value) === '', 'formulário volta ao começo depois de salvar');
  L.ok(await page.$eval('#ncPBank', el => el.value) === '' && await page.$eval('#ncPColor', el => !el.dataset.custom), 'seletor volta ao automático');

  L.section('Cartão: cor clara usa texto escuro');
  await page.type('#cardName', 'Ourocard'); await page.type('#cardLimit', '1000'); await page.type('#cardClosing', '5'); await page.type('#cardDue', '12');
  await page.click('#cardForm button[type=submit]'); await L.sleep(300);
  L.ok((await st(top(2))).color === rgb('#1a1a1a') && await L.text(page, top(2) + ' .bank-badge') === 'BB', 'Banco do Brasil (amarelo) com texto escuro e selo “BB”');

  L.section('Cartão: sem banco usa a cor do app e as iniciais');
  await page.type('#cardName', 'Cartão Renner'); await page.type('#cardLimit', '500'); await page.type('#cardClosing', '1'); await page.type('#cardDue', '8');
  await page.click('#cardForm button[type=submit]'); await L.sleep(300);
  L.ok((await st(top(3))).attr === null && await L.text(page, top(3) + ' .bank-badge') === 'CR', 'sem banco: visual padrão e iniciais “CR”');

  L.section('Personalizar no Editar');
  d = await L.db(page);
  const renner = d.cards.find(c => c.name === 'Cartão Renner');
  await page.click('[data-card-edit="' + renner.id + '"]'); await L.sleep(200);
  L.ok(/Sem banco/.test(await L.text(page, '#ecPHint')), 'editar mostra que está sem banco');
  await page.$eval('#ecPColor', el => { el.value = '#d1006f'; el.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.type('#ecPMark', '🛍️ABCD');
  L.ok(await L.text(page, '#ecPreview') === '🛍️AB', 'ícone aceita emoji e corta em 3');
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  const r2 = d.cards.find(c => c.id === renner.id);
  L.ok(r2.color === '#d1006f' && r2.mark === '🛍️AB', 'salva cor e ícone personalizados');
  L.ok((await st(top(3))).bg.includes(rgb('#d1006f')) && await L.text(page, top(3) + ' .bank-badge') === '🛍️AB', 'cartão mostra a cor e o ícone escolhidos');
  const nu = d.cards.find(c => c.name === 'Nubank');
  await page.click('[data-card-edit="' + nu.id + '"]'); await L.sleep(200);
  await L.setVal(page, '#ecPBank', 'inter');
  L.ok(await L.text(page, '#ecPreview') === 'In', 'escolher o banco na lista troca a prévia');
  await L.submitModal(page); await L.sleep(250);
  L.ok((await st(top(1))).bg.includes(rgb('#ff7a00')), 'cartão passa a ter a cor do Inter');
  await page.click('[data-card-edit="' + renner.id + '"]'); await L.sleep(200);
  await page.click('#modalRoot [data-picker-reset]'); await L.sleep(80);
  await L.submitModal(page); await L.sleep(250);
  d = await L.db(page);
  L.ok(d.cards.find(c => c.id === renner.id).color === null && await L.text(page, top(3) + ' .bank-badge') === 'CR', '“Usar o padrão” volta ao visual automático');

  L.section('Contas bancárias');
  await page.click('#accountForm .brand-details summary');
  await page.type('#accName', 'Itaú');
  L.ok(await L.text(page, '#accNewPreview') === 'It', 'prévia da conta reconhece o Itaú');
  await page.type('#accBalance', '100');
  await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  L.ok((await st('#accountList .account-card .bank-badge')).text === 'It' && (await st('#accountList .account-card .bank-badge')).bg === rgb('#ec7000'), 'conta mostra o selo do Itaú');
  d = await L.db(page);
  await page.click('[data-acc-edit="' + d.accounts[0].id + '"]'); await L.sleep(200);
  await L.setVal(page, '#eaPBank', 'none');
  await L.submitModal(page); await L.sleep(250);
  L.ok((await st('#accountList .account-card .bank-badge')).attr === null && (await st('#accountList .account-card .bank-badge')).text === 'It', '“Outro / sem banco” tira a cor do banco');

  L.section('Dados antigos, tema escuro e celular');
  await L.patchDb(page, "u.cards.push({id: 'velho', name: 'Santander', limit: 100, closingDay: 1, dueDay: 5, paidInvoices: []});");
  await L.tab(page, 'cartoes');
  L.ok((await st(top(4))).bg.includes(rgb('#ec0000')), 'cartão salvo antes da mudança ganha a cor pelo nome');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await L.sleep(100);
  L.ok((await st(top(4))).color === rgb('#ffffff'), 'no tema escuro a cor do banco continua');
  await page.setViewport({width: 375, height: 800});
  await page.click('[data-card-edit="velho"]'); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'editar cartão com cor e ícone cabe no celular');
  await L.closeModal(page);
  L.ok(await L.noHorizontalScroll(page), 'Contas e cartões cabe no celular');
});
