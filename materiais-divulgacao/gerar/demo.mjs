// Monta uma conta de demonstração (modo local, só no navegador do robô) com dados realistas
// para tirar capturas e gravar o vídeo. Nada disso vai para o Supabase.
import * as L from '../../tests/e2e/lib.js';

export const PORT = 5510;

export async function abrir({largura = 390, altura = 844, escala = 2} = {}){
  const {startServer} = await import('../../tests/e2e/server.js');
  const server = await startServer(PORT);
  const {browser, page, errors} = await L.launch();
  await page.setViewport({width: largura, height: altura, deviceScaleFactor: escala, isMobile: largura < 700, hasTouch: largura < 700});
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);
  // Taxas do Banco Central: valores fixos para a demonstração (CDI 14,15%).
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (!/api\.bcb\.gov\.br/.test(req.url())) return req.continue();
    const serie = /sgs\.(\d+)/.exec(req.url())[1];
    const valor = {4389: '14.15', 432: '14.25', 13522: '4.60'}[serie];
    req.respond({status: 200, headers: {'Access-Control-Allow-Origin': '*', 'content-type': 'application/json'}, body: JSON.stringify([{data: '10/10/2026', valor}])});
  });
  return {browser, page, errors, server};
}

const iso = (off, dia) => { const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth() + off, dia); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// Faturas de meses anteriores à aberta, já pagas (a demonstração não deve começar com atrasos).
function chavesPagas(card){
  const h = new Date(), abre = h.getDate() >= Number(card.closingDay) ? 1 : 0, out = [];
  for (let o = -7; o < abre; o++){ const d = new Date(h.getFullYear(), h.getMonth() + o, 1); out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  return out;
}
export async function montarDemo(page){
  // Monta no layout de computador (no celular o formulário de lançamento fica atrás de um botão).
  const vp = page.viewport(); await page.setViewport({width: 1280, height: 900});
  const email = 'marina' + Date.now() + '@exemplo.com';
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.evaluate((key) => localStorage.setItem('granaleve_prefs_' + key, JSON.stringify({quickEntryOff: true, backupSnoozeUntil: Date.now() + 9e11})), email);
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-action="go-signup"]');
  await page.click('[data-action="go-signup"]');
  await page.type('#signupName', 'Marina Souza'); await page.type('#signupEmail', email); await page.type('#signupPassword', 'senha@123');
  await L.acceptTerms(page);
  if (await page.$('#signupStorageOk')) await page.click('#signupStorageOk');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(300);
  // Banco com conta e cartão.
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '3.840');
  await page.$eval('#bankHasCard', el => { if (!el.checked) el.click(); });
  await page.type('#cardLimit', '4.500'); await page.type('#cardClosing', '20'); await page.type('#cardDue', '28');
  await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  const d = await L.db(page);
  const acc = d.accounts[0], card = d.cards[0];
  await L.patchDb(page, `
    var A = arg.acc, C = arg.card, iso = arg.iso, id = 0, tx = [];
    function add(t){ t.id = 'demo' + (id++); t.createdAt = 1; tx.push(t); }
    for (var o = -5; o <= 0; o++){
      add({type:'income', amount:4200, category:'salario', date: iso[o + 5][0], description:'Salário', accountId:A});
      if (o % 2 === 0) add({type:'income', amount:600, category:'freelance', date: iso[o + 5][1], description:'Freela de design', accountId:A});
      add({type:'expense', amount:900, category:'moradia', date: iso[o + 5][2], description:'Aluguel', paymentMethod:'conta', accountId:A});
      add({type:'expense', amount:380 + (o * 17 % 60), category:'alimentacao', date: iso[o + 5][3], description:'Mercado do mês', paymentMethod:'cartao', cardId:C});
      add({type:'expense', amount:96 + (o * 11 % 30), category:'alimentacao', date: iso[o + 5][4], description:'Feira', paymentMethod:'conta', accountId:A});
      add({type:'expense', amount:170 + (o * 13 % 40), category:'transporte', date: iso[o + 5][5], description:'Uber e ônibus', paymentMethod:'cartao', cardId:C});
      add({type:'expense', amount:210 + (o * 19 % 80), category:'lazer', date: iso[o + 5][6], description:'Cinema e jantar', paymentMethod:'cartao', cardId:C});
      add({type:'expense', amount:115, category:'saude', date: iso[o + 5][7], description:'Farmácia', paymentMethod:'conta', accountId:A});
      add({type:'expense', amount:149, category:'educacao', date: iso[o + 5][8], description:'Curso de inglês', paymentMethod:'conta', accountId:A});
    }
    u.transactions = tx;
    var cd = u.cards[0]; cd.paidInvoices = arg.pagas;
  `, {acc: acc.id, card: card.id, pagas: chavesPagas(card), iso: [-5, -4, -3, -2, -1, 0].map(o => [iso(o, 5), iso(o, 15), iso(o, 5), iso(o, 8), iso(o, 4), iso(o, 6), iso(o, 7), iso(o, 3), iso(o, 2)].map(x => x > iso(0, new Date().getDate()) ? iso(0, 1) : x))});
  // Planejamento do mês, digitado como a pessoa faria.
  await L.tab(page, 'limites');
  for (const [cat, v] of [['moradia', '950'], ['alimentacao', '600'], ['lazer', '280'], ['transporte', '220'], ['educacao', '160'], ['saude', '150']]){
    await page.$eval('[data-budget-cat="' + cat + '"]', (el, val) => { el.value = val; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, v);
    await L.sleep(150);
  }
  // Compra dividida (feita pela interface, como a pessoa faria).
  await L.tab(page, 'lancamentos');
  await page.type('#txAmount', '180'); await page.type('#txDesc', 'Ingressos do show');
  await L.setVal(page, '#txPayment', 'card:' + card.id);
  await page.click('#txForOtherField summary'); await page.click('#txSplit'); await L.sleep(100);
  await page.type('#txSplitRows .split-row:nth-child(1) .sp-name', 'Carlos'); await page.type('#txSplitRows .split-row:nth-child(1) .sp-val', '90');
  await page.click('#txForm button[type=submit]'); await L.sleep(300);
  // Avisos do planejamento (pop-up) podem abrir depois do gasto: fecha para não bloquear a tela.
  await L.sleep(1800);
  for (let i = 0; i < 4 && await L.modalOpen(page); i++){ await L.closeModal(page); await L.sleep(500); }
  // Meta com rendimento (CDB 110% do CDI).
  await L.tab(page, 'metas'); await L.sleep(1500);   // espera as telas terminarem de se redesenhar (senão o formulário é limpo no meio da digitação)
  await page.$eval('#goalInvMore', d => { d.open = true; }); await L.setVal(page, '#goalInvType', 'cdb'); await L.sleep(250);
  await page.type('#goalInvPct', '110');
  await page.type('#goalName', 'Reserva de emergência'); await page.type('#goalTarget', '12.000');
  await page.click('#goalForm button[type=submit]'); await L.sleep(300);
  await L.patchDb(page, `
    var g = u.goals[0], m = [];
    arg.datas.forEach(function(x, i){ m.push({id:'dep' + i, date:x, amount:800, kind:'deposit'}); });
    m.push({id:'y1', date: arg.datas[arg.datas.length - 1], amount: 212.4, kind:'yield'});
    g.moves = m; g.currentAmount = 4212.4; g.targetDate = arg.futuro;`, {datas: [-4, -3, -2, -1, 0].map(o => iso(o, 6 - (o === 0 ? 3 : 0))), futuro: iso(9, 10)});
  // Segunda meta, na poupança (opcional para a demonstração: se a tela não estiver pronta, segue sem ela).
  try {
    await L.tab(page, 'metas'); await L.sleep(1200);
    await page.type('#goalName', 'Viagem para o Nordeste'); await page.type('#goalTarget', '5.000');
    await L.setVal(page, '#goalInvType', 'poupanca'); await L.sleep(250);
    await page.click('#goalForm button[type=submit]'); await L.sleep(300);
    await L.patchDb(page, `
      var g = u.goals.filter(function(x){ return /Viagem/.test(x.name); })[0];
      g.moves = [{id:'v1', date: arg.a, amount: 450, kind:'deposit'}, {id:'v2', date: arg.b, amount: 450, kind:'deposit'}, {id:'v3', date: arg.c, amount: 450, kind:'deposit'}, {id:'v4', date: arg.c, amount: 12.9, kind:'yield'}];
      g.currentAmount = 1362.9; g.targetDate = arg.d;`, {a: iso(-3, 8), b: iso(-2, 8), c: iso(-1, 8), d: iso(7, 15)});
  } catch (e){ console.log('segunda meta pulada:', e.message.slice(0, 60)); }
  await page.setViewport(vp);
  return {email, acc, card};
}
