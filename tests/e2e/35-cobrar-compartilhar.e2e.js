// "Cobrar": escolher entre o que vence no mês e o total em aberto, incluir a chave Pix (lembrada) e o
// link. "Compartilhar": link/arquivo que a outra pessoa aceita e vira dívida em "Eu devo".
import * as L from './lib.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

L.run(async ({page}) => {
  await L.signup(page);
  const due = L.monthKey(-2) + '-05';   // 12x de 100: parcelas em -2, -1 e neste mês já venceram/vencem
  await L.patchDb(page, `u.receivables = (u.receivables || []).concat([{id: 'r1', person: 'Gessi Lira', kind: 'cartao', description: 'TV',
    totalAmount: 1200, receivedAmount: 0, installments: 12, installmentAmount: 100, dueDate: arg, urgency: 'media', createdAt: 1}]);`, due);
  await page.evaluateOnNewDocument(() => { window.open = (u) => { window.__opened = u; return null; }; });
  await page.evaluate(() => { window.open = (u) => { window.__opened = u; return null; }; });
  await L.tab(page, 'receber');

  L.section('Cobrar: do mês ou total');
  await page.$eval('[data-recv-charge="r1"]', el => el.click()); await L.sleep(200);
  let body = await L.text(page, '#modalRoot');
  L.ok(/Só a deste mês · R\$\s?300,00/.test(body) && /Total em aberto · R\$\s?1\.200,00/.test(body), 'mostra as duas opções com os valores (3 parcelas até este mês × total)');
  let msg = await page.$eval('#chargeMsg', el => el.value);
  L.ok(/3 parcelas \(da 1ª à 3ª de 12\), R\$\s?300,00/.test(msg), 'começa pelo do mês: cita as parcelas e o valor');
  await page.$eval('input[name=what][value=total]', el => el.click()); await L.sleep(100);
  msg = await page.$eval('#chargeMsg', el => el.value);
  L.ok(/total em aberto: R\$\s?1\.200,00 \(faltam 12 de 12 parcelas\)/.test(msg), 'trocando para o total, a mensagem muda');

  L.section('Chave Pix e link');
  L.ok(await page.$eval('#chargePixField', el => el.hidden), 'campo da chave Pix só aparece ao marcar');
  await page.$eval('#chargePixOn', el => el.click()); await L.sleep(80);
  await page.type('#chargePix', 'arthur@pix.com'); await L.sleep(100);
  msg = await page.$eval('#chargeMsg', el => el.value);
  L.ok(/pode mandar no Pix: arthur@pix\.com/.test(msg), 'chave Pix entra na mensagem');
  await page.$eval('#chargeLinkOn', el => el.click()); await L.sleep(200);
  msg = await page.$eval('#chargeMsg', el => el.value);
  L.ok(/Para acompanhar no Grana Leve: http\S+#\/cobranca\//.test(msg), 'link para a pessoa adicionar no Grana Leve');
  await L.submitModal(page); await L.sleep(150);
  const opened = await page.evaluate(() => window.__opened || '');
  L.ok(/wa\.me\/\?text=/.test(opened) && decodeURIComponent(opened).includes('arthur@pix.com'), 'abre o WhatsApp com a mensagem');
  await page.$eval('[data-recv-charge="r1"]', el => el.click()); await L.sleep(200);
  L.ok(await page.$eval('#chargePixOn', el => el.checked) && await page.$eval('#chargePix', el => el.value) === 'arthur@pix.com', 'a chave e a escolha ficam guardadas para a próxima');
  await page.$eval('#chargePix', el => { el.value = ''; el.dispatchEvent(new Event('input', {bubbles: true})); });
  await L.submitModal(page);
  L.ok(/Digite a chave Pix/.test(await L.modalError(page)), 'marcado sem chave: pede a chave');
  await L.closeModal(page);

  L.section('Compartilhar');
  await page.$eval('[data-recv-share="r1"]', el => el.click()); await L.sleep(250);
  L.ok(await L.modalTitle(page) === 'Compartilhar com Gessi Lira', 'abre o compartilhamento');
  body = await L.text(page, '#modalRoot');
  L.ok(/Quem cobra\s*Arthur Teste/.test(body) && /Falta\s*R\$\s?1\.200,00/.test(body) && /arthur@pix\.com/.test(body), 'resumo do que vai no link (com a chave Pix)');
  const link = await page.$eval('#shareLink', el => el.value);
  const ref = (await L.db(page)).receivables[0].shareRef;
  L.ok(/#\/cobranca\/[A-Za-z0-9_-]+$/.test(link) && !!ref, 'gera o link e guarda a referência da cobrança');
  await L.closeModal(page);

  L.section('Aceitar pelo link');
  await page.goto('about:blank'); await page.goto(link, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(600);
  L.ok(await L.modalTitle(page) === 'Arthur Teste te enviou uma cobrança', 'ao abrir o link, mostra a cobrança para aceitar');
  L.ok(!/cobranca/.test(await page.evaluate(() => location.hash)), 'o endereço é limpo');
  await L.submitModal(page); await L.sleep(300);
  let d = await L.db(page);
  let debt = d.debts.find(x => x.shared);
  L.ok(debt && debt.totalAmount === 1200 && debt.monthlyPayment === 100 && debt.creditor === 'Arthur Teste' && debt.shared.ref === ref && debt.shared.pix === 'arthur@pix.com', 'vira dívida em “Eu devo” com valor, parcela, quem cobra e Pix');
  L.ok(/cobrança enviada por Arthur Teste/.test(await L.text(page, '#debtGrid')) && /Chave Pix: arthur@pix\.com/.test(await L.text(page, '#debtGrid')), 'cartão da dívida mostra quem enviou e a chave Pix');

  L.section('Reenviar atualiza, não duplica');
  await L.patchDb(page, `u.receivables[0].receivedAmount = 300;`);
  await L.tab(page, 'receber');
  await page.$eval('[data-recv-share="r1"]', el => el.click()); await L.sleep(250);
  const link2 = await page.$eval('#shareLink', el => el.value);
  await L.closeModal(page);
  await page.goto('about:blank'); await page.goto(link2, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(600);
  L.ok(/Atualizar cobrança de Arthur Teste/.test(await L.modalTitle(page)), 'mesma cobrança: oferece atualizar');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.debts.filter(x => x.shared).length === 1 && d.debts.find(x => x.shared).paidAmount === 300, 'atualiza o que já foi pago, sem duplicar');

  L.section('Link inválido e arquivo');
  await page.goto('about:blank'); await page.goto(L.BASE + '#/cobranca/abc', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(1200);
  L.ok(/incompleto ou foi alterado/.test(await L.allToasts(page)) && !(await L.modalOpen(page)), 'link alterado: avisa e não cria nada');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-')), 'cobranca.json');
  fs.writeFileSync(file, JSON.stringify({t: 'granaleve-cobranca', v: 1, ref: 'outra', from: 'Ana', person: 'Arthur', desc: 'Pizza <b>', total: 80, received: 0, at: L.dayOffset(0)}));
  await L.tab(page, 'dividas');
  const input = await page.$('#debtImportFile');
  await input.uploadFile(file); await L.sleep(400);
  L.ok(await L.modalTitle(page) === 'Ana te enviou uma cobrança' && /Pizza <b>/.test(await L.text(page, '#modalRoot')), 'importar o arquivo abre a mesma tela (texto escapado)');
  await L.submitModal(page); await L.sleep(300);
  L.ok((await L.db(page)).debts.some(x => x.creditor === 'Ana' && x.totalAmount === 80), 'arquivo vira dívida');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'receber');
  await page.$eval('[data-recv-charge="r1"]', el => el.click()); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'cobrar cabe na tela');
  await L.closeModal(page);
});
