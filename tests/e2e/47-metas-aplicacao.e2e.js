// Metas: tipo de aplicação (CDB, poupança...) e taxa atualizada pelo Banco Central (API simulada).
import * as L from './lib.js';

L.run(async ({page}) => {
  let bcbOnline = true, bcbCalls = 0;
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (!/api\.bcb\.gov\.br/.test(req.url())) return req.continue();
    bcbCalls++;
    if (!bcbOnline) return req.abort('internetdisconnected');
    const serie = /sgs\.(\d+)/.exec(req.url())[1];
    const valor = {4389: '14.15', 432: '14.25', 13522: '5.00'}[serie];
    req.respond({status: 200, headers: {'Access-Control-Allow-Origin': '*', 'content-type': 'application/json'}, body: JSON.stringify([{data: '10/10/2026', valor}])});
  });
  await L.signup(page);
  await L.tab(page, 'metas');

  L.section('Escolher a aplicação');
  L.ok(!(await page.$eval('#goalYield', el => el.closest('[data-inv-part]').hidden)), 'sem tipo, dá para digitar a taxa (como antes)');
  await page.$eval('#goalInvMore', d => { d.open = true; }); await L.setVal(page, '#goalInvType', 'cdb'); await L.sleep(300);
  L.ok(!(await page.$eval('#goalInvPct', el => el.closest('[data-inv-part]').hidden)) && await page.$eval('#goalYield', el => el.closest('[data-inv-part]').hidden), 'CDB pede o % do CDI (e esconde a taxa digitada)');
  await page.type('#goalInvPct', '110'); await L.sleep(100);
  L.ok(/cerca de 15,57% ao ano \(antes do IR\), com índices do Banco Central de 10\/10\/2026/.test(await L.text(page, '#goalForm [data-inv-preview]')), 'mostra a taxa de hoje: 110% de 14,15% (CDI do Banco Central)');
  L.ok(await page.$eval('#goalInvAuto', el => el.checked), '“atualizar sozinho” vem marcado');
  await page.type('#goalName', 'Reserva');
  await page.type('#goalTarget', '10.000');
  await page.click('#goalForm button[type=submit]'); await L.sleep(300);
  let g = (await L.db(page)).goals.find(x => x.name === 'Reserva');
  L.ok(g.investment.type === 'cdb' && g.investment.pct === 110 && g.investment.auto === true && g.yieldRate === 15.57 && g.rateDate === '2026-10-10', 'grava o tipo, o % do CDI e a taxa calculada');
  const card = '#goalGrid .goal-card';
  L.ok(/CDB 110% do CDI · cerca de 15,57% ao ano · taxa do Banco Central de 10\/10\/2026/.test(await L.text(page, card)), 'o cartão diz onde está e quanto rende');

  L.section('Poupança e Tesouro IPCA+');
  await L.menuAction(page, card + ' [data-goal-edit]'); await L.sleep(250);
  await L.setVal(page, '#egInvType', 'poupanca'); await L.sleep(100);
  L.ok(/cerca de 6,17% ao ano/.test(await L.text(page, '#modalRoot [data-inv-preview]')), 'poupança com Selic acima de 8,5%: 0,5% ao mês');
  await L.setVal(page, '#egInvType', 'ipca'); await L.sleep(100);
  await page.$eval('#egInvSpread', el => { el.value = ''; }); await page.type('#egInvSpread', '6');
  L.ok(/cerca de 11,3% ao ano/.test(await L.text(page, '#modalRoot [data-inv-preview]')), 'IPCA+ 6%: (1,05 × 1,06) − 1');
  await L.submitModal(page); await L.sleep(250);
  g = (await L.db(page)).goals.find(x => x.name === 'Reserva');
  L.ok(g.investment.type === 'ipca' && g.yieldRate === 11.3, 'troca o tipo e recalcula');

  L.section('Atualiza sozinho e funciona sem internet');
  await L.patchDb(page, `u.goals[0].yieldRate = 9; u.goals[0].rateDate = '2026-01-01';`);
  await page.evaluate(() => localStorage.removeItem('granaleve_rates_v1'));
  await L.reload(page); await L.tab(page, 'metas'); await L.sleep(400);
  g = (await L.db(page)).goals.find(x => x.name === 'Reserva');
  L.ok(g.yieldRate === 11.3 && g.rateDate === '2026-10-10', 'ao abrir Metas, a taxa antiga é atualizada com os índices de hoje');
  bcbOnline = false;
  await page.evaluate(() => localStorage.removeItem('granaleve_rates_v1'));
  await L.menuAction(page, card + ' [data-goal-edit]'); await L.sleep(400);
  L.ok(/valores de referência/.test(await L.text(page, '#modalRoot [data-inv-preview]')), 'sem internet: usa valores de referência e avisa');
  await L.closeModal(page);
  L.ok(bcbCalls >= 3, 'buscou CDI, Selic e IPCA no Banco Central');
});
