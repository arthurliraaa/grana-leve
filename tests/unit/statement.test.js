import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeBytes, parseAmountText, parseDateText, parseOfx, parseCsv, detectCsvLayout, csvItems, buildDrafts, learnCategories, descriptionKey, summarize} from '../../js/domain/statement.js';

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261105120000[-3:BRT]
<TRNAMT>-45.90
<FITID>202611050001
<MEMO>COMPRA MERCADO ESTRELA 1234
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261106
<TRNAMT>3500,00
<FITID>202611060002
<NAME>SALARIO
<MEMO>CREDITO SALARIO EMPRESA XYZ
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261107
<TRNAMT>0.00
<FITID>zero
<MEMO>TARIFA ZERADA
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20261107</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const OFX_XML_CARD = `<?xml version="1.0" encoding="UTF-8"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL</CURDEF>
<CCACCTFROM><ACCTID>9876</ACCTID></CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110000000[-3:BRT]</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>a1</FITID><MEMO>Padaria &amp; Caf&#39;e</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261112000000</DTPOSTED><TRNAMT>1500.00</TRNAMT><FITID>a2</FITID><MEMO>Pagamento recebido</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

test('números e datas no jeito dos bancos', () => {
  assert.equal(parseAmountText('R$ 1.234,56'), 1234.56);
  assert.equal(parseAmountText('-1234.56', true), -1234.56);
  assert.equal(parseAmountText('(45,00)'), -45);
  assert.equal(parseAmountText('45,00-'), -45);
  assert.equal(parseAmountText('1.234'), 1234, 'no CSV brasileiro, ponto com 3 dígitos é milhar');
  assert.equal(parseAmountText('1234.5', true), 1234.5, 'no OFX o ponto é decimal');
  assert.equal(parseAmountText('12.5'), 12.5);
  assert.equal(parseAmountText('1,234,567.89'), 1234567.89);
  assert.ok(Number.isNaN(parseAmountText('abc')));
  assert.ok(Number.isNaN(parseAmountText('')));
  assert.equal(parseDateText('20261105'), '2026-11-05');
  assert.equal(parseDateText('05/11/2026'), '2026-11-05');
  assert.equal(parseDateText('05-11-26'), '2026-11-05');
  assert.equal(parseDateText('2026-11-05T10:00:00'), '2026-11-05');
  assert.equal(parseDateText('11/25/2026'), '2026-11-25', 'mês maior que 12 só pode ser mês/dia');
  assert.equal(parseDateText('31/02/2026'), '', 'data que não existe');
  assert.equal(parseDateText('texto'), '');
});

test('decodificação: UTF-8 ou Windows-1252', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('Açaí')), 'Açaí');
  assert.equal(decodeBytes(Uint8Array.from([0x41, 0xe7, 0x61, 0xed])), 'Açaí', 'bytes do Windows-1252');
  assert.equal(decodeBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])), 'A', 'tira o BOM');
});

test('OFX 1.x (SGML): conta, itens com sinal, valor com vírgula e itens zerados ignorados', () => {
  const r = parseOfx(OFX_SGML);
  assert.equal(r.kind, 'bank');
  assert.equal(r.accountId, '12345-6');
  assert.equal(r.items.length, 2);
  assert.equal(r.skipped, 1, 'o lançamento de R$ 0,00 não vale');
  assert.deepEqual(r.items[0], {id: '202611050001', date: '2026-11-05', amount: -45.9, name: 'COMPRA MERCADO ESTRELA 1234'});
  assert.equal(r.items[1].amount, 3500);
  assert.equal(r.items[1].name, 'CREDITO SALARIO EMPRESA XYZ', 'o memo já traz o nome: fica só ele');
  assert.equal(parseOfx('<STMTTRN><DTPOSTED>20261101<TRNAMT>-1.00<FITID>1<NAME>LOJA<MEMO>PARCELA 2/3</STMTTRN>').items[0].name, 'LOJA - PARCELA 2/3', 'nome e memo diferentes se juntam');
});

test('OFX 2.x (XML) de cartão: entidades e tipo', () => {
  const r = parseOfx(OFX_XML_CARD);
  assert.equal(r.kind, 'card');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].name, "Padaria & Caf'e");
  assert.equal(r.items[0].amount, -89.9);
  assert.equal(parseOfx('nada de OFX aqui').kind, 'unknown');
});

const CSV_NUBANK = `date,category,title,amount
2026-11-03,restaurante,Padaria Pão Quente,18.90
2026-11-05,transporte,Uber *Trip,32.50
2026-11-08,pagamento,Pagamento recebido,-500.00
`;
const CSV_INTER = `Extrato Conta Corrente
Conta;12345678
Período;01/11/2026 a 30/11/2026

