// Início: crédito × débito por banco no mês (conta e cartão do mesmo banco juntos), recolhido por padrão.
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
  L.ok(!(await page.$eval('#creditDebitCard', el => el.hidden)) && await page.$eval('#creditDebitBody', el => el.hidden), 'quadro aparece recolhido');
  L.ok(await page.$eval('[data-view-toggle="creditdebit"]', el => el.hidden), '“Ver como tabela” só aparece expandido');
  L.ok(/Neste mês: R\$\s?450,00.*crédito R\$\s?300,00 \(67%\).*débito\/Pix R\$\s?150,00 \(33%\)/.test(await L.text(page, '#creditDebitSummary')), 'resumo: 450 no mês, 300 crédito, 150 débito (compra futura e dinheiro fora)');
  await page.click('[data-collapse="creditdebit"]'); await L.sleep(150);
  const txt = await L.text(page, '#creditDebitWrap');
  L.ok(/Nubank\s*R\$\s?400,00\s*Crédito R\$\s?300,00\s*Débito\/Pix R\$\s?100,00/.test(txt), 'Nubank: conta e cartão juntos (300 crédito + 100 Pix)');
  L.ok(/Itaú\s*R\$\s?50,00\s*Crédito R\$\s?0,00\s*Débito\/Pix R\$\s?50,00/.test(txt), 'Itaú: só débito');
  L.ok(/Fora dos bancos: dinheiro R\$\s?20,00/.test(txt), 'dinheiro fora das contas aparece à parte');
  L.ok(await page.$$eval('#creditDebitWrap .inv-seg', s => s.length === 3 && s.every(x => x.tabIndex === 0)), 'barras com dica por teclado');
  await page.click('[data-view-toggle="creditdebit"]'); await L.sleep(100);
  L.ok(/Total\s*R\$\s?300,00\s*R\$\s?150,00\s*R\$\s?450,00/.test(await L.text(page, '#creditDebitWrap table')), 'tabela com o total');
  await page.click('[data-collapse="creditdebit"]'); await L.sleep(100);
  L.ok(await page.$eval('#creditDebitBody', el => el.hidden), 'recolhe de novo');
  await page.setViewport({width: 375, height: 800});
  await page.click('[data-collapse="creditdebit"]'); await L.sleep(100);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
