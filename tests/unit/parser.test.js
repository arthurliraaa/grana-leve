import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseAmount} from '../../js/domain/parser.js';

const today = new Date(2026, 9, 8); // 08/10/2026

test('valores em formatos brasileiros', () => {
  assert.equal(parseAmount('gastei 32,50').value, 32.5);
  assert.equal(parseAmount('recebi 1.500,00').value, 1500);
  assert.equal(parseAmount('2 mil').value, 2000);
  assert.equal(parseAmount('R$ 40').value, 40);
  assert.equal(parseAmount('sem valor'), null);
});

test('vários itens na mesma frase, com categoria', () => {
  const r = parse('gastei 30 no mercado e 20 no uber', {today});
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items.map(i => [i.type, i.amount, i.category]), [['expense', 30, 'alimentacao'], ['expense', 20, 'transporte']]);
});

test('ganho, datas relativas e vírgula decimal', () => {
  let r = parse('recebi 1.500 de salário ontem', {today});
  assert.deepEqual([r.items[0].type, r.items[0].amount, r.items[0].category, r.items[0].date], ['income', 1500, 'salario', '2026-10-07']);
  r = parse('paguei 32,50 de luz dia 3', {today});
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].amount, 32.5);
  assert.equal(r.items[0].date, '2026-10-03');
  r = parse('gastei 10 no almoço dia 20', {today}); // dia 20 ainda não chegou: mês passado
  assert.equal(r.items[0].date, '2026-09-20');
});

test('cartão e parcelas', () => {
  let r = parse('comprei um tênis de 300 em 3x no cartão', {today});
  assert.equal(r.items[0].paymentMethod, 'cartao');
  assert.equal(r.items[0].installments, 3);
  assert.equal(r.items[0].amount, 300);
  r = parse('comprei celular 10x de 150', {today});
  assert.equal(r.items[0].amount, 1500);
  assert.equal(r.items[0].installments, 10);
});

test('o que não foi reconhecido fica marcado para revisão', () => {
  const r = parse('gastei 45 na lojinha', {today});
  assert.equal(r.items[0].category, 'outros');
  assert.equal(r.items[0].recognized.category, false);
  assert.equal(r.items[0].recognized.payment, false);
  assert.equal(r.items[0].recognized.date, false);
  const ok = parse('gastei 30 no mercado no pix hoje', {today});
  assert.deepEqual(ok.items[0].recognized, {category: true, payment: true, date: true, type: true});
});

test('respostas sem lançamento e mensagens de erro', () => {
  assert.deepEqual(parse('não, nada', {today}), {nothing: true});
  assert.ok(parse('', {today}).error);
  assert.ok(parse('fui ao mercado', {today}).error);
});

test('item sem verbo herda o tipo da frase e não fica marcado; frase sem verbo fica', () => {
  const r = parse('gastei 30 no mercado e 45 na lojinha', {today});
  assert.equal(r.items[1].type, 'expense');
  assert.equal(r.items[1].recognized.type, true);
  assert.equal(parse('45 na lojinha', {today}).items[0].recognized.type, false);
});
