// Planejar gastos: aviso de 90% em qualquer tela (com "Dispensar"), aviso de primeira vez e gráfico de evolução.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'limites');
  L.ok(/Como o planejamento avisa você/.test(await L.text(page, '#budgetList')), 'primeira vez na aba: explica como funcionam os avisos (90%)');
  await page.click('[data-budget-intro-ok]'); await L.sleep(150);
  L.ok(!(await page.$('.budget-intro')), '“Entendi” fecha o aviso');

  L.section('Definir limite e gastar até 90%');
  await page.type('[data-budget-cat="alimentacao"]', '1.000');
  await page.$eval('[data-budget-cat="alimentacao"]', el => el.blur()); await L.sleep(300);
  L.ok(!!(await page.$('.budget-chart svg')), 'com limite definido, a aba mostra o gráfico de evolução do mês');
  await L.addTx(page, {amount: 850, desc: 'Mercado', category: 'alimentacao'});
  L.ok(!(await page.$('#modalRoot .ba-list')), 'com 85% ainda não há aviso');
  await L.addTx(page, {amount: 60, desc: 'Padaria', category: 'alimentacao'});
  await L.sleep(300);
  const t1 = await L.text(page, '#modalRoot');
  L.ok(/Perto do limite do planejamento/.test(await L.modalTitle(page)) && /Alimentação/.test(t1) && /restam R\$\s?90,00 · 91%/.test(t1), 'com 91% abre um popup: perto do limite, restam R$ 90');
  await L.closeModal(page);
  L.ok(!(await page.$('#budgetAlerts')), 'não há faixa fixa na tela');
  await L.tab(page, 'dashboard'); await L.tab(page, 'metas'); await L.sleep(300);
  L.ok(await page.$eval('#modalRoot', e => e.hidden), 'depois de fechado, o aviso não volta sozinho');

  L.section('Passar do limite avisa de novo');
  await L.addTx(page, {amount: 150, desc: 'Jantar', category: 'alimentacao'});
  await L.sleep(300);
  const t2 = await L.text(page, '#modalRoot');
  L.ok(/Atenção ao planejamento/.test(await L.modalTitle(page)) && /passou R\$\s?60,00 · 106%/.test(t2), 'passando do limite abre outro popup (passou R$ 60)');
  await L.closeModal(page);

  L.section('Gráfico de evolução');
  await L.tab(page, 'limites');
  const chart = await L.text(page, '.budget-chart');
  L.ok(/Evolução do mês/.test(chart) && /do planejado usado/.test(chart) && /ritmo ideal/.test(chart), 'o gráfico diz se está acima ou abaixo do ritmo ideal');
  L.ok(await page.$$eval('.budget-chart .bch-line, .budget-chart .bch-dot', e => e.length) >= 1, 'a linha do gasto acumulado é desenhada');
  L.ok(!(await page.$('#budgetChartCat')) && await page.$$eval('.bch-chips .chip', c => c.length) >= 2, 'categorias do gráfico são botões (sem lista suspensa)');
  await page.$eval('.bch-chips [data-chart-cat="alimentacao"]', el => el.click()); await L.sleep(200);
  L.ok(/Alimentação/.test(await L.text(page, '.bch-chips .chip.on')) && /Evolução do mês/.test(await L.text(page, '.budget-chart')), 'escolher uma categoria atualiza o gráfico');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
  await page.setViewport({width: 1280, height: 900});
});
