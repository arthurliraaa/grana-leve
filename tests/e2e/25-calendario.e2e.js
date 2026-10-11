// Calendário em Ganhos e gastos: dias com ganhos/gastos, previstos, detalhe do dia, ano e filtros.
import * as L from './lib.js';
import {invoiceFor} from '../../js/domain/cards.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 5, 12);
  let d = await L.db(page);
  const acc = d.accounts[0], card = d.cards[0];
  const today = L.dayOffset(0), cur = L.monthKey(0);
  await L.addTx(page, {amount: 50, pay: 'acc:' + acc.id, desc: 'Mercado', category: 'alimentacao'});
  await L.addTx(page, {amount: 1500, type: 'income', desc: 'Salário', category: 'salario'});
  await L.addTx(page, {amount: 300, pay: 'card:' + card.id, install: 3, desc: 'Fone', category: 'compras'});
  // Conta fixa que vence no dia 28 deste mês.
  await page.goto(L.BASE + '#/lancamentos/contas-fixas'); await L.sleep(300);
  await page.type('#billName', 'Internet'); await page.type('#billAmount', '100'); await page.type('#billDay', '28');
  await page.click('#billForm button[type=submit]'); await L.sleep(250);

  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txCal', el => el.hidden) && await page.$eval('[data-txview="list"]', el => el.getAttribute('aria-pressed')) === 'true', 'começa na lista');
  await page.click('[data-txview="cal"]'); await L.sleep(150);
  L.ok(!(await page.$eval('#txCal', el => el.hidden)) && await page.$$eval('#txCal [data-cal-day]', c => c.length) >= 28, 'calendário mostra os dias do mês');
  L.ok(await page.$eval('#txSort', el => el.hidden), 'ordenação some no calendário');
  const cell = sel => page.$eval('[data-cal-day="' + sel + '"]', el => ({txt: el.textContent, label: el.querySelector('.sr-only').textContent, sel: el.classList.contains('cal-sel')}));
  const t = await cell(today);
  // A parcela do cartão conta no mês da fatura: se a fatura de hoje vence no mês que vem, hoje só há o mercado.
  const cardNow = invoiceFor(today, card).due.slice(0, 7) === cur;
  L.ok(/\+1,5 mil/.test(t.txt) && new RegExp('−' + (cardNow ? 150 : 50)).test(t.txt), 'dia de hoje: +1,5 mil de ganho e −' + (cardNow ? '150 (50 + parcela de 100)' : '50 (a parcela é da fatura do mês que vem)'));
  L.ok(t.sel && /Mercado/.test(await L.text(page, '#txList')) && /Salário/.test(await L.text(page, '#txList')), 'hoje já vem selecionado com os lançamentos do dia');
  const due = cur + '-28';
  if (due !== today){
    L.ok(/conta fixa Internet/.test((await cell(due)).label), 'dia 28 marca a conta fixa prevista');
    await page.click('[data-cal-day="' + due + '"]'); await L.sleep(150);
    L.ok(/Previsto para o dia/.test(await L.text(page, '#txList')) && /Internet/.test(await L.text(page, '#txList')), 'tocar no dia mostra o previsto');
    L.ok(await page.$eval('[data-cal-day="' + due + '"]', el => el.getAttribute('aria-pressed')) === 'true', 'dia tocado fica marcado');
  }
  L.ok(/Vencimento de fatura/.test(await L.text(page, '.cal-legend')), 'legenda dos previstos');

  L.section('Próximo mês: parcela e fatura');
  await page.click('#nextMonth'); await L.sleep(150);
  const nextTxt = await page.$$eval('#txCal [data-cal-day]', c => c.map(x => x.querySelector('.sr-only').textContent).join('|'));
  L.ok(/gastos R\$\s?100,00/.test(nextTxt), 'parcela do mês que vem aparece no dia dela');
  L.ok(/vencimento de fatura Fatura Inter/.test(nextTxt), 'vencimento da fatura do Inter marcado');
  await page.click('#prevMonth'); await L.sleep(150);

  L.section('Filtros');
  await L.setVal(page, '#txFilterCat', 'alimentacao'); await L.sleep(150);
  const f = await cell(today);
  L.ok(/−50/.test(f.txt) && !/\+/.test(f.txt), 'filtro de categoria vale no calendário');
  await L.setVal(page, '#txFilterCat', 'all');
  const payOpts = await page.$$eval('#txFilterPay option', o => o.map(x => x.textContent));
  L.ok(payOpts.includes('Conta Nubank') && payOpts.includes('Cartão Inter'), 'filtro por conta e cartão específicos');
  await L.setVal(page, '#txFilterPay', 'card:' + card.id); await L.sleep(150);
  L.ok(cardNow ? /−100/.test((await cell(today)).txt) : !/−/.test((await cell(today)).txt), 'só o cartão Inter (' + (cardNow ? 'parcela de hoje' : 'nada conta hoje') + ')');
  await L.setVal(page, '#txFilterPay', 'all');

  L.section('Ano');
  await page.click('[data-txview="year"]'); await L.sleep(150);
  L.ok(await L.text(page, '#txMonthLabel') === cur.slice(0, 4) && await page.$$eval('#txCal [data-cal-month]', c => c.length) === 12, 'ano: 12 meses');
  L.ok(/Ano de \d{4} · ganhos R\$\s?1\.500,00/.test(await L.text(page, '#txSummary')), 'resumo do ano');
  await page.click('[data-cal-month="' + cur + '"]'); await L.sleep(150);
  L.ok(await page.$eval('[data-txview="cal"]', el => el.getAttribute('aria-pressed')) === 'true' && (await L.text(page, '#txMonthLabel')).length > 4, 'tocar no mês abre o calendário dele');
  await L.reload(page); await L.tab(page, 'lancamentos');
  L.ok(!(await page.$eval('#txCal', el => el.hidden)), 'lembra a visualização escolhida');

  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'calendário cabe no celular');
});