Data Lançamento;Histórico;Descrição;Valor;Saldo
05/11/2026;Pix enviado;"PIX - JOÃO; MERCADO";-1.234,56;5.000,00
06/11/2026;Pix recebido;PIX MARIA;250,00;5.250,00
`;
const CSV_ITAU = `Data;Descrição;Débito;Crédito;Saldo
10/11/2026;COMPRA FARMACIA;29,90;;970,10
11/11/2026;SALARIO;;3.000,00;3.970,10
`;

test('CSV Nubank (cartão): sinal invertido, colunas pelo cabeçalho', () => {
  const p = parseCsv(CSV_NUBANK), l = detectCsvLayout(p.rows);
  assert.equal(p.delimiter, ',');
  assert.deepEqual(l.map, {date: 0, desc: 2, amount: 3, debit: -1, credit: -1});
  assert.equal(l.invert, true, 'compra positiva, pagamento negativo');
  const r = csvItems(l, l.map, l.invert);
  assert.deepEqual(r.items.map(i => i.amount), [-18.9, -32.5, 500]);
  assert.equal(r.items[0].name, 'Padaria Pão Quente');
});

test('CSV de conta com texto antes do cabeçalho, campo entre aspas com ; e saldo ignorado', () => {
  const p = parseCsv(CSV_INTER), l = detectCsvLayout(p.rows);
  assert.equal(p.delimiter, ';');
  assert.equal(l.header[0], 'Data Lançamento');
  assert.equal(l.map.date, 0);
  assert.equal(l.map.amount, 3, 'a coluna Saldo não é o valor');
  assert.equal(l.map.desc, 1, 'a primeira coluna de texto com cara de descrição (Histórico)');
  const r = csvItems(l, l.map, false);
  assert.deepEqual(r.items.map(i => i.amount), [-1234.56, 250]);
  assert.equal(r.items[0].date, '2026-11-05');
});

test('CSV com colunas de débito e crédito', () => {
  const l = detectCsvLayout(parseCsv(CSV_ITAU).rows);
  assert.equal(l.map.debit, 2);
  assert.equal(l.map.credit, 3);
  const r = csvItems(l, l.map, false);
  assert.deepEqual(r.items.map(i => i.amount), [-29.9, 3000]);
});

test('CSV sem datas não é extrato', () => {
  assert.equal(detectCsvLayout(parseCsv('a;b\nx;y').rows), null);
});

test('rascunhos: categoria sugerida, aprendida e duplicados', () => {
  const items = parseOfx(OFX_SGML).items;
  const existing = [
    {id: '1', type: 'expense', amount: 80, date: '2026-10-01', category: 'compras', description: 'Compra Mercado Estrela 999'},
    {id: '2', type: 'income', amount: 3500, date: '2026-11-06', category: 'salario', description: 'Salário (lançado à mão)'}
  ];
  const learned = learnCategories(existing);
  assert.equal(descriptionKey('COMPRA MERCADO ESTRELA 1234'), 'compra mercado estrela');
  const d = buildDrafts(items, {accountId: '12345-6', existing, learned});
  assert.equal(d[0].type, 'expense');
  assert.equal(d[0].amount, 45.9);
  assert.equal(d[0].category, 'compras', 'aprendeu com o que a pessoa já fez com esse estabelecimento');
  assert.equal(d[0].externalId, 'ofx:12345-6:202611050001');
  assert.equal(d[0].checked, true);
  assert.equal(d[1].dup, 'similar', 'mesmo dia, tipo e valor de um lançamento manual');
  assert.equal(d[1].checked, false);
  const again = buildDrafts(items, {accountId: '12345-6', existing: [{type: 'expense', amount: 45.9, date: '2026-11-05', externalId: 'ofx:12345-6:202611050001'}], learned});
  assert.equal(again[0].dup, 'imported', 'a mesma importação não entra duas vezes');
  assert.equal(summarize(d).count, 1);
  assert.equal(summarize(d).expense, 45.9);
});

test('fatura de cartão: crédito (pagamento) não vira ganho', () => {
  const d = buildDrafts(parseOfx(OFX_XML_CARD).items, {isCard: true, accountId: '9876'});
  assert.equal(d[1].ignore, 'pagamento da fatura');
  assert.equal(d[1].checked, false);
  assert.equal(d[0].checked, true);
  assert.equal(summarize(d).count, 1);
});

test('itens repetidos dentro do arquivo: mesmo FITID só vale uma vez; mesma descrição e valor sem FITID valem as duas', () => {
  const dupId = buildDrafts([{id: 'x', date: '2026-11-01', amount: -10, name: 'A'}, {id: 'x', date: '2026-11-01', amount: -10, name: 'A'}], {accountId: '1'});
  assert.deepEqual(dupId.map(d => d.dup), ['', 'imported']);
  const noId = buildDrafts([{id: '', date: '2026-11-01', amount: -5, name: 'Café'}, {id: '', date: '2026-11-01', amount: -5, name: 'Café'}], {});
  assert.deepEqual(noId.map(d => d.dup), ['', ''], 'dois cafés iguais no mesmo dia são dois lançamentos');
});
