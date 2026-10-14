// Total × realmente meu: o que sai de verdade (inclusive o de outras pessoas) e a parte que é minha,
// com a mesma regra no resumo, nos quadros, no gráfico, na lista e nos tooltips.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Itaú', 5000, 3, 10);
  const card = (await L.db(page)).cards[0];
  const today = L.dayOffset(0);
  await L.patchDb(page, `
    u.accounts = [{id: 'a1', name: 'Nubank', initialBalance: 3000, baseDate: '2000-01-01', baseAt: 0, createdAt: 1}];
    const t = (id, o) => u.transactions.push(Object.assign({id, type: 'expense', category: 'lazer', date: arg.today, description: id, createdAt: 1}, o));
    t('salario', {type: 'income', amount: 1000, category: 'salario', paymentMethod: null, accountId: 'a1'});
    t('meu', {amount: 200, paymentMethod: 'conta', accountId: 'a1'});
    t('maria', {amount: 300, paymentMethod: 'conta', accountId: 'a1', forOther: {person: 'Maria', receivableId: 'r1'}});
    t('jantar', {amount: 400, category: 'alimentacao', paymentMethod: 'conta', accountId: 'a1', split: {total: 400, mine: 100, people: [{person: 'João', amount: 300}]}});
    // Fatura antiga e ainda não paga: 100 meus + 300 de outra pessoa (vence/venceu até este mês).
    t('c1', {amount: 100, date: arg.old, paymentMethod: 'cartao', cardId: arg.card});
    t('c2', {amount: 300, date: arg.old, paymentMethod: 'cartao', cardId: arg.card, forOther: {person: 'Maria', receivableId: 'r2'}});
  `, {today, old: L.dayOffset(-45), card: card.id});
  await L.tab(page, 'dashboard');
  await page.click('#dashDetailsBtn'); await L.sleep(250);
  const have = L.moneyOf((/você tem (R\$\s?[\d.,]+) nas contas/.exec(await L.text(page, '#monthStatus')) || [])[1]);
  L.ok(have === 3100, 'o resumo diz quanto há nas contas (3.000 + 1.000 − 900)');

  L.section('Resumo do mês');
  const status = await L.text(page, '#monthStatus');
  L.ok(/Saíram R\$\s?900,00, dos quais R\$\s?300,00 são realmente seus/.test(status), 'saíram 900 no total, dos quais 300 são realmente seus');
  L.ok(/Saldo do mês: R\$\s?2\.700,00 com a fatura total e R\$\s?3\.000,00 só com os seus gastos/.test(status), 'dois saldos: com a fatura total (3.100 − 400) e só com os seus gastos (3.100 − 100)');
  const tile = async l => page.evaluate(x => { const t = [...document.querySelectorAll('#statTiles .tile')].find(e => e.querySelector('.tile-lbl').textContent === x); return t ? {text: t.textContent.replace(/\s+/g, ' ').trim(), val: (t.querySelector('.tile-val') || {}).textContent || ''} : null; }, l);
  let g = await tile('Gastos do mês');
  L.ok(L.moneyOf(g.val) === 900 && /Seus\s*R\$\s?300,00/.test(g.text) && /De outras pessoas\s*R\$\s?600,00/.test(g.text), 'Gastos do mês: total 900, seus 300 e de outras pessoas 600');
  const f = await tile('Falta pagar');
  L.ok(L.moneyOf(f.val) === 400 && /Desse total, seu\s*R\$\s?100,00/.test(f.text), 'Falta pagar: o total da fatura (400) e quanto é seu (100)');
  const s = await tile('Saldo do mês');
  L.ok(/Com a fatura total\s*R\$\s?2\.700,00/.test(s.text) && /Só com os meus gastos\s*R\$\s?3\.000,00/.test(s.text), 'Saldo do mês: duas opções');
  const g1 = await tile('Ganhos do mês');
  L.ok(L.moneyOf(g1.val) === 1000 && /^Ganhos do mês\s*R\$\s?1\.000,00$/.test(g1.text), 'Ganhos do mês sem textos auxiliares');

  L.section('Gastos do mês (cartão do Início)');
  const c2 = '#summaryCards .sum-card:nth-child(2)';
  L.ok(L.moneyOf(await L.text(page, c2 + ' .sum-value')) === 900 && /Realmente seus: R\$\s?300,00/.test(await L.text(page, c2)) && /Falta pagar R\$\s?400,00 neste mês, dos quais R\$\s?100,00 são seus/.test(await L.text(page, c2)), 'o cartão traz o total, o que é realmente seu e o que falta pagar');
  await page.click('[data-sum-more="2"]'); await L.sleep(150);
  const heads = await page.$$eval('#sumD2 .bp-head [role=columnheader]', els => els.map(e => e.textContent));
  L.ok(heads.join('|') === 'Banco|Pago|Falta|Seu', 'tabela por banco: Banco, Pago, Falta, Seu');
  const rows = await page.$$eval('#sumD2 .bp-row', els => els.map(e => [...e.children].map(c => c.textContent.trim()).join(' | ')));
  L.ok(rows.some(r => /^Itaú \| R\$\s?0,00 \| R\$\s?400,00 \| R\$\s?100,00$/.test(r)) && rows.some(r => /^Nubank \| R\$\s?900,00 \| R\$\s?0,00 \| R\$\s?0,00$/.test(r)), 'por banco: Itaú falta 400 e 100 é seu; Nubank pagou 900');
  L.ok(/realmente sua/.test(await L.text(page, '#sumD2 .sum-explain')), 'explica o que significa “Seu”');
  await page.click('[data-sum-more="2"]'); await L.sleep(100);

  L.section('Gráfico por categoria: Tudo × Somente meus gastos');
  await page.$eval('#donutWrap', el => el.scrollIntoView({block: 'center'})); await L.sleep(200);
  L.ok(await page.$eval('[data-donut-scope="all"]', el => el.getAttribute('aria-pressed')) === 'true' && /R\$\s?900,00/.test(await L.text(page, '#donutWrap .donut-svg')), 'começa em “Tudo”: 900 no centro');
  await page.$eval('[data-donut-scope="mine"]', el => el.click()); await L.sleep(250);
  L.ok(await page.$eval('[data-donut-scope="mine"]', el => el.getAttribute('aria-pressed')) === 'true' && /R\$\s?300,00/.test(await L.text(page, '#donutWrap .donut-svg')) && /Seus gastos/.test(await L.text(page, '#donutWrap .donut-svg')), '“Somente meus gastos”: 300 no centro');
  const catTxt = await L.text(page, '#donutWrap .cat-rank');
  L.ok(/Lazer.*R\$\s?200,00/.test(catTxt) && /Alimentação.*R\$\s?100,00/.test(catTxt), 'categorias mudam: lazer 200 e alimentação 100');
  await page.$eval('[data-donut-scope="all"]', el => el.click()); await L.sleep(250);
  L.ok(/Alimentação.*R\$\s?400,00/.test(await L.text(page, '#donutWrap .cat-rank')), 'voltando a “Tudo”: alimentação 400');

  L.section('Tooltip claro e perto do ponteiro');
  // Um ponto em cima do anel, logo depois do topo (onde começa a maior categoria).
  const seg = await page.$eval('#donutWrap .donut-svg', el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width * 0.58, y: r.top + r.height * 0.1}; });
  await page.mouse.move(seg.x, seg.y); await L.sleep(150);
  const tip = await page.$eval('.chart-tooltip', el => { const r = el.getBoundingClientRect(); return {text: el.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth}; }).catch(() => null);
  L.ok(tip && /Total: R\$/.test(tip.text) && /Seus: R\$/.test(tip.text) && /De outras pessoas: R\$/.test(tip.text), 'o tooltip traz título, total, seus e de outras pessoas');
  L.ok(tip && tip.left >= 0 && tip.right <= tip.vw && Math.abs(tip.bottom - seg.y) < 90 || (tip && Math.abs(tip.top - seg.y) < 90), 'e aparece junto do ponteiro, dentro da tela');
  await page.mouse.move(5, 5);

  L.section('Legenda e frase do gráfico de barras');
  L.ok(/gastos R\$\s?900,00 \(seus R\$\s?300,00\)/.test(await L.text(page, '#barWrap .chart-note')) && /só com os seus gastos/.test(await L.text(page, '#barWrap .chart-note')), 'frase: gastos 900 (seus 300), saldo e saldo só com os seus gastos');

  L.section('Contas e cartões');
  await L.tab(page, 'cartoes');
  const ws = await L.text(page, '#walletSummary');
  L.ok(/Faturas a pagar\s*R\$\s?400,00\s*Desse total, seu: R\$\s?100,00/.test(ws) && /Sobra depois de pagar\s*R\$\s?2\.700,00\s*“/.test(ws), 'faturas a pagar: total 400 e quanto é seu; sobra 2.700 sem comentário');

  L.section('Lista de lançamentos');
  await L.tab(page, 'lancamentos');
  L.ok(/gastos R\$\s?900,00 \(seus R\$\s?300,00 · de outras pessoas R\$\s?600,00\)/.test(await L.text(page, '#txSummary')), 'resumo da lista: total, seus e de outras pessoas');

  L.section('Fatura paga em parte: a sua parte continua toda a pagar');
  const key = await page.evaluate(async (c, d) => { const {invoiceKeyFor} = await import('/js/domain/cards.js'); return invoiceKeyFor(d, c); }, card, L.dayOffset(-45));
  await L.patchDb(page, `u.cards[0].invoiceAdvances = {[arg.key]: [{id: 'ad1', amount: 350, date: arg.today}]};`, {key, today});
  await L.tab(page, 'dashboard'); await L.sleep(200);
  const f2 = await tile('Falta pagar');
  L.ok(L.moneyOf(f2.val) === 400 - 350 && /Desse total, seu\s*R\$\s?50,00/.test(f2.text), 'pagou 350 de 400: falta 50, e os 50 são seus (a sua parte de 100 limitada ao que falta)');
  await L.patchDb(page, `u.cards[0].invoiceAdvances = {[arg.key]: [{id: 'ad1', amount: 150, date: arg.today}]};`, {key, today});
  await L.tab(page, 'dashboard'); await L.sleep(200);
  const f3 = await tile('Falta pagar');
  L.ok(L.moneyOf(f3.val) === 250 && /Desse total, seu\s*R\$\s?100,00/.test(f3.text), 'pagou 150 de 400: falta 250, dos quais 100 são seus e 150 de outras pessoas');
  await L.patchDb(page, `u.cards[0].invoiceAdvances = {};`);

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  for (const t of ['dashboard', 'lancamentos', 'cartoes']){ await L.tab(page, t); await L.sleep(150); L.ok(await L.noHorizontalScroll(page), t + ' cabe na tela'); }
  await L.tab(page, 'lancamentos'); await L.sleep(150);
  const overlap = await page.$$eval('#txList .tx-row', rows => rows.some(r => {
    const a = r.querySelector('.tx-amount').getBoundingClientRect();
    return [...r.querySelectorAll('.tx-tag, .tx-name, .tx-meta')].some(e => { const b = e.getBoundingClientRect(); return b.width > 0 && !(b.right <= a.left + 1 || b.left >= a.right - 1 || b.bottom <= a.top + 1 || b.top >= a.bottom - 1); });
  }));
  L.ok(!overlap, 'no celular o valor não fica por cima do nome nem das etiquetas');
  L.ok(await page.$eval('#txSummary', el => getComputedStyle(el).hyphens) === 'manual', 'o resumo não corta palavras com hífen');

  L.section('Celular: menus e centralização');
  const centered = async sel => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) <= 3; });
  await L.tab(page, 'lancamentos'); await L.sleep(150);
  L.ok(await centered('.segmented.seg-wide'), '“Lançamentos | Contas fixas” fica centralizado');
  L.ok(await centered('.tx-views'), '“Lista | Calendário | Ano” fica centralizado');
  await L.tab(page, 'cartoes'); await L.sleep(150);
  L.ok(await page.$eval('.ws-box', el => getComputedStyle(el).textAlign) === 'center', 'as caixas do resumo de Contas e cartões têm o texto centralizado');
  await page.$eval('#bankList .card-menu > summary', el => el.click()); await L.sleep(200);
  const pop = await page.$eval('#bankList .card-menu[open] > .more-pop', el => { const r = el.getBoundingClientRect(); return {l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight}; });
  L.ok(pop.l >= 0 && pop.r <= pop.vw && pop.t >= 0 && pop.b <= pop.vh, 'o menu ⋯ da conta abre inteiro dentro da tela');
  await page.$eval('#bankList .card-menu[open] > summary', el => el.click());
  await page.$eval('#moreBtn', el => el.click()); await L.sleep(250);
  const items = await page.$$eval('.more-menu .more-item', els => els.map(e => getComputedStyle(e).textAlign + '/' + getComputedStyle(e).alignItems));
  L.ok(items.length > 6 && items.every(x => x === 'center/center'), 'os itens do “Mais” (inclusive tutorial e ajuda) têm o conteúdo centralizado');
});
