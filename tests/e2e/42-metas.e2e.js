// Metas: guardar com data, rendimento, retirada e previsões explicadas.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'metas');
  const deadline = L.plusMonths(L.dayOffset(0), 12);

  L.section('Criar meta com rendimento');
  await page.type('#goalName', 'Viagem');
  await page.type('#goalTarget', '5.000');
  await L.setVal(page, '#goalDate', deadline);
  await page.$eval('#goalInvMore', d => { d.open = true; });
  await page.type('#goalYield', '10');
  await page.click('#goalForm button[type=submit]'); await L.sleep(250);
  let g = (await L.db(page)).goals.find(x => x.name === 'Viagem');
  L.ok(g && g.targetAmount === 5000 && g.yieldRate === 10 && Array.isArray(g.moves), 'meta criada com alvo de R$ 5.000 e 10% ao ano');
  const card = '#goalGrid .goal-card';
  let txt = await L.text(page, card);
  L.ok(/guarde cerca de R\$\s?[\d.]+,\d\d por mês/.test(txt) && /12 meses/.test(txt), 'diz quanto guardar por mês para chegar no prazo');
  L.ok(/Registre o que guardar/.test(txt), 'sem depósitos, explica como ter a previsão pelo ritmo');

  L.section('Guardar, render e retirar ficam no histórico');
  await page.type(card + ' [data-goal-deposit] input[name=amount]', '500');
  await page.click(card + ' [data-goal-deposit] button'); await L.sleep(250);
  txt = await L.text(page, card);
  L.ok(/R\$\s?500,00 de R\$\s?5\.000,00/.test(txt), 'guardou R$ 500');
  L.ok(/No seu ritmo \(R\$\s?500,00\/mês neste mês\)/.test(txt), 'mostra o ritmo');
  await L.menuAction(page, card + ' [data-goal-yield]'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Registrar rendimento', 'menu ⋯ → Registrar rendimento');
  await page.type('#askAmount', '25');
  await L.submitModal(page); await L.sleep(250);
  txt = await L.text(page, card);
  L.ok(/Rendeu R\$\s?25,00 \(5% sobre o que você guardou\) · taxa de 10% ao ano/.test(txt), 'rendimento aparece com o percentual sobre o guardado');
  await L.menuAction(page, card + ' [data-goal-withdraw]'); await L.sleep(150);
  await page.type('#gwAmount', '1.000');
  await L.submitModal(page); await L.sleep(150);
  L.ok(/não pode passar de R\$\s?525,00/.test(await L.modalError(page)), 'não deixa retirar mais do que tem');
  await page.$eval('#gwAmount', el => { el.value = ''; }); await page.type('#gwAmount', '100');
  await L.submitModal(page); await L.sleep(250);
  g = (await L.db(page)).goals.find(x => x.name === 'Viagem');
  L.ok(g.currentAmount === 425 && g.moves.map(m => m.kind).join(',') === 'deposit,yield,withdraw', 'saldo 425 e as três movimentações com data');
  await L.menuAction(page, card + ' [data-goal-withdraw]'); await L.sleep(150);
  await page.type('#gwAmount', '25');
  await page.click('input[name=purpose][value=outro]'); await L.sleep(150);
  L.ok(/Cuidado.*usando R\$\s?25,00 do que guardou para “Viagem” em outra coisa/.test(await L.text(page, '#gwWarn')), 'retirar para outra coisa mostra o aviso de cuidado');
  await L.submitModal(page); await L.sleep(250);
  g = (await L.db(page)).goals.find(x => x.name === 'Viagem');
  L.ok(g.currentAmount === 400 && g.moves[g.moves.length - 1].purpose === 'outro', 'a retirada fica marcada como “para outra coisa”');
  await page.$eval(card + ' details.pay-log', d => { d.open = true; });
  L.ok(/fora do objetivo/.test(await L.text(page, card + ' .pay-log')), 'e o histórico mostra que foi fora do objetivo');
  L.ok(/Movimentações \(4\)/.test(await L.text(page, card)) && /Retirada/.test(await L.text(page, card + ' .pay-log')), 'histórico de movimentações no cartão');
  await page.$eval(card + ' .goal-forecast details', d => { d.open = true; });
  L.ok(/juros compostos/.test(await L.text(page, card + ' .goal-forecast')), '“Como calculamos” explica a conta');

  L.section('Editar a taxa');
  await L.menuAction(page, card + ' [data-goal-edit]'); await L.sleep(150);
  await page.$eval('#egYield', el => { el.value = ''; }); await page.type('#egYield', '6,5');
  await L.submitModal(page); await L.sleep(250);
  L.ok((await L.db(page)).goals.find(x => x.name === 'Viagem').yieldRate === 6.5, '“6,5” vira 6,5% ao ano');
  await L.menuAction(page, card + ' [data-goal-edit]'); await L.sleep(150);
  await page.$eval('#egYield', el => { el.value = ''; }); await page.type('#egYield', '150');
  await L.submitModal(page); await L.sleep(150);
  L.ok(/vai de 0 a 100/.test(await L.modalError(page)), 'taxa fora de 0–100 é recusada');
  await L.closeModal(page);

  L.section('Meta sem prazo e meta antiga');
  await L.patchDb(page, `u.goals.push({id: 'g2', name: 'Reserva', targetAmount: 1200, currentAmount: 200, targetDate: null, urgency: 'media', deletedAt: null, createdAt: 1,
    moves: [{id: 'm1', date: arg, amount: 200, kind: 'deposit'}]});
    u.goals.push({id: 'g3', name: 'Antiga', targetAmount: 1000, currentAmount: 300, targetDate: null, urgency: 'baixa', deletedAt: null, createdAt: 1});`, L.dayOffset(0));
  await L.tab(page, 'metas');
  const cardOf = async name => page.$$eval('#goalGrid .goal-card', (cs, n) => (cs.find(c => c.querySelector('h4').textContent === n) || {}).textContent || '', name);
  L.ok(/você chega lá por volta de [a-zç]{3}\/\d{4} \(em 5 meses\)/.test((await cardOf('Reserva')).replace(/\s+/g, ' ')), 'sem prazo: diz quando chega no ritmo atual (R$ 200/mês → mais 5 meses)');
  L.ok(/Registre o que guardar/.test(await cardOf('Antiga')), 'meta antiga, sem datas: pede para usar “Guardar”');

  L.section('Meta sem valor alvo (só juntar)');
  await page.setViewport({width: 1280, height: 900});
  await L.tab(page, 'metas');
  await page.type('#goalName', 'Sobras');
  await page.click('#goalNoTarget'); await L.sleep(100);
  L.ok(await page.$eval('#goalTargetField', e => e.hidden), 'marcar “Sem valor alvo” esconde o campo do valor');
  await page.click('#goalForm button[type=submit]'); await L.sleep(250);
  const open = (await L.db(page)).goals.find(x => x.name === 'Sobras');
  L.ok(open && open.targetAmount === 0, 'meta criada sem valor alvo');
  L.ok(/sem valor alvo/.test((await cardOf('Sobras')).toLowerCase()), 'o cartão diz que não tem valor alvo');
  const idx = await page.$$eval('#goalGrid .goal-card', cs => cs.findIndex(c => c.querySelector('h4').textContent === 'Sobras'));
  const sel = `#goalGrid .goal-card:nth-child(${idx + 1})`;
  await page.type(sel + ' [data-goal-deposit] input[name=amount]', '80');
  await page.click(sel + ' [data-goal-deposit] button'); await L.sleep(250);
  const t = await cardOf('Sobras');
  L.ok(/R\$\s?80,00 guardados/.test(t) && !/concluída/.test(t), 'guardar não conclui a meta e mostra o total juntado');
  L.ok(!(await L.db(page)).goals.find(x => x.name === 'Sobras').deleted, 'continua em andamento');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
  await page.setViewport({width: 1280, height: 900});
});
