// Início com 3 cartões e +, menu lateral / barra inferior / Mais, urgência e categorias com emoji.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const card = n => '#summaryCards .sum-card:nth-child(' + n + ')';

  L.section('Início: só 3 informações, detalhes no +');
  const titles = await page.$$eval('#summaryCards .sum-card h3', els => els.map(e => e.textContent));
  L.ok(titles.join('|') === 'Quanto tenho|Gastos do mês|Próximo compromisso', 'três cartões: Quanto tenho, Gastos do mês, Próximo compromisso');
  L.ok(await page.$eval('#dashDetails', el => el.hidden), 'gráficos e quadros ficam recolhidos');
  L.ok(/Nada pendente/.test(await L.text(page, card(3))), 'sem compromissos: “Nada pendente”');
  await page.click('#dashDetailsBtn');
  L.ok(!(await page.$eval('#dashDetails', el => el.hidden)) && await page.$eval('#dashDetailsBtn', el => el.getAttribute('aria-expanded')) === 'true', '“Ver todos os detalhes do mês” abre os detalhes');
  L.ok(/Esconder detalhes/.test(await L.text(page, '#dashDetailsBtn')), 'botão passa a “Esconder detalhes”');
  await page.click('#dashDetailsBtn');

  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1000'); await page.click('#accountForm button[type=submit]'); await L.sleep(150);
  await L.tab(page, 'limites');
  await L.setVal(page, '[data-budget-cat="alimentacao"]', '400'); await L.setVal(page, '[data-budget-cat="transporte"]', '100'); await L.sleep(150);
  await L.addTx(page, {amount: 200, category: 'alimentacao', desc: 'Mercado'});
  await L.addTx(page, {amount: 50, category: 'transporte', desc: 'Uber'});
  await L.addTx(page, {amount: 30, category: 'lazer', desc: 'Cinema'});
  await L.tab(page, 'dashboard');
  L.ok(L.moneyOf(await L.text(page, card(1) + ' .sum-value')) === 720 && /Disponível hoje em 1 conta/.test(await L.text(page, card(1))), 'Quanto tenho = saldo das contas (720)');
  L.ok(L.moneyOf(await L.text(page, card(2) + ' .sum-value')) === 280 && /70% de R\$\s?400,00|56% de R\$\s?500,00/.test(await L.text(page, card(2))), 'Gastos do mês comparados com o planejado (56% de 500)');
  L.ok(await page.$(card(2) + ' .progress') !== null, 'barra do planejado aparece');
  await page.click('[data-sum-more="2"]'); await L.sleep(80);
  L.ok(await page.$eval('[data-sum-more="2"]', el => el.getAttribute('aria-expanded')) === 'true' && !(await page.$eval('#sumD2', el => el.hidden)), '+ abre os detalhes do cartão');
  L.ok(await page.evaluate(() => document.activeElement.getAttribute('data-sum-more')) === '2', 'foco continua no +');
  const top = await page.$$eval('#sumD2 .sum-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  L.ok(/Alimentação/.test(top[0]) && /🍽️/.test(top[0]) && /Transporte/.test(top[1]), 'mostra onde mais gastou, com emoji, do maior para o menor');
  await page.click('[data-sum-more="1"]'); await L.sleep(80);
  L.ok(/Nubank\s*R\$\s?720,00/.test(await L.text(page, '#sumD1')), 'detalhe de Quanto tenho lista as contas');
  await page.click('#sumD1 [data-go]'); await L.sleep(120);
  L.ok(!(await page.$eval('#tab-cartoes', el => el.hidden)), 'link do detalhe leva à área certa');

  L.section('Urgência em dívidas, a receber e metas');
  await L.tab(page, 'dividas');
  L.ok(await page.$eval('#debtUrgency', el => el.value) === 'media', 'nova dívida começa com urgência média');
  await page.type('#debtName', 'Cartão atrasado'); await page.type('#debtTotal', '900'); await page.type('#debtInstallment', '300');
  await page.click('#debtForm button[type=submit]'); await L.sleep(200);
  await page.type('#debtName', 'Empréstimo da tia'); await page.type('#debtTotal', '500');
  await L.setVal(page, '#debtUrgency', 'baixa');
  await page.click('#debtForm button[type=submit]'); await L.sleep(200);
  L.ok(await page.$eval('#debtUrgency', el => el.value) === 'media', 'depois de salvar, a urgência volta para média');
  let d = await L.db(page);
  const atrasado = d.debts.find(x => x.name === 'Cartão atrasado');
  L.ok(atrasado.urgency === 'media' && d.debts.find(x => x.name === 'Empréstimo da tia').urgency === 'baixa', 'urgência salva');
  await L.setVal(page, '[data-urgency="debts:' + atrasado.id + '"]', 'alta'); await L.sleep(200);
  d = await L.db(page);
  L.ok(d.debts.find(x => x.id === atrasado.id).urgency === 'alta', 'urgência muda direto no card');
  L.ok(/agora é alta/.test(await L.lastToast(page)), 'toast confirma a mudança');
  const order = await page.$$eval('#debtGrid .debt-card h4', els => els.map(e => e.textContent));
  L.ok(order[0] === 'Cartão atrasado' && order[order.length - 1] === 'Empréstimo da tia', 'mais urgente primeiro, menos urgente por último');
  L.ok(await page.$eval('[data-urgency="debts:' + atrasado.id + '"]', el => el.classList.contains('u-alta')), 'urgência alta fica destacada');
  await L.tab(page, 'dashboard');
  L.ok(/Cartão atrasado/.test(await L.text(page, card(3))) && /urgente/.test(await L.text(page, card(3))) && L.moneyOf(await L.text(page, card(3) + ' .sum-value')) === 300, 'Próximo compromisso mostra a dívida urgente (parcela de 300)');

  await L.tab(page, 'receber');
  await page.type('#recvPerson', 'Maria'); await page.type('#recvTotal', '100'); await L.setVal(page, '#recvUrgency', 'baixa');
  await page.click('#recvForm button[type=submit]'); await L.sleep(200);
  await page.type('#recvPerson', 'João'); await page.type('#recvTotal', '80'); await L.setVal(page, '#recvUrgency', 'alta');
  await page.click('#recvForm button[type=submit]'); await L.sleep(200);
  L.ok((await page.$$eval('#recvGrid .debt-card h4', els => els.map(e => e.textContent)))[0] === 'João', 'a receber: urgente primeiro');

  await L.tab(page, 'metas');
  await page.type('#goalName', 'Viagem'); await page.type('#goalTarget', '3000');
  await page.click('#goalForm button[type=submit]'); await L.sleep(200);
  await page.type('#goalName', 'Reserva de emergência'); await page.type('#goalTarget', '5000'); await L.setVal(page, '#goalUrgency', 'alta');
  await page.click('#goalForm button[type=submit]'); await L.sleep(200);
  L.ok((await page.$$eval('#goalGrid .goal-card h4', els => els.map(e => e.textContent)))[0] === 'Reserva de emergência', 'metas: urgente primeiro');
  d = await L.db(page);
  const viagem = d.goals.find(g => g.name === 'Viagem');
  await page.click('[data-goal-edit="' + viagem.id + '"]'); await L.sleep(150);
  L.ok(await page.$eval('#egUrgency', el => el.value) === 'media', 'editar meta mostra a urgência');
  await L.setVal(page, '#egUrgency', 'alta');
  await L.submitModal(page);
  L.ok((await L.db(page)).goals.find(g => g.id === viagem.id).urgency === 'alta', 'editar meta salva a urgência');

  L.section('Celular: barra inferior e “Mais”');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'dashboard');
  L.ok(await page.$eval('.sidenav', el => getComputedStyle(el).display) === 'none', 'menu lateral some no celular');
  const items = await page.$$eval('#bottomnav > *', els => els.map(e => (e.textContent || e.getAttribute('aria-label')).trim()));
  L.ok(items.join('|') === 'Início|Ganhos e gastos|Lançar gasto ou ganho|Planejar|Mais' || items.join('|') === 'Início|Ganhos e gastos||Planejar|Mais', 'barra: Início, Ganhos e gastos, +, Planejar, Mais');
  await page.click('#bottomnav [data-tab="limites"]'); await L.sleep(120);
  L.ok(!(await page.$eval('#tab-limites', el => el.hidden)) && await page.$eval('#bottomnav [data-tab="limites"]', el => el.classList.contains('active')), 'barra abre Planejar e marca o item');
  await page.click('#moreBtn'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Mais', '“Mais” abre as outras áreas');
  L.ok(/Contas e cartões.*Metas.*Compromissos.*Aprenda.*Conexões.*Seus dados e backup/.test(await L.text(page, '.more-menu')), 'lista Contas, Metas, Compromissos, Aprenda, Conexões e Seus dados');
  await page.click('[data-more="metas"]'); await L.sleep(150);
  L.ok(!(await L.modalOpen(page)) && !(await page.$eval('#tab-metas', el => el.hidden)), 'escolher no “Mais” abre a área');
  L.ok(await page.$eval('#moreBtn', el => el.classList.contains('active')), '“Mais” fica marcado quando a área está nele');
  await page.click('#fabAdd'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Novo lançamento', '+ do centro abre o lançamento');
  await L.closeModal(page);
  for (const t of ['dashboard', 'dividas', 'receber', 'metas']){ await L.tab(page, t); L.ok(await L.noHorizontalScroll(page), t + ' cabe na tela'); }
  await page.click('#bottomnav [data-tab="dashboard"]'); await L.sleep(100);
  await page.click('[data-sum-more="3"]'); await L.sleep(80);
  L.ok(await L.noHorizontalScroll(page), 'cartão aberto cabe na tela');
});
