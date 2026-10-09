// Planejar gastos por mês, meses passados travados e nova categoria pelo Planejar gastos.
import * as L from './lib.js';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

L.run(async ({page}) => {
  await L.signup(page);
  const cur = L.monthKey(0), prev = L.monthKey(-1);

  L.section('Dados antigos: um valor para todos os meses');
  await L.patchDb(page, `
    u.budgets = {alimentacao: 500, lazer: 200};
    u.transactions = [{id:'old1', type:'expense', amount:450, category:'alimentacao', date: arg + '-10', description:'Mercado mês passado', paymentMethod:'conta', createdAt: 1}];
  `, prev);
  await L.tab(page, 'limites');
  const val = cat => page.$eval('[data-budget-cat="' + cat + '"]', el => el.value);
  const dis = cat => page.$eval('[data-budget-cat="' + cat + '"]', el => el.disabled);
  L.ok(await val('alimentacao') === '500' && await val('lazer') === '200', 'mês atual mostra os valores antigos');
  L.ok(!(await dis('alimentacao')), 'mês atual pode ser editado');
  await page.click('#budgetPrev'); await L.sleep(100);
  L.ok(await val('alimentacao') === '500', 'mês anterior também mostra o valor antigo');
  L.ok(await dis('alimentacao') && await dis('lazer'), 'mês anterior está travado');
  L.ok(/Mês encerrado/.test(await L.text(page, '#budgetNote')), 'aviso de mês encerrado');
  L.ok(await page.$eval('#budgetNewCat', el => el.hidden), 'sem “Nova categoria” no mês travado');
  L.ok(/R\$\s?450,00 de R\$\s?500,00/.test(await L.text(page, '#budgetList')), 'gasto do mês anterior comparado com o planejado dele');

  L.section('Mudar o mês atual não altera o anterior');
  await page.click('#budgetNext'); await L.sleep(100);
  await L.setVal(page, '[data-budget-cat="alimentacao"]', '800'); await L.sleep(250);
  L.ok(await val('alimentacao') === '800', 'mês atual ficou com 800');
  L.ok(/em .* atualizado/.test(await L.lastToast(page)), 'toast cita o mês');
  await page.click('#budgetPrev'); await L.sleep(100);
  L.ok(await val('alimentacao') === '500', 'mês anterior continua 500');
  L.ok(await val('lazer') === '200', 'outras categorias do mês anterior intactas');
  await page.click('#budgetNext'); await L.sleep(100);
  L.ok(await val('lazer') === '200', 'mês atual herdou as demais categorias');
  let d = await L.db(page);
  const plan = d.budgets.find(b => b.id === 'plan-' + cur);
  L.ok(plan && plan.month === cur && plan.limits.alimentacao === 800 && plan.limits.lazer === 200, 'plano do mês salvo com cópia das demais categorias');
  L.ok(d.budgets.some(b => b.id === 'alimentacao' && b.limit === 500), 'valor antigo preservado para os meses passados');

  L.section('Próximo mês');
  await page.click('#budgetNext'); await L.sleep(100);
  L.ok(!(await dis('alimentacao')), 'próximo mês pode ser planejado');
  L.ok(await page.$eval('#budgetNext', el => el.disabled), 'não passa do próximo mês');
  L.ok(await val('alimentacao') === '800', 'próximo mês começa com os valores do atual');
  await L.setVal(page, '[data-budget-cat="alimentacao"]', '900'); await L.sleep(250);
  await page.click('#budgetPrev'); await L.sleep(100);
  L.ok(await val('alimentacao') === '800', 'mudar o próximo mês não altera o atual');
  await L.setVal(page, '[data-budget-cat="alimentacao"]', '700'); await L.sleep(250);
  await page.click('#budgetNext'); await L.sleep(100);
  L.ok(await val('alimentacao') === '900', 'próximo mês mantém o plano próprio');
  await page.click('#budgetPrev'); await L.sleep(100);

  L.section('Apagar o valor deixa a categoria sem limite');
  await L.setVal(page, '[data-budget-cat="lazer"]', ''); await L.sleep(250);
  L.ok(await val('lazer') === '', 'lazer ficou sem limite no mês atual');
  await page.click('#budgetPrev'); await L.sleep(100);
  L.ok(await val('lazer') === '200', 'mês anterior continua com 200 em lazer');
  await page.click('#budgetNext'); await L.sleep(100);

  L.section('Aviso de planejamento usa o valor do mês');
  await L.addTx(page, {amount: 600, category: 'alimentacao'});
  const toasts = await L.allToasts(page);
  L.ok(/86% do planejado para Alimentação/.test(toasts), 'aviso de 86% com o limite de 700');

  L.section('Nova categoria pelo Planejar gastos');
  await L.tab(page, 'limites');
  await page.click('#budgetNewCat'); await L.sleep(150);
  L.ok(/Nova categoria de gasto/.test(await L.modalTitle(page)), 'abre o popup de nova categoria');
  L.ok(/Planejar gastos/.test(await L.text(page, '#modalRoot')), 'explica que vale nas duas abas');
  await page.type('#newCatName', 'Academia');
  await L.submitModal(page);
  d = await L.db(page);
  const acad = d.categories.find(c => c.label === 'Academia');
  L.ok(!!acad, 'categoria criada');
  L.ok(await page.$('[data-budget-cat="' + (acad && acad.id) + '"]') !== null, 'aparece na lista do planejamento');
  L.ok(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-budget-cat')), 'foco vai para o valor da categoria nova');
  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txCategory', (el, id) => [...el.options].some(o => o.value === id), acad.id), 'aparece no formulário de Ganhos e gastos');
  await L.tab(page, 'limites');
  await page.click('#budgetManageCats'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Minhas categorias', '“Minhas categorias” também abre pelo planejamento');
  await L.closeModal(page);

  L.section('Persistência e backup');
  await L.reload(page);
  await L.tab(page, 'limites');
  L.ok(await val('alimentacao') === '700', 'plano do mês continua depois de recarregar');
  const backup = {app: 'grana-leve', version: 1, exportedAt: new Date().toISOString(), data: {transactions: [], categories: [], budgets: [
    {id: 'alimentacao', limit: 100},
    {id: 'plan-' + prev, month: prev, limits: {alimentacao: 333}},
    {id: 'plan-' + cur, month: cur, limits: {alimentacao: 444}}]}};
  const file = join(tmpdir(), 'grana-backup-planejamento.json');
  writeFileSync(file, JSON.stringify(backup));
  await page.click('[data-info="backup"]'); await L.sleep(150);
  await (await page.$('#backupFile')).uploadFile(file); await L.sleep(400);
  await L.submitModal(page); await L.sleep(300);
  await L.tab(page, 'limites');
  L.ok(await val('alimentacao') === '444', 'backup restaurado: mês atual 444');
  await page.click('#budgetPrev'); await L.sleep(100);
  L.ok(await val('alimentacao') === '333', 'backup restaurado: mês anterior 333');
  await page.click('#budgetPrev'); await L.sleep(100);
  L.ok(await val('alimentacao') === '100', 'mês sem plano próprio usa o valor antigo');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'limites');
  L.ok(await L.noHorizontalScroll(page), 'Planejar gastos cabe na tela');
});
