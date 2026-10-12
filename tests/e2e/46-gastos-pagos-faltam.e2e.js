// Início → Gastos do mês: o total em destaque e, embaixo, quanto falta pagar no mês; no +, por banco,
// o que já foi pago e o que falta (fatura que vence no mês, contas fixas, gastos agendados).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const today = L.dayOffset(0), cur = today.slice(0, 7);
  const last = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)), 0).getDate();
  if (Number(today.slice(8)) >= last - 1){ console.log('Pulado: perto do fim do mês não sobra data para os pendentes.'); return; }
  const prev15 = L.monthKey(-1) + '-15', later = cur + '-' + String(last).padStart(2, '0');
  await L.patchDb(page, `
    u.accounts = [{id: 'a1', name: 'Inter', initialBalance: 2000, baseDate: '2020-01-01', baseAt: 0, createdAt: 1}];
    u.cards = [{id: 'c1', name: 'Inter', accountId: 'a1', limit: 5000, closingDay: 1, dueDay: 25, paidInvoices: [], createdAt: 1,
      invoiceAdvances: {[arg.cur]: [{id: 'x1', date: arg.today, amount: 100, accountId: 'a1', createdAt: 2}]}}];
    u.transactions = [
      {id: 't1', type: 'expense', amount: 300, category: 'compras', date: arg.prev15, description: 'Tênis', paymentMethod: 'cartao', cardId: 'c1', createdAt: 1},
      {id: 't2', type: 'expense', amount: 50, category: 'alimentacao', date: arg.today, description: 'Padaria', paymentMethod: 'conta', accountId: 'a1', createdAt: 1},
      {id: 't3', type: 'expense', amount: 40, category: 'lazer', date: arg.later, description: 'Show agendado', paymentMethod: 'conta', accountId: null, createdAt: 1}];
    u.bills = [{id: 'b1', name: 'Internet', category: 'moradia', amount: 100, every: 1, dueDay: ${last}, startMonth: arg.cur, pay: 'acc:a1', amounts: [], paid: {}, createdAt: Date.now()}];`,
    {cur, today, prev15, later});
  await L.tab(page, 'dashboard');
  const card2 = '#summaryCards .sum-card:nth-child(2)';
  L.ok(/Falta pagar R\$\s?340,00 neste mês/.test(await L.text(page, card2)), 'falta pagar: 200 da fatura (300 − 100 adiantados) + 100 da conta fixa + 40 agendado');
  await page.click('[data-sum-more="2"]'); await L.sleep(120);
  const rows = await page.$$eval('#sumD2 .bp-row', els => els.map(e => [...e.children].map(c => c.textContent.trim()).join(' | ')));
  L.ok(rows.some(r => /^Inter \| R\$\s?150,00 \| R\$\s?300,00$/.test(r)),
    'Inter: pagou 150 (padaria 50 + 100 adiantados), falta 300 (fatura 200 + Internet 100)');
  L.ok(rows.some(r => /^Dinheiro \| R\$\s?0,00 \| R\$\s?40,00$/.test(r)), 'Dinheiro: falta o gasto agendado (40)');
  L.ok(rows.some(r => /^Total \| R\$\s?150,00 \| R\$\s?340,00$/.test(r)), 'linha de total');
  L.ok(!/Onde mais gastou/.test(await L.text(page, '#sumD2')), 'o detalhe mostra pagamentos por banco, não “onde mais gastou”');
  await page.click('#sumD2 a.bp-row'); await L.sleep(200);
  L.ok(!(await page.$eval('#tab-cartoes', el => el.hidden)), 'tocar no banco abre Contas e cartões');
});
