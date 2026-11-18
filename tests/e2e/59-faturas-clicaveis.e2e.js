// Início: faturas do cartão e crédito × débito clicáveis (abrem as compras) e atalho dos PDFs das faturas.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 28, 5);
  const d = await L.db(page);
  const card = d.cards[0];
  await L.addTx(page, {amount: 120, pay: 'card:' + card.id, desc: 'Mercado', category: 'alimentacao'});
  await L.addTx(page, {amount: 40, desc: 'Padaria', category: 'alimentacao'});

  L.section('Mês que vem com as contas fixas');
  const ck = L.monthKey(0);
  await L.patchDb(page, `u.bills = [{id: 'b1', name: 'Aluguel', category: 'moradia', amount: 600, every: 1, dueDay: 5, startMonth: arg.ck, pay: 'conta', amounts: [], paid: {}, createdAt: 1}];`, {ck});
  await L.tab(page, 'cartoes'); await L.sleep(200);
  const next = await L.text(page, '#walletSummary .ws-next');
  L.ok(/Contas fixas previstas:\s*R\$\s?600,00/.test(next) && /Aluguel/.test(next) && /ainda não lançadas/.test(next), 'o mês que vem lista as contas fixas previstas, como observação');
  L.ok(/Como ficaria, pagando faturas e contas fixas/.test(next), 'e diz como o mês ficaria com elas');

  L.section('Atalho dos PDFs no Início');
  await L.tab(page, 'dashboard'); await L.sleep(200);
  L.ok(!(await page.$eval('#invPdfBar', e => e.hidden)) && await page.$$eval('#invPdfBar [data-allinv-pdf]', b => b.length) === 2, 'faixa “Faturas dos cartões” com os dois botões de PDF aparece no Início');
  L.ok(await page.$eval('#invPdfBar', e => getComputedStyle(e).textAlign) === 'center', 'centralizada');

  L.section('Faturas do cartão clicáveis');
  await L.dashSection(page, 'graficos');
  for (const off of [0, 1]){
    if (off) { await page.$eval('#dashNext', e => e.click()); await L.sleep(200); }
    if (await page.$('#invSplitWrap .inv-row.clickable')) break;
  }
  const row = await page.$('#invSplitWrap .inv-row.clickable');
  L.ok(!!row, 'cada cartão é uma linha clicável');
  await page.$eval('#invSplitWrap .inv-row.clickable', e => e.click()); await L.sleep(250);
  const mt = await L.text(page, '#modalRoot');
  L.ok(/Inter/.test(await L.modalTitle(page)) && /Mercado/.test(mt) && /Seu/.test(mt) && /Minha parte/.test(mt), 'abre a fatura com as compras e de quem é cada uma');
  await L.closeModal(page);

  L.section('Crédito × débito clicável');
  await page.$eval('#dashToday', e => e.click()).catch(() => {}); await L.sleep(200);
  const bank = await page.$('#creditDebitWrap .inv-row.clickable');
  L.ok(!!bank, 'cada banco é uma linha clicável');
  const n = await page.$$eval('#creditDebitWrap .inv-row.clickable', e => e.length);
  let bt = '';
  for (let i = 0; i < n; i++){
    await page.$$eval('#creditDebitWrap .inv-row.clickable', (els, i) => els[i].click(), i); await L.sleep(250);
    bt += ' ' + await L.text(page, '#modalRoot');
    await L.closeModal(page);
  }
  L.ok(/Padaria/.test(bt) && /Mercado/.test(bt) && /Da conta/.test(bt) && /cartão de crédito/.test(bt), 'cada banco abre o que foi gasto nele, no crédito e no débito/Pix');

  L.section('Totais e comparação clicáveis, sem dica ao tocar');
  if (!(await page.$('#invSplitWrap .split-total'))){ await page.$eval('#dashNext', e => e.click()); await L.sleep(250); }
  await page.$eval('#invSplitWrap .inv-seg', el => el.dispatchEvent(new TouchEvent('touchstart', {bubbles: true}))).catch(() => {});
  await L.sleep(150);
  L.ok(!(await page.$('#invSplitWrap .chart-tooltip')), 'tocar numa fatura não abre a caixinha de dica (só o popup)');
  await page.$eval('#invSplitWrap .split-total', e => e.click()); await L.sleep(250);
  L.ok(/Faturas que vencem/.test(await L.modalTitle(page)) && /Mercado/.test(await L.text(page, '#modalRoot')) && /Baixar PDF/.test(await L.text(page, '#modalRoot')), 'clicar no total das faturas abre todas as faturas, com o PDF');
  await L.closeModal(page);
  await page.$eval('#dashToday', e => e.click()).catch(() => {}); await L.sleep(250);
  await page.$eval('#creditDebitWrap .split-total', e => e.click()); await L.sleep(250);
  L.ok(/Total nos bancos/.test(await L.modalTitle(page)) && /Padaria/.test(await L.text(page, '#modalRoot')), 'clicar no total nos bancos abre todos os bancos');
  await L.closeModal(page);
  await page.$eval('#comparisonSummary [data-open-detail="cmp:exp"]', e => e.click()); await L.sleep(250);
  L.ok(/Gastos/.test(await L.modalTitle(page)) && /Mercado|Padaria/.test(await L.text(page, '#modalRoot')), 'clicar em Gastos na comparação mostra o que foi gasto nos dois meses');
  await L.closeModal(page);
  await page.$eval('#comparisonList [data-open-detail^="cmpcat:"]', e => e.click()); await L.sleep(250);
  L.ok(/×/.test(await L.modalTitle(page)), 'clicar numa categoria da comparação abre as compras dela nos dois meses');
  await L.closeModal(page);
});
