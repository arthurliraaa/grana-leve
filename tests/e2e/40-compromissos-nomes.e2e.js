// Compromissos: nomes de quem deve e de quem recebe, edição, histórico com quem pagou e botões alinhados.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.patchDb(page, `
    u.debts = [{id: 'd1', name: 'Empréstimo da tia', kind: 'pessoa', creditor: 'Tia Rosa', totalAmount: 1200, paidAmount: 300, monthlyPayment: 150, urgency: 'alta', createdAt: 1,
        payments: [{id: 'q1', date: '2026-09-05', amount: 300, n: 2, accountId: null, asExpense: true}]},
      {id: 'd2', name: 'Cartão atrasado', kind: 'banco', creditor: '', totalAmount: 900, paidAmount: 0, monthlyPayment: 0, urgency: 'media', createdAt: 2}];
    u.receivables = [{id: 'r1', person: 'Bia', kind: 'outro', description: 'Ingresso', totalAmount: 180, receivedAmount: 60, urgency: 'media', createdAt: 1,
        payments: [{id: 'p1', date: '2026-09-10', amount: 60, accountId: null, asIncome: false}]},
      {id: 'r2', person: 'Bia', kind: 'outro', description: 'Uber', totalAmount: 35, receivedAmount: 0, urgency: 'media', createdAt: 2}];
    u.transactions = (u.transactions || []).concat([{id: 'tx1', type: 'expense', amount: 180, category: 'lazer', date: '2026-09-01', description: 'Ingresso', paymentMethod: null,
      forOther: {person: 'Bia', receivableId: 'r1'}, createdAt: 1}]);`);

  L.section('Eu devo: agrupado por quem cobra');
  await L.tab(page, 'dividas');
  let heads = await page.$$eval('#debtGrid .person-head h4', hs => hs.map(h => h.textContent));
  L.ok(heads[0] === 'Tia Rosa' && heads.includes('Sem nome de quem cobra'), 'dívidas ficam no grupo de quem cobra; sem nome, num grupo à parte (por último)');
  L.ok(/Você deve a Tia Rosa\s*R\$\s?900,00/.test(await L.text(page, '#debtGrid .person-group')), 'o grupo diz quanto você deve a cada um');
  L.ok(/faltam cerca de 6 de 8 parcela/.test(await L.text(page, '#debtGrid')), 'mostra quantas parcelas faltam de quantas');
  await page.$eval('#debtGrid details.pay-log', d => { d.open = true; });
  L.ok(/você pagou a Tia/.test(await L.text(page, '#debtGrid .pay-log')), 'histórico diz a quem você pagou');

  L.section('Editar a quem você deve');
  await L.menuAction(page, '[data-debt-edit="d2"]'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Editar dívida', 'abre a edição pelo menu ⋯');
  L.ok(await page.$eval('#edCreditor', el => el.getAttribute('list') === 'peopleList') &&
    await page.$$eval('#peopleList option', os => os.map(o => o.value).includes('Bia') && os.map(o => o.value).includes('Tia Rosa')), 'sugere os nomes já usados (de Eu devo e Me devem)');
  await page.type('#edCreditor', 'tia rosa');
  await L.submitModal(page); await L.sleep(250);
  heads = await page.$$eval('#debtGrid .person-head h4', hs => hs.map(h => h.textContent));
  L.ok(heads.length === 1 && heads[0] === 'Tia Rosa' && /Você deve a Tia Rosa\s*R\$\s?1\.800,00/.test(await L.text(page, '#debtGrid')), 'mesmo nome (sem diferenciar maiúscula) junta no grupo e soma');
  L.ok((await L.db(page)).debts.find(d => d.id === 'd2').creditor === 'tia rosa', 'grava o nome');

  L.section('Me devem: renomear vale também nas compras ligadas');
  await L.tab(page, 'receber');
  L.ok(/Bia te deve\s*R\$\s?155,00/.test(await L.text(page, '#recvGrid .person-group')), 'grupo diz quanto a pessoa te deve');
  await page.$eval('#recvGrid details.pay-log', d => { d.open = true; });
  L.ok(/Bia pagou/.test(await L.text(page, '#recvGrid .pay-log')), 'histórico diz quem pagou');
  L.section('Botões alinhados');
  async function layout(){
    return page.$$eval('#recvGrid .person-group', gs => gs.map(g => {
      const cards = [...g.querySelectorAll('.debt-card')];
      return cards.map(c => {
        const a = c.querySelector(':scope > .card-actions'), r = a.getBoundingClientRect();
        return {fromBottom: Math.round(c.getBoundingClientRect().bottom - r.bottom), maxBtn: Math.max(...[...a.querySelectorAll('.btn')].map(b => b.getBoundingClientRect().height))};
      });
    }));
  }
  let groups = await layout();
  const two = groups.find(g => g.length === 2);
  L.ok(two && Math.abs(two[0].fromBottom - two[1].fromBottom) <= 1, 'cartões lado a lado: botões na mesma altura (no pé do cartão)');
  L.ok(groups.flat().every(c => c.maxBtn <= 44), 'botões não esticam');
  await page.setViewport({width: 360, height: 760}); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
  L.ok(await page.$$eval('#recvGrid .recv-actions', as => as.every(a => [...a.querySelectorAll('.btn')].every(b => b.scrollWidth <= b.clientWidth + 1))), 'no celular, o texto dos botões não vaza');
  await page.setViewport({width: 1280, height: 900}); await L.sleep(200);

  await L.menuAction(page, '[data-recv-edit="r1"]'); await L.sleep(150);
  await page.$eval('#erPerson', el => { el.value = ''; });
  await page.type('#erPerson', 'Beatriz Lima');
  await L.submitModal(page); await L.sleep(300);
  const d = await L.db(page);
  L.ok(d.receivables.find(r => r.id === 'r1').person === 'Beatriz Lima' && d.transactions.find(t => t.id === 'tx1').forOther.person === 'Beatriz Lima', 'o nome muda no “Me devem” e no “Pago por” da compra');
  heads = await page.$$eval('#recvGrid .person-head h4', hs => hs.map(h => h.textContent).sort());
  L.ok(heads.join('|') === 'Beatriz Lima|Bia', 'vira um grupo próprio');

  L.section('Menu ⋯');
  await page.$eval('#recvGrid details.card-menu summary', el => el.click()); await L.sleep(80);
  L.ok(await page.$eval('#recvGrid details.card-menu', el => el.open), 'abre');
  await page.keyboard.press('Escape'); await L.sleep(80);
  L.ok(!(await page.$eval('#recvGrid details.card-menu', el => el.open)), 'Esc fecha');
  await page.$eval('#recvGrid details.card-menu summary', el => el.click()); await L.sleep(80);
  await page.mouse.click(5, 5); await L.sleep(80);
  L.ok(!(await page.$$eval('details.card-menu[open]', ms => ms.length)), 'clicar fora fecha');

});
