import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthOthers, expenseCategoryTotals, monthTotals} from '../../js/domain/transactions.js';

// Mercado meu, ingresso pago para a Maria e jantar dividido (100 meus + 100 do João).
const list = [
  {id: 'a', type: 'expense', amount: 50, category: 'alimentacao', date: '2026-10-02'},
  {id: 'b', type: 'expense', amount: 100, category: 'lazer', date: '2026-10-03', forOther: {person: 'Maria'}},
  {id: 'c', type: 'expense', amount: 200, category: 'alimentacao', date: '2026-10-04', split: {total: 200, mine: 100, people: [{person: 'João', amount: 100}]}},
  {id: 'd', type: 'expense', amount: 80, category: 'lazer', date: '2026-10-20'}
];

test('o que é de outras pessoas no mês: pago por elas e a parte delas nas divididas', () => {
  assert.equal(monthOthers(list, '2026-10'), 200);
  assert.equal(monthOthers(list, '2026-10', '2026-10-03'), 100, 'só até a data dada');
  assert.equal(monthOthers(list, '2026-09'), 0);
});

test('“não vai devolver” vira gasto seu e sai da parte de outras pessoas (não conta duas vezes)', () => {
  const l = list.concat([{id: 'w', type: 'expense', amount: 40, category: 'lazer', date: '2026-10-05', writeOff: true, paymentMethod: null}]);
  assert.equal(monthOthers(l, '2026-10'), 160);
});

test('categorias: só o que é meu, ou tudo (inclusive o de outras pessoas)', () => {
  assert.deepEqual(expenseCategoryTotals(list, '2026-10'), {alimentacao: 150, lazer: 80});
  assert.deepEqual(expenseCategoryTotals(list, '2026-10', true), {alimentacao: 250, lazer: 180});
});

test('o total gasto é o meu mais o de outras pessoas', () => {
  const t = monthTotals(list, '2026-10', '2026-10-31');
  assert.equal(t.expense + monthOthers(list, '2026-10'), 430);
});

test('compra dividida parcelada: as partes por parcela fecham com split.mine (A2-09)', async () => {
  const {expandPurchase, myShare, othersShare, splitShares, splitEqual} = await import('../../js/domain/transactions.js');
  const {sumMoney} = await import('../../js/domain/money.js');
  function parcels(total, n, others){
    const parts = expandPurchase({type: 'expense', paymentMethod: 'cartao', cardId: 'c', amount: total, date: '2026-11-01', createdAt: 1, category: 'x'}, n, 'g', 'C', 1);
    const sh = splitShares(total, [{person: 'Ana', value: others}], false);
    parts.forEach(p => { p.split = {total, mine: sh.mine, people: [{person: 'Ana', amount: sh.others}]}; });
    return {parts, mine: sh.mine};
  }
  let {parts, mine} = parcels(100, 3, 50);
  assert.equal(sumMoney(parts, myShare), 50);
  assert.equal(sumMoney(parts, othersShare), 50);
  assert.deepEqual(parts.map(myShare), [16.68, 16.66, 16.66]);
  ({parts, mine} = parcels(99.99, 7, 66.66)); // 1/3 é seu
  assert.equal(mine, 33.33);
  assert.equal(sumMoney(parts, myShare), 33.33);
  assert.equal(sumMoney(parts, othersShare), 66.66);
  // Parcela editada (valor fora do padrão) e compra à vista: proporcional, como antes.
  const edited = {...parts[1], amount: 20, installment: {...parts[1].installment, totalAmount: 105.7}};
  assert.equal(myShare(edited), Math.round(20 * 33.33 / 99.99 * 100) / 100);
  assert.equal(myShare({type: 'expense', amount: 100, date: '2026-10-10', split: {total: 300, mine: 100, people: []}}), 33.33);
  // Dividir igualmente, em centavos inteiros.
  assert.deepEqual(splitEqual(2.26, 2), [1.13, 1.13]);
  assert.deepEqual(splitEqual(100, 3), [33.34, 33.33, 33.33]);
  assert.deepEqual(splitEqual(20.1, 2), [10.05, 10.05]);
});

test('adiantamento de compra dividida: a sua parte fecha com split.mine (S5)', async () => {
  const {expandPurchase, myShare, othersShare, advanceShare, advanceFields} = await import('../../js/domain/transactions.js');
  const {money} = await import('../../js/domain/money.js');
  const parts = expandPurchase({type: 'expense', paymentMethod: 'cartao', cardId: 'c', amount: 100, date: '2026-11-01', createdAt: 1, category: 'x'}, 3, 'g', 'C', 1);
  parts.forEach(p => { p.split = {total: 100, mine: 50, people: [{person: 'Ana', receivableId: 'r1', amount: 50}]}; });
  const group = {items: parts};
  assert.equal(myShare(parts[0]), 16.68);
  // Sem desconto: 66,66 pagos; sua parte 33,32 (não 33,33), e 16,68 + 33,32 = 50.
  assert.equal(advanceShare(group, [2, 3]), 33.32);
  assert.equal(advanceShare(group, [2, 3], 66.66), 33.32);
  let adv = {type: 'expense', amount: 66.66, date: '2026-11-07', ...advanceFields(group, [2, 3], 66.66)};
  assert.equal(money(myShare(parts[0]) + myShare(adv)), 50);
  assert.equal(money(othersShare(parts[0]) + othersShare(adv)), 50);
  assert.equal(adv.split.people[0].amount, 33.34);
  assert.equal(adv.split.people[0].receivableId, 'r1');
  // Com desconto: proporcional ao pago, e sua parte + a das outras pessoas = pago.
  assert.equal(advanceShare(group, [2, 3], 60), 29.99);
  adv = {type: 'expense', amount: 60, date: '2026-11-07', ...advanceFields(group, [2, 3], 60)};
  assert.equal(myShare(adv), 29.99);
  assert.equal(money(myShare(adv) + othersShare(adv)), 60);
  assert.equal(adv.split.people[0].amount, 30.01);
  // Uma parcela, depois a outra (a já adiantada conta pela parte padrão).
  assert.equal(advanceShare(group, [3]), 16.66);
  assert.equal(advanceShare(parts.slice(0, 2), [2]), 16.66);
  // Paga por outra pessoa: nada é seu; sem divisão: tudo.
  const fo = parts.map(p => ({...p, split: undefined, forOther: {person: 'Ana', receivableId: 'r2'}}));
  assert.equal(advanceShare(fo, [2, 3]), 0);
  assert.deepEqual(advanceFields(fo, [2, 3]), {forOther: {person: 'Ana', receivableId: 'r2'}});
  const plain = parts.map(p => ({...p, split: undefined}));
  assert.equal(advanceShare(plain, [2, 3], 60), 60);
  assert.deepEqual(advanceFields(plain, [2, 3], 60), {});
});
