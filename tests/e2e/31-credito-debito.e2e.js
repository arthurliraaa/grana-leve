// Início: crédito × débito por banco no mês escolhido (conta e cartão do mesmo banco juntos).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  const bank = async (name, bal, card) => {
    await page.type('#accName', name); await page.type('#accBalance', String(bal));
    if (card){ await page.$eval('#bankHasCard', el => el.click()); await page.type('#cardLimit', '3000'); await page.type('#cardClosing', '5'); await page.type('#cardDue', '12'); }
    await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  };
  await bank('Nubank', 1000, true);
  await bank('Itaú', 500, false);
  const d = await L.db(page);
  const nuAcc = d.accounts.find(a => a.name === 'Nubank'), itau = d.accounts.find(a => a.name === 'Itaú'), nuCard = d.cards[0];
  await L.addTx(page, {amount: 300, pay: 'card:' + nuCard.id, desc: 'Roupa', category: 'compras'});
  await L.addTx(page, {amount: 100, pay: 'acc:' + nuAcc.id, desc: 'Pix mercado', category: 'alimentacao'});
  await L.addTx(page, {amount: 50, pay: 'acc:' + itau.id, desc: 'Débito farmácia', category: 'saude'});
  await L.addTx(page, {amount: 20, pay: 'conta', desc: 'Dinheiro', category: 'outros'});
  await L.addTx(page, {amount: 999, pay: 'card:' + nuCard.id, desc: 'Futuro', category: 'compras', date: L.dayOffset(40)});

  await L.tab(page, 'dashboard');
  await page.click('#dashDetailsBtn'); await L.sleep(200);
  L.ok(!(await page.$eval('#creditDebitCard', el => el.hidden)), 'o quadro aparece já aberto');
  L.ok(/Crédito × débito · /.test(await L.text(page, '#creditDebitTitle')), 'o título diz o mês');
  let txt = await L.text(page, '#creditDebitWrap');
  L.ok(/Total nos bancos\s*R\$\s?450,00/.test(txt) && /Crédito\s*R\$\s?300,00\s*67%/.test(txt) && /Débito\/Pix\s*R\$\s?150,00\s*33%/.test(txt), 'resumo: 450 no mês, 300 crédito, 150 débito (compra futura e dinheiro fora)');
  L.ok(/Nubank\s*R\$\s?400,00/.test(txt), 'Nubank: conta e cartão juntos (300 crédito + 100 Pix)');
  L.ok(/Itaú\s*R\$\s?50,00/.test(txt), 'Itaú: só débito');
  L.ok(/Fora dos bancos: dinheiro R\$\s?20,00/.test(txt), 'dinheiro fora das contas aparece à parte');
  L.ok(await page.$$eval('#creditDebitWrap .inv-seg', s => s.length >= 3 && s.every(x => x.tabIndex === 0)), 'barras com dica por teclado');
  await page.click('[data-view-toggle="creditdebit"]'); await L.sleep(100);
  L.ok(/Total\s*R\$\s?300,00\s*R\$\s?150,00\s*R\$\s?450,00/.test(await L.text(page, '#creditDebitWrap table')), 'tabela com o total');
  await page.click('[data-view-toggle="creditdebit"]'); await L.sleep(100);

  // Acompanha o mês escolhido: a compra de daqui a 40 dias aparece no mês dela.
  let future = '';
  for (let i = 0; i < 2; i++){
    await page.$eval('#dashNext', el => el.click()); await L.sleep(150);
    future += ' ' + await L.text(page, '#creditDebitWrap');
  }
  L.ok(/R\$\s?999,00/.test(future), 'meses seguintes mostram o que já está agendado (999 no cartão)');
  await page.$eval('#dashToday', el => el.click()); await L.sleep(150);
  L.ok(/Total nos bancos\s*R\$\s?450,00/.test(await L.text(page, '#creditDebitWrap')), '“Voltar para este mês” traz os 450 de volta');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
