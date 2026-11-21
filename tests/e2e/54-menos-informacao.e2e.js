// Menos informação de uma vez: primeiros passos, detalhes do mês em partes, “Filtrar”, “Desfazer”,
// média de 3 meses no Planejar e metas resumidas numa frase.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);

  L.section('Primeiros passos');
  L.ok(!(await page.$eval('#firstSteps', el => el.hidden)) && /0 de 3/.test(await L.text(page, '#firstSteps .fs-count')), 'conta nova vê “Primeiros passos” (0 de 3)');
  await page.$eval('#firstSteps [data-first-tx]', el => el.click()); await L.sleep(250);
  L.ok(await L.modalTitle(page) === 'Novo lançamento', '“Lançar agora” abre o lançamento');
  await L.setVal(page, '#mAmount', 40); await L.setVal(page, '#mDesc', 'Mercado');
  await L.submitModal(page); await L.sleep(300);
  L.ok(/1 de 3/.test(await L.text(page, '#firstSteps .fs-count')) && await page.$$eval('#firstSteps li.done', l => l.length) === 1, 'lançar marca o passo como feito');

  L.section('Aviso com Desfazer');
  const t = await page.$$eval('#toastWrap .toast-action', ts => ts.map(x => x.textContent).join(' | '));
  L.ok(/Gasto de R\$\s?40,00 em .+ registrado\.Desfazer/.test(t), 'o aviso diz o valor e a categoria, com “Desfazer”');
  await page.$eval('#toastWrap .toast-action .toast-btn', el => el.click()); await L.sleep(300);
  L.ok((await L.db(page)).transactions.length === 0 && /Lançamento desfeito/.test(await L.allToasts(page)), '“Desfazer” apaga o que acabou de ser salvo');
  await page.$eval('#firstSteps [data-first-hide]', el => el.click()); await L.sleep(150);
  L.ok(await page.$eval('#firstSteps', el => el.hidden), '“Esconder” tira os primeiros passos');

  L.section('Detalhes do mês em três partes');
  await page.$eval('#dashDetailsBtn', el => el.click()); await L.sleep(200);
  const vis = () => page.$$eval('.dash-sec', ss => ss.filter(s => !s.hidden).map(s => s.id));
  L.ok((await vis()).join() === 'dashSec-numeros', 'abre em “Números”, uma parte por vez');
  await page.$eval('#dashSecBtn-numeros', el => el.focus()); await page.keyboard.press('ArrowRight'); await L.sleep(200);
  L.ok((await vis()).join() === 'dashSec-graficos' && await page.evaluate(() => document.activeElement.id) === 'dashSecBtn-graficos', 'seta para a direita vai para “Gráficos”');
  await L.reload(page); await L.tab(page, 'dashboard'); await page.$eval('#dashDetailsBtn', el => el.click()); await L.sleep(200);
  L.ok((await vis()).join() === 'dashSec-graficos', 'a parte escolhida é lembrada');

  L.section('Filtrar');
  await L.tab(page, 'lancamentos');
  L.ok(await page.$eval('#txFilterPanel', el => el.hidden) && !(await page.$eval('#txSearch', el => el.hidden)), 'a busca fica à vista e os filtros recolhidos');
  await page.$eval('#txFilterBtn', el => el.click()); await L.sleep(100);
  L.ok(!(await page.$eval('#txFilterPanel', el => el.hidden)) && await page.$eval('#txFilterBtn', el => el.getAttribute('aria-expanded')) === 'true', '“Filtrar” abre os filtros');
  await L.setVal(page, '#txFilterType', 'expense'); await L.sleep(150);
  L.ok(await L.text(page, '#txFilterCount') === '1', 'o botão mostra quantos filtros estão ligados');
  await L.setVal(page, '#txFilterType', 'all'); await L.sleep(100);

  L.section('Planejar: média dos últimos 3 meses');
  await L.patchDb(page, `[1, 2].forEach(m => { const d = new Date(); d.setMonth(d.getMonth() - m, 10); u.transactions.push({id: 'p' + m, type: 'expense', amount: 300, category: 'alimentacao', date: d.toISOString().slice(0, 10), description: 'Mercado', paymentMethod: null, createdAt: m}); });`);
  await L.tab(page, 'limites'); await L.sleep(200);
  await page.$eval('[data-budget-fill]', el => el.click()); await L.sleep(300);
  L.ok(await page.$eval('[data-budget-cat="alimentacao"]', el => el.value) === '200', 'usa a média (600 em 3 meses = 200 por mês)');

  L.section('Meta numa frase');
  await L.tab(page, 'metas');
  await page.type('#goalName', 'Viagem'); await page.type('#goalTarget', '1.200');
  await page.click('#goalForm button[type=submit]'); await L.sleep(250);
  const card = '#goalGrid .goal-card';
  L.ok(/Faltam R\$\s?1\.200,00\./.test(await L.text(page, card + ' .goal-headline')), 'a meta diz quanto falta numa frase');
  L.ok(await page.$eval(card + ' details.goal-more', d => !d.open), 'rendimento e previsões ficam em “Detalhes da meta”');
  L.ok(await page.$eval('#goalInvMore', d => !d.open), 'no formulário, o tipo de aplicação fica recolhido');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'lancamentos'); await L.sleep(150);
  L.ok(await page.$eval('#txForm', el => getComputedStyle(el).display) === 'none' && await page.$eval('.tx-mobile-open', el => getComputedStyle(el).display) !== 'none', 'no celular, lança pelo botão (o formulário longo não ocupa a tela)');
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');
  const mid = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) <= 3; });
  L.ok(await mid('#tab-lancamentos .month-switch'), 'o seletor de mês de Ganhos e gastos fica centralizado');
  await L.tab(page, 'limites'); await L.sleep(150);
  L.ok(await mid('#tab-limites .month-switch'), 'o de Planejar também');
  await L.tab(page, 'dashboard'); await L.dashSection(page, 'graficos');
  // ‹ mês › na mesma linha: os dois botões alinhados e o nome do mês dentro da altura deles (o selo “Este mês” pode ficar embaixo do nome).
  const nav = await page.$$eval('#dashPrev, #dashNavLabel, #dashNext', els => els.map(e => { const r = e.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, c: r.top + r.height / 2}; }));
  L.ok(Math.abs(nav[0].c - nav[2].c) <= 4 && nav[1].top >= nav[0].top - 4 && nav[1].bottom <= nav[0].bottom + 4, 'no Início, ‹ mês › ficam numa linha só');
});
