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
  L.ok(await page.$eval('#budgetAlerts', e => e.hidden), 'com 85% ainda não há aviso');
  await L.addTx(page, {amount: 60, desc: 'Padaria', category: 'alimentacao'});
  await L.tab(page, 'dashboard');
  const t1 = await L.text(page, '#budgetAlerts');
  L.ok(!(await page.$eval('#budgetAlerts', e => e.hidden)) && /Alimentação/.test(t1) && /91%/.test(t1) && /Restam R\$\s?90,00/.test(t1), 'com 91% aparece o aviso no Início: restam R$ 90');
  await L.tab(page, 'metas');
  L.ok(!(await page.$eval('#budgetAlerts', e => e.hidden)), 'o aviso aparece também em outras telas (Metas)');

  L.section('Dispensar e passar do limite');
  await page.click('[data-budget-dismiss]'); await L.sleep(150);
  L.ok(await page.$eval('#budgetAlerts', e => e.hidden), 'dispensar esconde o aviso');
  await L.addTx(page, {amount: 150, desc: 'Jantar', category: 'alimentacao'});
  const t2 = await L.text(page, '#budgetAlerts');
  L.ok(!(await page.$eval('#budgetAlerts', e => e.hidden)) && /passou R\$\s?60,00 do planejado/.test(t2), 'passando do limite o aviso volta (passou R$ 60)');

  L.section('Gráfico de evolução');
  await L.tab(page, 'limites');
  const chart = await L.text(page, '.budget-chart');
  L.ok(/Evolução do mês/.test(chart) && /do planejado usado/.test(chart) && /ritmo ideal/.test(chart), 'o gráfico diz se está acima ou abaixo do ritmo ideal');
  L.ok(await page.$$eval('.budget-chart .bch-line, .budget-chart .bch-dot', e => e.length) >= 1, 'a linha do gasto acumulado é desenhada');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
  await page.setViewport({width: 1280, height: 900});
});
