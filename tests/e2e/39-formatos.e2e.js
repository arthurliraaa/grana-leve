// Formatos digitados: valores no jeito brasileiro ("1.500,00"), chave Pix e WhatsApp.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  async function typeAmount(sel, text){
    await page.$eval(sel, el => { el.focus(); el.select && el.select(); });
    await page.keyboard.press('Backspace');
    await page.type(sel, text);
  }

  L.section('Valor de um lançamento digitado como no Brasil');
  await page.click('#fabAdd'); await L.sleep(150);
  L.ok(await page.$eval('#mAmount', el => el.type === 'text' && el.inputMode === 'decimal'), 'campo de texto com teclado numérico (o campo de número lia "1.500" como 1,5)');
  await typeAmount('#mAmount', '1.500');
  await page.click('#mDesc'); await L.sleep(50);
  L.ok(await page.$eval('#mAmount', el => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') && el.matches('[data-money]')) &&
    await page.evaluate(() => import('/js/ui/money-input.js').then(m => m.rawMoneyText(document.getElementById('mAmount')))) === '1.500,00', 'ao sair do campo, mostra 1.500,00');
  await page.type('#mDesc', 'Salário teste');
  await L.submitModal(page); await L.sleep(200);
  let tx = (await L.db(page)).transactions.find(t => t.description === 'Salário teste');
  L.ok(tx && tx.amount === 1500, '“1.500” é gravado como R$ 1.500,00 (antes virava R$ 1,50)');

  await page.click('#fabAdd'); await L.sleep(150);
  await typeAmount('#mAmount', 'abc32,50');
  L.ok(await page.evaluate(() => import('/js/ui/money-input.js').then(m => m.rawMoneyText(document.getElementById('mAmount')))) === '32,50', 'letras não entram no campo');
  await page.type('#mDesc', 'Lanche teste');
  await L.submitModal(page); await L.sleep(200);
  tx = (await L.db(page)).transactions.find(t => t.description === 'Lanche teste');
  L.ok(tx && tx.amount === 32.5, '“32,50” é gravado como R$ 32,50');

  await page.click('#fabAdd'); await L.sleep(150);
  await typeAmount('#mAmount', '1.5.6');
  await page.click('#mDesc'); await L.sleep(50);
  L.ok(await page.$eval('#mAmount', el => el.classList.contains('is-invalid') && el.getAttribute('aria-invalid') === 'true'), 'valor que não dá para entender fica marcado');
  await L.submitModal(page); await L.sleep(150);
  L.ok(await L.modalOpen(page) && (await L.modalError(page)).length > 0, 'e o lançamento não é salvo com valor errado');
  await L.closeModal(page);

  L.section('Editar mostra o valor formatado');
  const id = (await L.db(page)).transactions.find(t => t.description === 'Salário teste').id;
  await L.tab(page, 'lancamentos');
  await page.$eval('[data-edit-tx="' + id + '"]', el => el.click()); await L.sleep(200);
  L.ok(await page.evaluate(() => import('/js/ui/money-input.js').then(m => m.rawMoneyText(document.getElementById('mAmount')))) === '1.500,00', 'o popup de edição abre com 1.500,00');
  L.ok(await page.$eval('#mAmount', el => el.value) === '1500', 'e o app continua lendo 1500');
  await L.closeModal(page);

  L.section('Limite do planejamento');
  await L.tab(page, 'limites');
  const lim = await page.$('[data-budget-cat]:not([disabled])');
  if (lim){
    const cat = await lim.evaluate(el => el.getAttribute('data-budget-cat'));
    await lim.evaluate(el => { el.focus(); el.select(); });
    await page.keyboard.type('1.200');
    await page.keyboard.press('Tab'); await L.sleep(250);
    const u = await L.db(page);
    const saved = (u.budgets || []).map(b => b.limits ? b.limits[cat] : (b.id === cat ? b.limit : undefined)).filter(v => v !== undefined);
    L.ok(saved.includes(1200), 'limite “1.200” é gravado como R$ 1.200,00');
  } else L.ok(false, 'campo de limite encontrado');

  L.section('Cobrança: chave Pix e WhatsApp');
  await L.patchDb(page, `u.receivables = (u.receivables || []).concat([{id: 'r1', person: 'Bia Souza', kind: 'emprestimo', description: 'Ingresso',
    totalAmount: 80, receivedAmount: 0, urgency: 'media', createdAt: 1}]);`);
  await page.evaluate(() => { window.open = (u) => { window.__opened = u; return null; }; });
  await L.tab(page, 'receber');
  await page.$eval('[data-recv-charge="r1"]', el => el.click()); await L.sleep(200);
  await page.$eval('#chargePixOn', el => el.click()); await L.sleep(80);
  await page.type('#chargePix', '529.982.247-24');
  await L.submitModal(page);
  L.ok(/CPF/.test(await L.modalError(page)), 'CPF com dígito errado: avisa antes de mandar');
  await page.$eval('#chargePix', el => { el.value = ''; }); await page.type('#chargePix', '529.982.247-25');
  await page.type('#chargePhone', '98888-7777');
  await L.submitModal(page);
  L.ok(/DDD/.test(await L.modalError(page)), 'WhatsApp sem DDD: pede o DDD');
  await page.$eval('#chargePhone', el => { el.value = ''; }); await page.type('#chargePhone', '011 98888-7777');
  await L.submitModal(page); await L.sleep(150);
  L.ok(/wa\.me\/5511988887777\?/.test(await page.evaluate(() => window.__opened || '')), 'o 0 da ligação interurbana sai e entra o 55');
});
