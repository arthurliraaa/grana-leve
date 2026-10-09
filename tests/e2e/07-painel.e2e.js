// Painel: realizado × agendado, esperado, previsão do fim do mês, faturas a pagar e explicação das regras.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const today = L.dayOffset(0);
  const cur = L.monthKey(0), prev = L.monthKey(-1);
  // Um dia ainda neste mês, depois de hoje (no último dia do mês não existe; aí os agendados não são testados).
  const later = [5, 3, 1].map(L.dayOffset).find(d => d.slice(0, 7) === cur);
  const tileOf = async label => page.evaluate((label) => {
    const t = [...document.querySelectorAll('#statTiles .tile')].find(x => x.querySelector('.tile-lbl').textContent === label);
    return t ? {val: t.querySelector('.tile-val').textContent, sub: (t.querySelector('.tile-sub') || {}).textContent || ''} : null;
  }, label);

  L.section('Grupos do painel');
  const groups = await page.$$eval('#statTiles .tiles-group', els => els.map(e => e.textContent));
  L.ok(groups.length === 2 && /Neste mês/.test(groups[0]) && /realizado até hoje/.test(groups[0]) && groups[1] === 'Agora', 'painel separa “Neste mês” (realizado) e “Agora”');
  L.ok(await tileOf('Faturas a pagar') === null && await tileOf('Disponível nas contas') === null, 'sem cartão e sem conta, esses quadros não aparecem');

  L.section('Realizado, agendado e esperado');
  await L.addTx(page, {type: 'income', amount: 2000, desc: 'Salário'});
  await L.addTx(page, {amount: 300, category: 'moradia', desc: 'Luz e água'});
  if (later){
    await L.addTx(page, {amount: 120, date: later, desc: 'Academia', category: 'saude'});
    await L.addTx(page, {type: 'income', amount: 50, date: later, desc: 'Pix combinado'});
  }
  await L.tab(page, 'lancamentos');
  await page.type('#fcDesc', 'Freela'); await page.type('#fcAmount', '400');
  await L.setVal(page, '#fcDate', later || today);
  await page.click('#forecastForm button[type=submit]'); await L.sleep(200);
  await L.tab(page, 'dashboard');
  const inc = await tileOf('Ganhos do mês'), exp = await tileOf('Gastos do mês'), bal = await tileOf('Saldo do mês');
  L.ok(L.moneyOf(inc.val) === 2000, 'ganhos do mês = só o recebido até hoje (2.000)');
  L.ok(L.moneyOf(exp.val) === 300, 'gastos do mês = só o feito até hoje (300)');
  L.ok(L.moneyOf(bal.val) === 1700, 'saldo do mês realizado (1.700)');
  if (later){
    L.ok(/Esperado ainda: \+ R\$\s?450,00/.test(inc.sub), 'esperado = previsão (400) + ganho agendado (50)');
    L.ok(/Agendado: \+ R\$\s?120,00/.test(exp.sub), 'gasto agendado aparece separado (120)');
    L.ok(/Previsto no fim do mês: R\$\s?2\.030,00/.test(bal.sub), 'previsão do fim do mês: 1.700 + 450 − 120 = 2.030');
  } else {
    L.ok(/Esperado ainda: \+ R\$\s?400,00/.test(inc.sub), 'esperado = previsão (400)');
  }

  L.section('Faturas a pagar');
  await L.addCard(page, 'Inter', 5000, 3, 10);
  const d = await L.db(page);
  const card = d.cards[0];
  // Compra do mês passado depois do fechamento: fatura que fechou neste mês. Uma de dois meses atrás: fatura vencida.
  await L.patchDb(page, `
    u.transactions.push({id:'c1', type:'expense', amount:250, category:'compras', date: arg.prev + '-10', description:'Tênis', paymentMethod:'cartao', cardId: arg.card, createdAt: 1});
    u.transactions.push({id:'c2', type:'expense', amount:80, category:'lazer', date: arg.prev2 + '-02', description:'Show', paymentMethod:'cartao', cardId: arg.card, createdAt: 2});
  `, {prev, prev2: L.monthKey(-2), card: card.id});
  let ft = await tileOf('Faturas a pagar');
  const closedThisMonth = Number(today.slice(8)) > 3; // a fatura deste mês já fechou (dia 3)?
  L.ok(ft !== null, 'com cartão, aparece “Faturas a pagar”');
  L.ok(L.moneyOf(ft.val) === (closedThisMonth ? 330 : 80), 'soma as faturas fechadas e não pagas');
  L.ok(/venceu/.test(ft.sub), 'fatura antiga aparece como vencida');
  // Marca a vencida como paga: só sobra a outra.
  await L.tab(page, 'cartoes');
  const oldInvoice = '[data-inv-paid="' + card.id + '"][data-key="' + L.monthKey(-2) + '"]';
  for (let i = 0; i < 4 && !(await page.$(oldInvoice)); i++){ await page.click('[data-inv-shift="' + card.id + '"][data-dir="-1"]'); await L.sleep(80); }
  await page.click(oldInvoice); await L.sleep(250);
  await L.tab(page, 'dashboard');
  ft = await tileOf('Faturas a pagar');
  L.ok(L.moneyOf(ft.val) === (closedThisMonth ? 250 : 0), 'fatura paga sai da soma');
  L.ok(L.moneyOf((await tileOf('Gastos do mês')).val) === 300, 'compras de meses passados no cartão não entram nos gastos deste mês');

  L.section('Explicação das regras (dentro dos detalhes)');
  if (await page.$eval('#dashDetails', el => el.hidden)) await page.click('#dashDetailsBtn');
  await page.click('#calcHelpBtn'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Como o painel calcula', 'abre “Como o painel calcula”');
  const rules = await L.text(page, '#modalRoot');
  L.ok(/Pagar a fatura\s*Não é um gasto novo/.test(rules) && /Realizado e agendado/.test(rules) && /Transferência não é ganho nem gasto/.test(rules), 'explica realizado, fatura e transferência');
  await L.closeModal(page);

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'dashboard');
  L.ok(await L.noHorizontalScroll(page), 'painel cabe na tela');
});
