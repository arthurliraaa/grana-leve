// Gráficos do Início: mês escolhido (passado, atual, futuro com previsão), ranking de categorias,
// barras clicáveis e comparação acompanhando o mês.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const mk = o => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + o, 10); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-10'; };
  await L.patchDb(page, `
    u.transactions = [
      {id: 'a', type: 'expense', amount: 400, category: 'alimentacao', date: arg.m0, description: 'Mercado', paymentMethod: 'conta', createdAt: 1},
      {id: 'b', type: 'expense', amount: 100, category: 'transporte', date: arg.m0, description: 'Uber', paymentMethod: 'conta', createdAt: 1},
      {id: 'c', type: 'expense', amount: 250, category: 'alimentacao', date: arg.mm1, description: 'Mercado', paymentMethod: 'conta', createdAt: 1},
      {id: 'd', type: 'income', amount: 3000, category: 'salario', date: arg.m0, description: 'Salário', createdAt: 1},
      {id: 'e', type: 'income', amount: 2500, category: 'salario', date: arg.mm1, description: 'Salário', createdAt: 1}];
    u.bills = [{id: 'b1', name: 'Aluguel', category: 'moradia', amount: 900, every: 1, dueDay: 5, startMonth: arg.m0.slice(0, 7), pay: 'conta', amounts: [], paid: {}, createdAt: Date.now()}];
    u.forecasts = [{id: 'f1', description: 'Freela', amount: 600, date: arg.p1, recurring: true, received: {}, createdAt: 1}];`,
    {m0: mk(0), mm1: mk(-1), p1: mk(1)});
  await L.tab(page, 'dashboard');
  await L.dashSection(page, 'graficos');
  const txt = sel => L.text(page, sel);

  L.section('Mês atual');
  L.ok(/Este mês/.test(await txt('#dashNavBadge')) && await page.$eval('#dashToday', el => el.hidden), 'abre no mês atual, sem o botão de voltar');
  L.ok(/Gastos por categoria/.test(await txt('#donutTitle')), 'título da rosca diz o mês');
  const ranks = await page.$$eval('#donutWrap .cat-rank li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  L.ok(/Moradia.*R\$\s?900,00/.test(ranks[0]) && /Alimentação.*R\$\s?400,00/.test(ranks[1]) && /Transporte.*R\$\s?100,00/.test(ranks[2]), 'ranking do maior para o menor (a conta fixa pendente já entra: Moradia 900)');
  L.ok(await page.$$eval('#donutWrap .donut-seg', e => e.length) >= 2 && await page.$$eval('#barWrap .bar-group', e => e.length) === 6, 'rosca com segmentos e 6 meses de barras');

  L.section('Passado');
  await page.$eval('#dashPrev', e => e.click()); await L.sleep(150);
  L.ok(/Mês passado/.test(await txt('#dashNavBadge')) && !(await page.$eval('#dashToday', el => el.hidden)), 'mês passado, com botão para voltar');
  L.ok(/R\$\s?250,00/.test(await txt('#donutWrap')) && /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/.test(await txt('#dashNavLabel')), 'rosca mostra o mês passado (250)');
  await page.$eval('#dashToday', e => e.click()); await L.sleep(150);
  L.ok(/Este mês/.test(await txt('#dashNavBadge')), '“Voltar para este mês” funciona');

  L.section('Futuro: previsão');
  await page.$eval('#dashNext', e => e.click()); await L.sleep(200);
  L.ok(/Previsão · próximo mês/.test(await txt('#dashNavBadge')), 'badge diz que é previsão');
  L.ok(/Moradia.*R\$\s?900,00/.test(await txt('#donutWrap')) && /Inclui R\$\s?900,00 de contas fixas que ainda vão cair/.test(await txt('#donutWrap')), 'a conta fixa (aluguel) entra na previsão do mês');
  L.ok(await page.$('#barWrap .bar-forecast') !== null && /previsão/.test(await txt('#barWrap .chart-note')), 'barras com parte hachurada (prevista)');
  L.ok(/ganhos R\$\s?600,00.*gastos R\$\s?900,00.*saldo.*-R\$\s?300,00|ganhos R\$\s?600,00.*gastos R\$\s?900,00/.test(await txt('#barWrap .chart-note')), 'resumo do mês: ganhos 600 (freela previsto), gastos 900');
  L.ok(/previsão/.test(await txt('#comparisonSummary')), 'comparação marca como previsão');
  await page.$eval('#dashNext', e => e.click()); await page.$eval('#dashNext', e => e.click()); await L.sleep(150);
  L.ok(/daqui a 3 meses/.test(await txt('#dashNavBadge')), 'dá para ir mais longe (daqui a 3 meses)');

  L.section('Barras clicáveis');
  await page.$eval('#dashToday', e => e.click()); await L.sleep(150);
  await page.$eval('#barWrap .bar-group[data-off="-3"]', g => g.dispatchEvent(new MouseEvent('click', {bubbles: true}))); await L.sleep(150);
  L.ok(/Há 3 meses/.test(await txt('#dashNavBadge')), 'tocar num mês das barras escolhe aquele mês');
  await page.$eval('#dashNext', e => e.click()); await page.$eval('#dashNext', e => e.click()); await page.$eval('#dashNext', e => e.click()); await L.sleep(100);
  L.ok(await page.$eval('#barWrap .bar-group.sel', g => g.getAttribute('data-off')) === '0', 'o mês escolhido fica marcado nas barras');

  L.section('Estilos do gráfico de categorias');
  const style = async name => { await page.$eval('[data-donut-style="' + name + '"]', el => el.click()); await L.sleep(150); };
  L.ok(await page.$eval('[data-donut-style="rosca"]', el => el.getAttribute('aria-pressed')) === 'true', 'rosca é o estilo de partida');
  await style('pizza');
  L.ok(await page.$$eval('#donutWrap .pie-slice', e => e.length) >= 2 && /\d+%/.test(await txt('#donutWrap .donut-svg')) && /Total\s*R\$/.test(await txt('#donutWrap .donut-total')), 'pizza: fatias cheias com a porcentagem e o total');
  const pop = await page.evaluate(() => { const g = document.querySelector('#donutWrap .pie-slice'); g.focus(); return getComputedStyle(g).transform; });
  L.ok(pop && pop !== 'none', 'a fatia em foco (ou com o mouse em cima) sai um pouco para fora');
  L.ok(await page.$eval('#donutWrap .pie-slice path', p => getComputedStyle(p).strokeWidth === '2px'), 'fatias separadas por um traço fino, igual da borda ao centro');
  await style('blocos');
  L.ok(await page.$$eval('#donutWrap .tm-block', e => e.length) >= 2 && await page.$$eval('#donutWrap .tm-block', e => e.every(b => b.tabIndex === 0 && b.dataset.tip)), 'blocos: um retângulo por categoria, com dica por teclado');
  const areas = await page.$$eval('#donutWrap .tm-block', e => e.map(b => b.getBoundingClientRect()).map(r => r.width * r.height));
  L.ok(areas[0] >= areas[areas.length - 1], 'o maior gasto ocupa o maior bloco');
  L.ok(/Moradia/.test(await txt('#donutWrap .cat-rank')), 'o ranking continua abaixo, em qualquer estilo');
  await L.reload(page); await L.tab(page, 'dashboard'); await L.dashSection(page, 'graficos');
  L.ok(await page.$eval('[data-donut-style="blocos"]', el => el.getAttribute('aria-pressed')) === 'true', 'o estilo escolhido é lembrado');
  await style('rosca');

  L.section('Tabela e celular');
  await page.click('[data-view-toggle="bar"]'); await L.sleep(150);
  L.ok(await page.$('#barWrap table.data-table') !== null, 'dá para ver como tabela');
  await page.click('[data-view-toggle="bar"]');
  await page.setViewport({width: 360, height: 760}); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');

  L.section('Categoria clicável');
  await page.click('#donutWrap li[data-cat-id="alimentacao"]'); await L.sleep(250);
  let mtxt = await L.text(page, '#modalRoot');
  L.ok(/Alimentação/.test(await L.modalTitle(page)) && /Mercado/.test(mtxt) && /R\$\s?400,00/.test(mtxt), 'tocar em Alimentação abre o que foi gasto nela (Mercado, 400)');
  await L.closeModal(page);
  await page.click('#donutWrap li[data-cat-id="moradia"]'); await L.sleep(250);
  mtxt = await L.text(page, '#modalRoot');
  L.ok(/Aluguel/.test(mtxt) && /conta fixa prevista/.test(mtxt), 'a conta fixa prevista aparece na categoria Moradia');
  await L.closeModal(page);
  L.ok(/Toque numa categoria/.test(await txt('#donutWrap')) && /contas fixas que ainda vão cair/.test(await txt('#donutWrap')), 'texto explica o que entra no gráfico (fixas previstas)');

});
