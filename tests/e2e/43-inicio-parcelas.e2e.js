// Início: situação do mês numa frase, parcelas pagas e que faltam, próximos pagamentos e áreas com o nome certo.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  L.section('Sem dados');
  L.ok(/Comece anotando/.test(await L.text(page, '#monthStatus')), 'sem lançamentos, a frase convida a começar');
  L.ok(await page.$eval('#parcelsCard', el => el.hidden), 'sem parcelas, não mostra o quadro de parcelas');

  const today = L.dayOffset(0);
  await L.patchDb(page, `
    const items = [];
    for (let n = 1; n <= 10; n++) items.push({id: 'i' + n, type: 'expense', amount: 120, category: 'compras', date: arg.months[n - 1], description: 'Geladeira (' + n + '/10)',
      paymentMethod: 'cartao', cardId: 'c1', installment: {group: 'g1', n, total: 10, baseDescription: 'Geladeira', totalAmount: 1200}, createdAt: 1});
    u.cards = [{id: 'c1', name: 'Nubank', limit: 5000, closingDay: 3, dueDay: 10, createdAt: 1}];
    u.transactions = items.concat([{id: 's1', type: 'income', amount: 3000, category: 'salario', date: arg.today, description: 'Salário', createdAt: 1},
      {id: 'm1', type: 'expense', amount: 500, category: 'alimentacao', date: arg.today, description: 'Mercado', paymentMethod: 'conta', createdAt: 1}]);
    u.debts = [{id: 'd1', name: 'Empréstimo', kind: 'pessoa', creditor: 'Tia Rosa', totalAmount: 1200, paidAmount: 300, monthlyPayment: 150, urgency: 'alta', createdAt: 1}];
    u.receivables = [{id: 'r1', person: 'Bia', kind: 'emprestimo', description: 'Ingresso', totalAmount: 180, receivedAmount: 60, installments: 3, installmentAmount: 60, dueDate: arg.today, urgency: 'media', createdAt: 1}];
    u.bills = [{id: 'b1', name: 'Internet', category: 'moradia', amount: 100, every: 1, dueDay: 28, startMonth: arg.today.slice(0, 7), pay: 'conta', amounts: [], paid: {}, createdAt: 1}];`,
    {today, months: Array.from({length: 10}, (_, i) => L.plusMonths(today, i - 3))});
  await L.tab(page, 'dashboard');

  L.section('Situação do mês numa frase');
  const status = await L.text(page, '#monthStatus');
  L.ok(/Até hoje entraram R\$\s?3\.000,00 e saíram R\$\s?\d/.test(status), 'diz quanto entrou e quanto saiu até hoje');
  L.ok(/Saldo do mês: R\$/.test(status), 'diz o saldo do mês');

  L.section('Parcelas: quantas foram e quantas faltam');
  L.ok(await page.evaluate(() => document.getElementById('parcelsCard').closest('#dashSec-analises') !== null), 'o quadro fica em “Comparação e parcelas”, nos detalhes do mês');
  const parcels = await page.$$eval('#parcelsCard .parcel-row', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ')));
  const gel = parcels.find(p => /Geladeira/.test(p)), emp = parcels.find(p => /Empréstimo/.test(p)), ing = parcels.find(p => /Ingresso/.test(p));
  L.ok(gel && /4 de 10 pagas · faltam 6 de R\$\s?120,00/.test(gel) && /Cartão Nubank/.test(gel), 'compra no cartão: 4 de 10 pagas, faltam 6');
  L.ok(emp && /2 de 8 pagas · faltam 6 de R\$\s?150,00/.test(emp) && /Você deve a Tia Rosa/.test(emp), 'dívida com parcela mensal: 2 de 8 pagas, faltam 6, a quem');
  L.ok(ing && /1 de 3 recebidas · faltam 2/.test(ing) && /Bia te paga/.test(ing), 'Me devem parcelado aparece como “recebidas”');
  L.ok(/Falta pagar R\$\s?1\.620,00 em 12 parcelas/.test(await L.text(page, '#parcelsCard')), 'resumo: quanto falta pagar e em quantas parcelas (sem somar o que é para receber)');
  L.ok(await page.$$eval('#parcelsCard .parcel-row .progress', ps => ps.length === 3), 'cada uma com barra de progresso');

  L.section('Janela com filtros');
  await L.dashSection(page, 'analises');
  await page.click('#parcelsCard button.btn[data-parcels-open]'); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Parcelas em andamento' && await page.$$eval('#pfList .parcel-row', r => r.length) === 3, 'abre a janela com todas as parcelas');
  const names = async () => page.$$eval('#pfList .parcel-top strong', r => r.map(x => x.textContent));
  await L.setVal(page, '#pfWho', 'terceiros'); await L.sleep(100);
  L.ok((await names()).sort().join('|') === 'Empréstimo|Ingresso', 'terceiros: o que envolve outra pessoa (a quem deve e quem te paga)');
  await L.setVal(page, '#pfWho', 'minhas'); await L.sleep(100);
  L.ok((await names()).join('|') === 'Geladeira', 'só minhas: a compra no meu cartão');
  await L.setVal(page, '#pfWho', 'p:bia'); await L.sleep(100);
  L.ok((await names()).join('|') === 'Ingresso', 'filtra por pessoa (Bia)');
  await L.setVal(page, '#pfWho', ''); await L.sleep(50);
  await page.click('input[name=pfStage][value=inicio] + span'); await L.sleep(100);
  L.ok((await names()).join('|') === 'Ingresso', 'primeira parcela: só o que acabou de começar (1 de 3)');
  await page.click('input[name=pfStage][value=perto] + span'); await L.sleep(100);
  L.ok((await names()).join('|') === 'Ingresso', 'perto do fim: faltam até 2 (ou 1/4)');
  await page.click('input[name=pfStage][value=longe] + span'); await L.sleep(100);
  L.ok((await names()).sort().join('|') === 'Empréstimo|Geladeira', 'longe do fim: falta mais da metade');
  await page.click('#pfList .parcel-row[data-go="dividas"]'); await L.sleep(250);
  L.ok(!(await L.modalOpen(page)) && !(await page.$eval('#tab-dividas', el => el.hidden)), 'tocar numa parcela fecha a janela e leva para a área dela');

  L.section('Próximos pagamentos levam para a área certa');
  await L.tab(page, 'dashboard');
  await page.click('[data-sum-more="3"]'); await L.sleep(150);
  const rows = await page.$$eval('#sumD3 a.sum-row-link', as => as.map(a => [a.getAttribute('data-go'), a.textContent.replace(/\s+/g, ' ')]));
  // A lista mostra os 5 mais urgentes (aqui, faturas atrasadas vêm antes); a conta fixa está na lista completa.
  const all = await page.evaluate(() => import('/js/ui/home-tab.js').then(m => m.upcomingCommitments().map(c => [c.go, c.title, c.note])));
  L.ok(all.some(r => r[0] === 'fixas' && r[1] === 'Internet' && r[2] === 'conta fixa'), 'conta fixa leva para Contas fixas');
  L.ok(rows.some(r => r[0] === 'dividas' && /Empréstimo · Tia Rosa/.test(r[1]) && /parcela 3 de 8/.test(r[1])), 'dívida diz a quem e qual parcela');
  L.ok(rows.some(r => r[0] === 'cartoes' && /Fatura Nubank/.test(r[1])), 'fatura leva para Contas e cartões');
  await page.click('#sumD3 a.sum-row-link[data-go="cartoes"]'); await L.sleep(200);
  L.ok(!(await page.$eval('#tab-cartoes', el => el.hidden)), 'tocar no item abre a área dele');

  L.section('Áreas com o nome certo');
  const nav = await page.$$eval('.sidenav .sidenav-links > *', els => els.map(e => e.textContent.trim()));
  L.ok(nav.indexOf('Compromissos') > nav.indexOf('Planejar') && !nav.includes('Contas fixas'), 'Compromissos fica em “Planejar”; Contas fixas fica dentro de Ganhos e gastos');
  await L.tab(page, 'dividas');
  L.ok(/Contas de todo mês ficam em Contas fixas/.test(await L.text(page, '#tab-compromissos .tab-intro')), 'Compromissos explica que contas fixas são gastos do mês');
  await page.setViewport({width: 360, height: 760}); await L.tab(page, 'dashboard'); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'Início cabe no celular');
  await page.setViewport({width: 1280, height: 900});
});
