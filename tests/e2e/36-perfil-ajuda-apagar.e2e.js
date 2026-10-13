// Pergunta "teve gastos?" só depois do login; Ajuda e sugestões; Apagar dados (tudo ou por parte).
import * as L from './lib.js';

L.run(async ({page}) => {
  L.section('Pergunta ao entrar: só depois do login');
  const email = await L.signup(page, {welcome: true});
  await L.sleep(500);
  L.ok(await L.modalTitle(page) === 'Antes de começar…', 'logo depois do cadastro, pergunta');
  await L.closeModal(page);
  await L.reload(page); await L.sleep(600);
  L.ok(!(await L.modalOpen(page)), 'recarregar a página (conta já aberta) não pergunta de novo');
  await page.evaluate(async () => { (await import('/js/ui/shell.js')).logout(); });
  await L.sleep(200);
  await page.click('[data-action="go-login"]').catch(() => {});
  await page.type('#loginEmail', email); await page.type('#loginPassword', 'senha@123');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(600);
  L.ok(await L.modalTitle(page) === 'Antes de começar…', 'novo login: pergunta de novo (uma vez)');
  await L.closeModal(page);

  L.section('Ajuda e sugestões');
  await L.tab(page, 'perfil');
  await page.$eval('#pfIdea', el => el.click()); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Ajuda e sugestões' && await page.$eval('input[name=kind][value=melhoria]', el => el.checked), 'abre já em “sugestão de melhoria”');
  L.ok(/Abrir meu e-mail/.test(await L.text(page, '#modalRoot .modal-actions')) && /contato\.granaleve@gmail\.com/.test(await L.text(page, '#modalRoot')), 'sem servidor: oferece o e-mail do Grana Leve');
  await L.closeModal(page);
  // Conta online (simulada): envia pelo app.
  await page.evaluate(async () => { const {Store} = await import('/js/data/store.js'); window.__fb = []; Store.sendFeedback = async (kind, msg, pg) => { window.__fb.push([kind, msg, pg]); }; });
  await page.$eval('[data-help]', el => el.click()); await L.sleep(200);
  await L.submitModal(page);
  L.ok(/Escreva a sua mensagem/.test(await L.modalError(page)), 'mensagem vazia: pede para escrever');
  await page.type('#fbMsg', 'Como faço para dividir uma compra?');
  await L.submitModal(page); await L.sleep(300);
  const fb = await page.evaluate(() => window.__fb);
  L.ok(fb.length === 1 && fb[0][0] === 'ajuda' && /dividir uma compra/.test(fb[0][1]) && fb[0][2] === 'perfil', 'envia tipo, mensagem e a tela');
  L.ok(/Mensagem enviada!/.test(await L.text(page, '#modalRoot .fb-done')) && await page.$('#modalRoot textarea') === null, 'mostra a confirmação visual de envio no lugar do formulário');
  await L.sleep(2300);
  L.ok(!(await L.modalOpen(page)), 'fecha sozinho depois da confirmação');
  // Outra mensagem logo em seguida: o app pede um intervalo entre os envios.
  await page.$eval('[data-help]', el => el.click()); await L.sleep(200);
  await page.type('#fbMsg', 'Mais uma mensagem rápida');
  await L.submitModal(page);
  L.ok(/Aguarde \d+ segundos/.test(await L.modalError(page)) && (await page.evaluate(() => window.__fb)).length === 1, 'segunda mensagem em seguida: pede para aguardar e não envia');
  await L.closeModal(page);
  await page.evaluate(async () => { const {Store} = await import('/js/data/store.js'); delete Store.sendFeedback; });

  L.section('Apagar dados');
  await L.addCard(page, 'Nubank', 1000, 3, 10);
  const card = (await L.db(page)).cards[0];
  await L.addTx(page, {amount: 50, desc: 'Mercado', category: 'alimentacao'});
  await L.addTx(page, {amount: 80, desc: 'Roupa', category: 'compras', pay: 'card:' + card.id});
  await L.patchDb(page, `u.goals = [{id:'g1', name:'Viagem', target: 1000, saved: 100}]; u.debts = [{id:'d1', name:'Empréstimo', totalAmount: 500, paidAmount: 0}];`);
  await L.tab(page, 'perfil');
  await page.$eval('#pfClear', el => el.click()); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Apagar dados', 'abre “Apagar dados”');
  L.ok(/Ganhos e gastos\s*\(2\)/.test(await L.text(page, '#modalRoot')) && /Metas\s*\(1\)/.test(await L.text(page, '#modalRoot')), 'mostra quantos registros há em cada parte');
  L.ok(await page.$eval('input[name=grp][value=bills]', el => el.disabled), 'parte vazia não dá para marcar');
  await page.$eval('input[name=grp][value=tx]', el => el.click());
  await L.submitModal(page);
  L.ok(/Digite APAGAR/.test(await L.modalError(page)), 'pede para digitar APAGAR');
  await page.type('#clrConfirm', 'apagar');
  await L.submitModal(page); await L.sleep(400);
  let d = await L.db(page);
  L.ok(d.transactions.length === 0 && d.cards.length === 1 && d.goals.length === 1 && d.debts.length === 1, 'apaga só os lançamentos (cartão, meta e dívida ficam)');
  await page.$eval('#pfClear', el => el.click()); await L.sleep(200);
  await page.$eval('#clrAll', el => el.click());
  L.ok(await page.$$eval('input[name=grp]:not(:disabled)', els => els.every(e => e.checked)), '“Apagar tudo” marca todas as partes');
  await page.type('#clrConfirm', 'APAGAR');
  await L.submitModal(page); await L.sleep(400);
  d = await L.db(page);
  L.ok(!d.cards.length && !d.goals.length && !d.debts.length && !d.accounts.length, 'apaga tudo');
  L.ok(/Tudo apagado/.test(await L.allToasts(page)) && await page.$eval('#viewApp', el => !el.hidden), 'a conta continua aberta para recomeçar');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await page.$eval('#pfClear', el => el.click()); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), '“Apagar dados” cabe na tela');
  await L.closeModal(page);
});
