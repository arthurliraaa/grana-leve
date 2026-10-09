import {test} from 'node:test';
import assert from 'node:assert/strict';
import {money, toCents, sumMoney, splitAmount, fmtMoney} from '../../js/domain/money.js';
import {validDateStr, addMonthsIso, monthsBetween, shiftMonthKey, monthBounds, formatDateFull} from '../../js/domain/dates.js';

test('money arredonda para centavos e trata valores inválidos', () => {
  assert.equal(money(10.005), 10.01);
  assert.equal(money('32.5'), 32.5);
  assert.equal(money('abc'), 0);
  assert.equal(money(Infinity), 0);
  assert.equal(toCents(19.99), 1999);
});

test('somas em centavos não acumulam erro de ponto flutuante', () => {
  assert.equal(0.1 + 0.2 === 0.3, false); // o problema que a soma em centavos evita
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney(Array(10).fill(0.1)), 1);
  assert.equal(sumMoney([{a: 19.99}, {a: 0.01}], x => x.a), 20);
});

test('splitAmount divide em parcelas e deixa a sobra na 1ª', () => {
  assert.deepEqual(splitAmount(100, 3), [33.34, 33.33, 33.33]);
  assert.deepEqual(splitAmount(1000, 3), [333.34, 333.33, 333.33]);
  assert.equal(sumMoney(splitAmount(99.99, 7)), 99.99);
  assert.deepEqual(splitAmount(50, 1), [50]);
});

test('fmtMoney formata em reais', () => {
  assert.match(fmtMoney(1234.5), /R\$\s?1\.234,50/);
  assert.match(fmtMoney(-120), /-R\$\s?120,00/);
});

test('validDateStr aceita vazio e recusa datas impossíveis', () => {
  assert.equal(validDateStr(''), true);
  assert.equal(validDateStr('2026-10-08'), true);
  assert.equal(validDateStr('2026-02-30'), false);
  assert.equal(validDateStr('1899-12-31'), false);
  assert.equal(validDateStr('08/10/2026'), false);
});

test('addMonthsIso usa o último dia quando o mês é mais curto', () => {
  assert.equal(addMonthsIso('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsIso('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonthsIso('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonthsIso('2026-03-31', -1), '2026-02-28');
});

test('contas com meses', () => {
  assert.equal(monthsBetween('2026-10', '2027-01'), 3);
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(monthBounds(-1, new Date(2026, 0, 15)).key, '2025-12');
  assert.equal(monthBounds(0, new Date(2026, 9, 8)).label, 'outubro de 2026');
  assert.equal(formatDateFull('2026-10-08'), '08/10/2026');
});
