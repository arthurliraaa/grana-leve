// Ganhos e gastos: devoluções de uma mesma pessoa ficam numa caixa que abre e fecha (sem "spam" de linhas iguais).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const day = L.dayOffset(0);
  await L.patchDb(page, `
    u.receivables.push({id: 'rg', person: 'Gessi', kind: 'cartao', description: 'Geladeira', totalAmount: 500, receivedAmount: 500, createdAt: 1});
    for (let i = 0; i < 5; i++) u.transactions.push({id: 'dv' + i, type: 'income', refund: true, receivableId: 'rg', amount: 100, category: 'recebimento', date: arg.d, description: 'Devolução de Gessi', createdAt: 10 + i});
    u.transactions.push({id: 'dx1', type: 'income', refund: true, amount: 30, category: 'recebimento', date: arg.d, description: 'Devolução de Ana', createdAt: 30});
    u.transactions.push({id: 'sal', type: 'income', amount: 2000, category: 'salario', date: arg.d, description: 'Salário', createdAt: 31});`, {d: day});
  await L.tab(page, 'lancamentos'); await L.sleep(300);
  const rowsOutside = () => page.$$eval('#txList > .tx-row', r => r.length);
  L.ok(await page.$$eval('#txList .tx-group', g => g.length) === 1, 'as 5 devoluções da Gessi viram uma única caixa (a da Ana, só uma, continua solta)');
  const head = await L.text(page, '#txList .tx-group > summary');
  L.ok(/Devoluções de Gessi/.test(head) && /5 recebimentos/.test(head) && /R\$\s?500,00/.test(head), 'a caixa diz a pessoa, quantos recebimentos e o total');
  L.ok(await page.$eval('#txList .tx-group', g => !g.open) && await rowsOutside() === 2, 'começa fechada: só aparecem a devolução da Ana e o salário');
  await page.click('#txList .tx-group > summary'); await L.sleep(200);
  L.ok(await page.$$eval('#txList .tx-group .tx-row', r => r.length) === 5, 'abrir mostra os 5 recebimentos');
  await L.tab(page, 'dashboard'); await L.tab(page, 'lancamentos'); await L.sleep(200);
  L.ok(await page.$eval('#txList .tx-group', g => g.open), 'a escolha de abrir é lembrada');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
