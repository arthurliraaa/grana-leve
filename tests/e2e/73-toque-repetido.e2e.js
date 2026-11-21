// Toque repetido não grava de novo: com a internet lenta (gravação demorada), tocar em “Salvar” várias vezes cria um lançamento só.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  // Deixa a gravação lenta (como numa conexão ruim): o app conta as gravações em andamento em Store.inflight.
  await page.evaluate(async () => {
    const {Store} = await import('/js/data/store.js');
    for (const nome of ['add', 'addMany']){
      const orig = Store[nome];
      Store[nome] = async function(...a){ Store.inflight++; try { await new Promise(r => setTimeout(r, 1100)); return await orig.apply(Store, a); } finally { Store.inflight--; } };
    }
  });
  const quantos = async desc => (await L.db(page)).transactions.filter(t => t.description === desc).length;
  await L.tab(page, 'lancamentos'); await L.sleep(300);

  L.section('Formulário de gasto');
  await page.type('#txAmount', '25'); await page.type('#txDesc', 'Padaria');
  await page.click('#txForm button[type=submit]');
  await L.sleep(250);
  L.ok(await page.$eval('#txForm button[type=submit]', b => b.classList.contains('is-busy') && b.disabled), 'enquanto salva, o botão mostra que está salvando e não aceita outro toque');
  await page.$eval('#txForm', f => f.requestSubmit());
  await page.$eval('#txForm', f => f.requestSubmit());
  await L.sleep(2200);
  L.ok(await quantos('Padaria') === 1, 'três envios seguidos gravam um lançamento só (' + await quantos('Padaria') + ')');
  L.ok(await page.$eval('#txForm button[type=submit]', b => !b.classList.contains('is-busy') && !b.disabled), 'depois de gravar, o botão volta ao normal');

  L.section('Um novo lançamento depois funciona');
  await page.type('#txAmount', '12'); await page.type('#txDesc', 'Café');
  await page.click('#txForm button[type=submit]'); await L.sleep(2000);
  L.ok(await quantos('Café') === 1, 'o próximo lançamento grava normalmente');

  L.section('Botões fora de formulário');
  await page.evaluate(() => { window.__cliques = 0; document.body.insertAdjacentHTML('beforeend', '<button id="zzBtn" type="button">x</button>'); document.getElementById('zzBtn').addEventListener('click', () => window.__cliques++); });
  await page.evaluate(async () => { const {Store} = await import('/js/data/store.js'); Store.inflight++; });
  await page.click('#zzBtn'); await page.click('#zzBtn'); await page.click('#zzBtn');
  L.ok(await page.evaluate(() => window.__cliques) === 1, 'com uma gravação em andamento, tocar de novo no mesmo botão é ignorado');
  await page.evaluate(async () => { const {Store} = await import('/js/data/store.js'); Store.inflight--; });
  await L.sleep(1100);
  await page.click('#zzBtn'); await page.click('#zzBtn');
  L.ok(await page.evaluate(() => window.__cliques) === 3, 'sem gravação em andamento, os toques valem normalmente');
});
