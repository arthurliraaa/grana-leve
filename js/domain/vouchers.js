// Vale-alimentação / refeição: {name, amount (crédito mensal), carryOver, initialBalance, startDate}.
import {monthKeyOf, monthsBetween} from './dates.js';
import {money, sumMoney} from './money.js';
import {findById} from './util.js';

// Gastos antigos com "vale" sem vale cadastrado contam no primeiro vale.
export function voucherOf(t, vouchers){
  if (t.voucherId) return findById(vouchers, t.voucherId);
  return vouchers[0] || null;
}
export function voucherTx(v, list, vouchers){
  return list.filter(function(t){
    if (t.type !== 'expense' || t.paymentMethod !== 'vale') return false;
    var o = voucherOf(t, vouchers);
    return !!o && o.id === v.id;
  });
}
// Saldo: com acúmulo, parte do saldo informado (ou do primeiro crédito) e soma um crédito por mês;
// sem acúmulo, é o crédito do mês menos o que foi gasto no mês.
export function voucherBalance(v, list, vouchers, today){
  var cur = monthKeyOf(today);
  var all = voucherTx(v, list, vouchers);
  if (!v.carryOver){
    return money(Number(v.amount) - sumMoney(all.filter(function(t){ return monthKeyOf(t.date) === cur; }), function(t){ return t.amount; }));
  }
  var start = v.startDate || today;
  var base = v.initialBalance !== null && v.initialBalance !== undefined && v.initialBalance !== '' ? Number(v.initialBalance) : Number(v.amount);
  var credits = base + Number(v.amount) * Math.max(0, monthsBetween(monthKeyOf(start), cur));
  var spent = sumMoney(all.filter(function(t){ return t.date >= start; }), function(t){ return t.amount; });
  return money(credits - spent);
}
