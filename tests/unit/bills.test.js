import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billAmountFor, billOccurs, billDueDate, billOccurrences, billsMonthSummary, billNext} from '../../js/domain/bills.js';
import {shiftMonthKey} from '../../js/domain/dates.js';

const luz = {id: 'b1', name: 'Luz', amount: 120, every: 1, dueDay: 31, startMonth: '2026-09'};
const ipva = {id: 'b2', name: 'Seguro', amount: 600, every: 6, dueDay: 10, startMonth: '2026-08'};

test('em quais meses a conta vence', () => {
  assert.equal(billOccurs(luz, '2026-08'), false, 'antes de começar');
  assert.equal(billOccurs(luz, '2026-09'), true);
  assert.equal(billOccurs(luz, '2027-03'), true);
  assert.equal(billOccurs(ipva, '2026-08'), true);
  assert.equal(billOccurs(ipva, '2026-11'), false);
  assert.equal(billOccurs(ipva, '2027-02'), true, 'a cada 6 meses');
  assert.equal(billOccurs({...luz, endMonth: '2026-10'}, '2026-11'), false, 'encerrada');
});

test('vencimento em mês mais curto cai no último dia', () => {
  assert.equal(billDueDate(luz, '2026-09'), '2026-09-30');
  assert.equal(billDueDate(luz, '2027-02'), '2027-02-28');
});

test('mudar o valor vale a partir do mês escolhido', () => {
  const b = {...luz, amounts: [{from: '2026-11', amount: 150}, {from: '2027-01', amount: 140}]};
  assert.equal(billAmountFor(b, '2026-10'), 120);
  assert.equal(billAmountFor(b, '2026-11'), 150);
  assert.equal(billAmountFor(b, '2026-12'), 150);
  assert.equal(billAmountFor(b, '2027-05'), 140);
});

test('vencimentos do mês, situação e resumo', () => {
  const paid = {...luz, id: 'b3', name: 'Internet', amount: 100, dueDay: 5, paid: {'2026-10': {txId: 't1', amount: 99.9, date: '2026-10-04'}}};
  const occ = billOccurrences([luz, paid, ipva], '2026-10', '2026-10-27', () => true);
  assert.deepEqual(occ.map(o => [o.b.name, o.status, o.amount]), [['Internet', 'paga', 99.9], ['Luz', 'logo', 120]]);
  assert.deepEqual(billOccurrences([luz], '2026-10', '2026-11-02').map(o => o.status), ['atrasada']);
  assert.deepEqual(billsMonthSummary(occ), {count: 2, total: 219.9, paid: 99.9, pending: 120, late: 0});
  const gone = billOccurrences([paid], '2026-10', '2026-10-27', () => false);
  assert.equal(gone[0].paid, null, 'pagamento cujo gasto foi excluído volta a ficar em aberto');
});

test('próximo vencimento pula os já pagos', () => {
  const b = {...ipva, paid: {'2026-08': {txId: 'x', amount: 600}}};
  assert.deepEqual(billNext(b, '2026-08', shiftMonthKey), {key: '2027-02', date: '2027-02-10', amount: 600});
});
