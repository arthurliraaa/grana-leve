// Vale-alimentação / refeição: {name, amount (crédito mensal), carryOver, initialBalance, startDate, creditDay (dia do mês em que o vale cai, opcional),
// credited: {mês: 'AAAA-MM-DD' (a pessoa disse que caiu nesse dia) | false (a pessoa disse que ainda não caiu)}}.
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
// O vale segue o dia em que cai (ou o que a pessoa marcou) quando tem dia informado ou alguma marcação; senão, o crédito vale desde o dia 1.
export function tracksCredit(v){ return creditDay(v) > 0 || Object.keys((v && v.credited) || {}).length > 0; }
// Em que dia o crédito do mês key já caiu (até hoje), ou '' se ainda não caiu.
export function creditedOn(v, key, today){
  var mark = ((v && v.credited) || {})[key];
  if (mark === false) return '';
  if (typeof mark === 'string' && mark) return mark <= today ? mark : '';
  var date = creditDay(v) ? creditDate(v, key) : key + '-01';
  return date <= today ? date : '';
}
function trackedBalance(v, all, today){
  var cur = monthKeyOf(today), hasInitial = v.initialBalance !== null && v.initialBalance !== undefined && v.initialBalance !== '', start = v.startDate || today;
  function spentSince(date){ return sumMoney(all.filter(function(t){ return t.date >= date && (v.carryOver || monthKeyOf(t.date) <= cur); }), function(t){ return t.amount; }); }
  if (v.carryOver){
    // Soma um crédito por mês que já caiu. Com saldo informado, só o que caiu depois dele (o informado já inclui o que veio antes).
    var count = 0;
    for (var m = monthKeyOf(start); m <= shiftMonthKey(cur, 1); m = shiftMonthKey(m, 1)){
      var d = creditedOn(v, m, today), marked = typeof (v.credited || {})[m] === 'string';
      if (d && (!hasInitial || (marked ? d >= start : d > start))) count++;
    }
    return money((hasInitial ? Number(v.initialBalance) : 0) + Number(v.amount) * count - spentSince(start));
  }
  // Sem acúmulo: o crédito que vale agora é o último que caiu; o que sobra do anterior continua até o próximo cair.
  var latest = '', latestMarked = false;
  for (var i = -2; i <= 1; i++){
    var key = shiftMonthKey(cur, i), on = creditedOn(v, key, today);
    if (on && on > latest){ latest = on; latestMarked = typeof (v.credited || {})[key] === 'string'; }
  }
  if (hasInitial && v.startDate && (!latest || (latestMarked ? latest < start : latest <= start))) return money(Number(v.initialBalance) - spentSince(start));
  if (latest) return money(Number(v.amount) - spentSince(latest));
  return money(-spentSince(cur + '-01'));
}
// Saldo: com acúmulo, parte do saldo informado (ou do primeiro crédito) e soma um crédito por mês;
// sem acúmulo, é o crédito do mês menos o que foi gasto no mês. Com o dia em que cai (ou marcação), o crédito só conta depois de cair.
export function voucherBalance(v, list, vouchers, today){
  var cur = monthKeyOf(today);
  var all = voucherTx(v, list, vouchers);
  if (tracksCredit(v)) return trackedBalance(v, all, today);
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
