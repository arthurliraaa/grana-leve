// "A receber" anotado antes do vínculo: ligar ao gasto e transformar recebimentos antigos em devolução.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const today = L.dayOffset(0);
  // Dados como eram gravados antes: gasto sem vínculo, A receber e um recebimento lançado como ganho.
  await L.patchDb(page, `
    const now = Date.now() - 60000;
    u.transactions.push({id: 'x0', type: 'expense', amount: 100, category: 'lazer', date: '${today}', description: 'Outro gasto', paymentMethod: 'conta', accountId: null, createdAt: now - 3600000});
    u.transactions.push({id: 'x1', type: 'expense', amount: 100, category: 'lazer', date: '${today}', description: 'Show', paymentMethod: 'conta', accountId: null, createdAt: now});
    u.receivables.push({id: 'r1', person: 'Maria', kind: 'combinado', description: 'Show', totalAmount: 100, receivedAmount: 40, dueDate: null, createdAt: now + 5});
    u.receivables.push({id: 'r2', person: 'João', kind: 'emprestimo', description: '', totalAmount: 50, receivedAmount: 0, dueDate: null, createdAt: now});
    u.transactions.push({id: 'x2', type: 'income', amount: 40, category: 'recebimento', date: '${today}', description: 'Recebido de Maria', paymentMethod: null, accountId: null, createdAt: now + 1000});
  `);
  const tile = async label => L.moneyOf(await page.evaluate(l => [...document.querySelectorAll('#statTiles .tile')].find(x => x.querySelector('.tile-lbl').textContent === l).querySelector('.tile-val').textContent, label));
  await L.tab(page, 'dashboard');
  L.ok(await tile('Gastos do mês') === 200 && await tile('Ganhos do mês') === 40, 'antes: o gasto da Maria conta como seu e o recebimento como ganho');

  await L.tab(page, 'receber');
  L.ok(await page.$('[data-recv-link="r1"]') !== null, '“Ligar à compra” aparece no A receber antigo');
  L.ok(await page.$('[data-recv-link="r2"]') === null, 'não aparece em empréstimo (não há gasto para ligar)');
  await L.menuAction(page, '[data-recv-link="r1"]'); await L.sleep(200);
  L.ok(await page.$eval('#lkTx', el => el.value) === 't:x1' && /★ Show/.test(await page.$eval('#lkTx', el => el.options[el.selectedIndex].text)), 'sugere o gasto de mesmo valor lançado no mesmo momento');
  L.ok(/Marcar 1 recebimento\(s\) já registrado\(s\) de Maria \(R\$\s?40,00\) como devolução/.test(await L.text(page, '#modalRoot')), 'oferece transformar o recebimento antigo em devolução');
  await L.submitModal(page); await L.sleep(300);
  const d = await L.db(page);
  L.ok(d.transactions.find(t => t.id === 'x1').forOther.receivableId === 'r1' && !d.transactions.find(t => t.id === 'x0').forOther, 'liga só o gasto escolhido');
  L.ok(d.transactions.find(t => t.id === 'x2').refund === true && d.receivables.find(r => r.id === 'r1').linked, 'recebimento antigo vira devolução e o A receber fica ligado');
  L.ok(await page.$('[data-recv-link="r1"]') === null, 'botão some depois de ligar');
  await L.tab(page, 'dashboard');
  L.ok(await tile('Gastos do mês') === 200 && await tile('Ganhos do mês') === 0, 'depois: o total continua 200 e a devolução não conta como ganho');
  const seus = await page.evaluate(() => [...document.querySelectorAll('#statTiles .tile')].find(x => x.querySelector('.tile-lbl').textContent === 'Gastos do mês').querySelector('.tile-sub').textContent);
  L.ok(/Seus\s*R\$\s?100,00/.test(seus) && /De outras pessoas\s*R\$\s?100,00/.test(seus), 'o gasto da Maria aparece como dela: seus 100 e de outras pessoas 100');
});
