// Importar extrato OFX/CSV: ler, conferir, evitar duplicados, gravar na conta ou no cartão e desfazer.
import * as L from './lib.js';
import {writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'gl-ofx-'));
const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000[-3:BRT]<TRNAMT>-45.90<FITID>f1<MEMO>COMPRA MERCADO ESTRELA 1234</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>3500.00<FITID>f2<MEMO>CREDITO SALARIO EMPRESA XYZ</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const CSV_CARD = `date,category,title,amount
2026-11-03,restaurante,Padaria Pão Quente,18.90
2026-11-08,pagamento,Pagamento recebido,-500.00
`;
const ofxPath = join(dir, 'extrato.ofx'), csvPath = join(dir, 'fatura.csv'), junkPath = join(dir, 'lixo.csv');
writeFileSync(ofxPath, OFX, 'latin1'); writeFileSync(csvPath, CSV_CARD); writeFileSync(junkPath, 'isto não é um extrato\nnada de data aqui');

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Itaú');
  await page.click('#accountForm button[type=submit]'); await L.sleep(300);
  await L.addCard(page, 'Nubank', 3000, 5, 12);

  const open = async () => { await L.tab(page, 'lancamentos'); await page.$eval('#importStmtBtn', e => e.click()); await L.sleep(250); };
  const upload = async path => { const input = await page.$('#isFile'); await input.uploadFile(path); await L.sleep(400); };

  L.section('Extrato de conta (OFX)');
  await open();
  L.ok(/Importar extrato/.test(await L.modalTitle(page)), 'Ganhos e gastos tem “Importar extrato”');
  await upload(junkPath);
  L.ok(/Não reconheci as colunas/.test(await L.text(page, '#isErr')) && await page.$eval('#isReview', e => e.disabled), 'arquivo que não é extrato dá um aviso e não deixa continuar');
  await upload(ofxPath);
  L.ok(/Extrato de conta \(OFX\): 2 lançamentos de 05\/11 a 06\/11/.test(await L.text(page, '#isInfo')) && (await page.$eval('#isDest', e => e.value)).startsWith('acc:'), 'lê o OFX (com acentos do Windows-1252) e já escolhe a conta');
  await page.$eval('#isReview', e => e.click()); await L.sleep(250);
  L.ok(await page.$$eval('.is-row', r => r.length) === 2 && /2 lançamentos marcados · gastos R\$\s?45,90 · ganhos R\$\s?3\.500,00/.test(await L.text(page, '#isSummary')), 'mostra os 2 lançamentos para conferir, com o total de gastos e ganhos');
  L.ok(await page.$eval('[data-is-cat="0"]', e => e.value) === 'alimentacao', 'sugere a categoria pelo texto (mercado → Alimentação)');
  await page.$eval('#isGo', e => e.click()); await L.sleep(600);
  let d = await L.db(page);
  const imp = d.transactions.filter(t => t.source === 'import');
  L.ok(imp.length === 2 && imp.every(t => t.importBatch && t.externalId.startsWith('ofx:12345-6:')), 'gravou os 2 lançamentos com a origem, o identificador do banco e o da importação');
  const exp = imp.find(t => t.type === 'expense'), inc = imp.find(t => t.type === 'income');
  L.ok(exp.amount === 45.9 && exp.date === '2026-11-05' && exp.paymentMethod === 'conta' && exp.accountId && inc.amount === 3500 && inc.accountId === exp.accountId, 'gasto e ganho caíram na conta escolhida, com data e valor certos');

  L.section('Sem duplicar');
  await open(); await upload(ofxPath);
  await page.$eval('#isReview', e => e.click()); await L.sleep(250);
  L.ok(await page.$$eval('.is-row .pill', p => p.filter(x => /já importado/.test(x.textContent)).length) === 2 && await page.$eval('#isGo', e => e.disabled), 'importar o mesmo arquivo de novo vem tudo marcado como “já importado” e nada a importar');
  await L.closeModal(page);

  L.section('Desfazer');
  await open();
  L.ok(/2 lançamentos/.test(await L.text(page, '.is-batches')), 'lista as importações anteriores');
  await page.$eval('[data-is-undo]', e => e.click()); await L.sleep(300);
  await page.$eval('#modalRoot [type=submit]', e => e.click()); await L.sleep(500);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => t.source === 'import').length === 0, 'desfazer remove só os lançamentos dessa importação');

  L.section('CSV de fatura do cartão');
  await open(); await upload(csvPath);
  L.ok(!(await page.$eval('#isMap', e => e.hidden)) && (await page.$eval('#isDest', e => e.value)).startsWith('card:') && await page.$eval('#isInvert', e => e.checked), 'CSV com colunas detectadas, sinal invertido e o cartão já escolhido');
  await page.$eval('#isReview', e => e.click()); await L.sleep(250);
  L.ok(await page.$$eval('.is-row.is-ignored', r => r.length) === 1 && /pagamento da fatura/.test(await L.text(page, '.is-ignored')), 'o pagamento da fatura (crédito no cartão) fica de fora');
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');
  await page.$eval('#isGo', e => e.click()); await L.sleep(600);
  d = await L.db(page);
  const card = d.transactions.filter(t => t.source === 'import');
  L.ok(card.length === 1 && card[0].paymentMethod === 'cartao' && card[0].cardId === d.cards[0].id && card[0].amount === 18.9 && card[0].description === 'Padaria Pão Quente', 'a compra entrou no cartão, com o texto do banco como descrição');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800}); await L.sleep(150);
  await open(); await upload(ofxPath);
  await page.$eval('#isReview', e => e.click()); await L.sleep(250);
  L.ok(await L.noHorizontalScroll(page), 'a conferência cabe no celular');
});
