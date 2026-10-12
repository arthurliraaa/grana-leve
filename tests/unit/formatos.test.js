import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMoneyText, formatMoneyInput} from '../../js/domain/money.js';
import {whatsappNumber, pixKeyProblem} from '../../js/domain/contact.js';
import {parse, parseAmount} from '../../js/domain/parser.js';
import {csvCell} from '../../js/ui/dom.js';

test('campo de dinheiro entende o jeito brasileiro (antes "1.500" virava 1,50)', () => {
  const cases = {'1.500,00': '1500.00', '1.500': '1500', '12.345.678,9': '12345678.9', '32,50': '32.50', '32.50': '32.50', '32.5': '32.5',
    '1500': '1500', 'R$ 1.500,75': '1500.75', 'r$40': '40', ' 2 300 ': '2300', '-20': '-20', '-1.234,5': '-1234.5', ',5': '0.5', '0,99': '0.99', '': ''};
  for (const [raw, want] of Object.entries(cases)) assert.equal(parseMoneyText(raw), want, raw);
});

test('campo de dinheiro recusa o que não é valor', () => {
  for (const raw of ['1.5.6', '12abc', '1,234.56', '1.50000', '12,345', '--5', '1,2,3']) assert.equal(parseMoneyText(raw), 'NaN', raw);
});

test('valor mostrado no campo fica no formato brasileiro', () => {
  assert.equal(formatMoneyInput(1500), '1.500,00');
  assert.equal(formatMoneyInput('32.5'), '32,50');
  assert.equal(formatMoneyInput(-20), '-20,00');
  assert.equal(formatMoneyInput(''), '');
  assert.equal(parseMoneyText('R$'), '', 'só o símbolo conta como vazio');
  assert.equal(formatMoneyInput(null), '');
  assert.equal(formatMoneyInput('abc'), 'abc');
});

test('WhatsApp: número com DDD vira o formato do link, com 55', () => {
  for (const raw of ['(11) 98888-7777', '11 98888-7777', '011 98888-7777', '+55 11 98888-7777', '0055 11 98888-7777', '5511988887777'])
    assert.equal(whatsappNumber(raw), '5511988887777', raw);
  assert.equal(whatsappNumber('11 3333-4444'), '551133334444', 'fixo com DDD');
  assert.equal(whatsappNumber('+1 415 555 1234'), '14155551234', 'número de fora, com +');
  assert.equal(whatsappNumber(''), '', 'vazio: o WhatsApp pede o contato');
  for (const raw of ['98888-7777', '123', '00 98888-7777']) assert.equal(whatsappNumber(raw), null, raw);
});

test('chave Pix: aceita CPF, CNPJ, celular, e-mail e aleatória; aponta erro de digitação', () => {
  for (const ok of ['529.982.247-25', '52998224725', '11.222.333/0001-81', '(11) 98888-7777', '+55 11 98888-7777', 'ana@gmail.com', '123e4567-e89b-12d3-a456-426614174000'])
    assert.equal(pixKeyProblem(ok), '', ok);
  assert.match(pixKeyProblem('529.982.247-24'), /CPF/);
  assert.match(pixKeyProblem('11.222.333/0001-82'), /CNPJ/);
  assert.match(pixKeyProblem('111.111.111-11'), /CPF/);
  assert.match(pixKeyProblem('abc'), /não parece válida/);
  assert.match(pixKeyProblem('12345'), /não parece válida/);
  assert.match(pixKeyProblem(''), /Digite/);
});

test('mensagem: o valor não é confundido com dia, hora, porcentagem ou parcelas', () => {
  const today = new Date(2026, 9, 8);
  assert.equal(parse('dia 15 gastei 30 no mercado', {today}).items[0].amount, 30);
  assert.equal(parse('dia 15 gastei 30 no mercado', {today}).items[0].date, '2026-09-15');
  assert.equal(parseAmount('gastei 50 às 10h').value, 50);
  assert.equal(parseAmount('almoço 10:30 deu 25').value, 25);
  assert.equal(parseAmount('desconto de 10% e paguei 90').value, 90);
  assert.equal(parseAmount('tênis 3x de 100').value, 100);
  assert.equal(parseAmount('cod123 gastei 20').value, 20, 'número colado em letras não é valor');
  assert.equal(parseAmount('2,5 mil').value, 2500);
});

test('CSV: fórmula vira texto e quebras de linha ficam entre aspas', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('\t=cmd'), "'\t=cmd");
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('linha\r\noutra'), '"linha\r\noutra"');
  assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
  assert.equal(csvCell(null), '');
});
