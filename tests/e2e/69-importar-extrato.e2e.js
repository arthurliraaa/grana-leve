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
// PDF mínimo (só texto, Helvetica), com xref certo: uma linha por texto, de cima para baixo.
function makePdf(lines){
  const esc = t => t.replace(/[\\()]/g, m => '\\' + m);
  const stream = 'BT /F1 11 Tf 14 TL 50 780 Td ' + lines.map(l => '(' + esc(l) + ') Tj T*').join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
  return out;
}
const pdfPath = join(dir, 'fatura.pdf'), pdfEmpty = join(dir, 'imagem.pdf');
writeFileSync(pdfPath, makePdf(['Fatura Nubank  Vencimento 10/12/2026', '03/11 PADARIA PAO QUENTE R$ 18,90', '05/11 UBER *TRIP 32,50', '07/11 PAGAMENTO RECEBIDO -500,00', 'Total da fatura 51,40']), 'latin1');
writeFileSync(pdfEmpty, makePdf(['Documento sem lancamentos']), 'latin1');
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

  L.section('PDF');
  await open();
  L.ok(/OFX ou CSV/.test(await L.text(page, '.is-tip')) && /exata/.test(await L.text(page, '.is-tip')) && /aproximada/.test(await L.text(page, '.is-tip')), 'avisa que o OFX ou o CSV gerado no banco é mais exato que o PDF');
  await upload(pdfEmpty);
  await page.waitForFunction(() => /Não encontrei lançamentos neste PDF|Não foi possível carregar/.test(document.getElementById('isErr').textContent), {timeout: 20000}).catch(() => {});
  const pdfErr = await L.text(page, '#isErr');
  if (/Não foi possível carregar o leitor/.test(pdfErr)){ console.log('Pulado (PDF): sem internet para baixar o pdf.js do CDN.'); }
  else {
    L.ok(/Não encontrei lançamentos neste PDF/.test(pdfErr) && /OFX ou o CSV/.test(pdfErr), 'PDF sem lançamentos explica e sugere o OFX ou o CSV do banco');
    L.ok(await page.evaluate(() => !!window.pdfjsLib) && await page.evaluate(() => /^blob:/.test(window.pdfjsLib.GlobalWorkerOptions.workerSrc)), 'o leitor de PDF só é baixado ao escolher um PDF, e o worker vem verificado (blob)');
    await upload(pdfPath);
    await page.waitForFunction(() => /PDF: \d+ lançamentos? encontrados?/.test(document.getElementById('isInfo').textContent), {timeout: 20000}).catch(() => {});
    L.ok(/PDF: 3 lançamentos encontrados.*Leitura aproximada/.test(await L.text(page, '#isInfo')), 'lê as linhas da fatura em PDF (3 lançamentos; o total fica de fora)');
    L.ok((await page.$eval('#isDest', e => e.value)).startsWith('card:') && await page.$eval('#isInvert', e => e.checked), 'fatura: escolhe o cartão e entende o positivo como gasto');
    await page.$eval('#isReview', e => e.click()); await L.sleep(250);
    L.ok(!(await page.$eval('#isPdfWarn', e => e.hidden)) && /Leitura aproximada do PDF/.test(await L.text(page, '#isPdfWarn')) && /OFX/.test(await L.text(page, '#isPdfWarn')), 'na conferência repete o aviso de leitura aproximada');
    L.ok(await page.$$eval('.is-row.is-ignored', r => r.length) === 1, 'o pagamento recebido (crédito) fica de fora');
    await page.$eval('#isGo', e => e.click()); await L.sleep(600);
    const pd = (await L.db(page)).transactions.filter(t => t.source === 'import' && t.description.includes('UBER'));
    L.ok(pd.length === 1 && pd[0].amount === 32.5 && pd[0].date === '2026-11-05' && pd[0].paymentMethod === 'cartao', 'importou a compra do PDF no cartão, com o ano certo (2026)');
  }

  L.section('Celular');
  await page.setViewport({width: 375, height: 800}); await L.sleep(150);
  await open(); await upload(ofxPath);
  await page.$eval('#isReview', e => e.click()); await L.sleep(250);
  L.ok(await L.noHorizontalScroll(page), 'a conferência cabe no celular');
});
