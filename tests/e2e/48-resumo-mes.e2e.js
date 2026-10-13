// Início → Resumo do mês: Ganhos (com o disponível), Gastos, Falta pagar, Saldo, e "Agora" só com
// metas, dívidas e o que vence a receber neste mês (que diminui conforme é recebido).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const today = L.dayOffset(0), cur = today.slice(0, 7);
  const last = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)), 0).getDate();
  if (Number(today.slice(8)) >= last - 1){ console.log('Pulado: perto do fim do mês.'); return; }
  const prev15 = L.monthKey(-1) + '-15';
  await L.patchDb(page, `
    u.accounts = [{id: 'a1', name: 'Inter', initialBalance: 2000, baseDate: '2020-01-01', baseAt: 0, createdAt: 1}];
    u.cards = [{id: 'c1', name: 'Inter', accountId: 'a1', limit: 5000, closingDay: 1, dueDay: 25, paidInvoices: [], createdAt: 1}];
    u.transactions = [
      {id: 's1', type: 'income', amount: 3000, category: 'salario', date: arg.today, description: 'Salário', accountId: 'a1', createdAt: 1},
      {id: 't1', type: 'expense', amount: 300, category: 'compras', date: arg.prev15, description: 'Tênis', paymentMethod: 'cartao', cardId: 'c1', createdAt: 1},
      {id: 't2', type: 'expense', amount: 50, category: 'alimentacao', date: arg.today, description: 'Padaria', paymentMethod: 'conta', accountId: 'a1', createdAt: 1}];
    u.receivables = [{id: 'r1', person: 'Bia', kind: 'emprestimo', description: 'Ingresso', totalAmount: 90, receivedAmount: 0, installments: 3, installmentAmount: 30, dueDate: arg.today, urgency: 'media', createdAt: 1},
      {id: 'r2', person: 'Caio', kind: 'emprestimo', description: 'Almoço', totalAmount: 40, receivedAmount: 0, dueDate: arg.next, urgency: 'media', createdAt: 1}];`,
    {today, prev15, next: L.monthKey(1) + '-10'});
  await L.tab(page, 'dashboard');
  await page.click('#dashDetailsBtn'); await L.sleep(150);
  const tile = async l => page.evaluate(x => { const t = [...document.querySelectorAll('#statTiles .tile')].find(e => e.querySelector('.tile-lbl').textContent === x); return t ? {val: t.querySelector('.tile-val').textContent, sub: (t.querySelector('.tile-sub') || {}).textContent || ''} : null; }, l);
  const labels = await page.$$eval('#statTiles .tile-lbl', els => els.map(e => e.textContent));

  L.section('Neste mês');
  L.ok(labels.slice(0, 4).join('|') === 'Ganhos do mês|Gastos do mês|Falta pagar|Saldo do mês', 'ordem: Ganhos, Gastos, Falta pagar, Saldo');
  let g = await tile('Ganhos do mês');
  L.ok(L.moneyOf(g.val) === 3000 && !g.sub && /você tem R\$\s?4\.950,00 nas contas/.test(await L.text(page, '#monthStatus')), 'Ganhos do mês sem texto auxiliar; o disponível nas contas (2.000 + 3.000 − 50) fica no resumo');
  let f = await tile('Falta pagar');
  L.ok(L.moneyOf(f.val) === 300, 'Falta pagar = fatura em aberto (300)');
  let sd = await tile('Saldo do mês');
  L.ok(L.moneyOf(sd.val) === 4650 && /Saldo do mês: R\$\s?4\.650,00/.test(await L.text(page, '#monthStatus')), 'Saldo = disponível − o que falta pagar (a fatura que já saiu não é descontada de novo)');

  L.section('Agora');
  L.ok(!labels.includes('Disponível nas contas') && !labels.some(l => /^Faturas/.test(l)) && !labels.some(l => /^Parcelas no cartão/.test(l)), 'saem: disponível nas contas, faturas e parcelas do cartão');
  let r = await tile('A receber neste mês');
  L.ok(L.moneyOf(r.val) === 30 && /Total a receber: R\$\s?130,00/.test(r.sub), 'A receber neste mês: só a parcela do mês (30); o total (130) fica embaixo');
  // Bia paga a parcela: o valor do mês zera e o total cai.
  await L.tab(page, 'receber');
  await page.click('[data-recv-get="r1"]'); await L.sleep(200);
  await L.submitModal(page); await L.sleep(300);
  await L.tab(page, 'dashboard');
  await page.click('#dashDetailsBtn').catch(() => {}); await L.sleep(100);
  if (await page.$eval('#dashDetails', el => el.hidden)) await page.click('#dashDetailsBtn');
  r = await tile('A receber neste mês');
  L.ok(L.moneyOf(r.val) === 0, 'depois de receber a parcela do mês, o valor do mês zera');
  L.ok(/Total a receber: R\$\s?100,00/.test(r.sub) || /Nada vence neste mês\s*Total a receber: R\$\s?100,00/.test(r.sub), 'e o total diminui (130 → 100)');
});
