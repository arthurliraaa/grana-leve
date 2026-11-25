// Vale-alimentação / refeição: {name, amount (crédito mensal), carryOver, initialBalance, startDate, creditDay (dia do mês em que o vale cai, opcional)}.
import {monthKeyOf, monthsBetween, daysInMonth, pad2, shiftMonthKey, parseDate} from './dates.js';
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

// Dia do mês (1 a 31) em que o vale cai, ou 0 se a pessoa não informou.
export function creditDay(v){ var d = Math.floor(Number(v && v.creditDay)); return d >= 1 && d <= 31 ? d : 0; }
// Data (AAAA-MM-DD) em que o vale cai no mês key (AAAA-MM). Em mês mais curto, cai no último dia. '' sem dia informado.
export function creditDate(v, key){
  var d = creditDay(v);
  if (!d) return '';
  return key + '-' + pad2(Math.min(d, daysInMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1)));
}
// Próxima vez que o vale cai (hoje conta): {date, days (quantos dias faltam)} ou null sem dia informado.
export function nextCredit(v, today){
  if (!creditDay(v)) return null;
  var date = creditDate(v, monthKeyOf(today));
  if (date < today) date = creditDate(v, shiftMonthKey(monthKeyOf(today), 1));
  return {date: date, days: Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / 86400000)};
}
