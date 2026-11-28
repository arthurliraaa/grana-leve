// Previsões de entrada: {description, amount, date, recurring, received: {mês: valor}, salary?} (salary: ver salary-plan.js).
import {monthKeyOf, daysInMonth, pad2} from './dates.js';
import {payDate, amountFor} from './salary-plan.js';
import {money, sumMoney} from './money.js';

// Ganhos fixos que a pessoa já recebeu antes naquele mês: o salário previsto do mês fica menor (não contar duas vezes).
function receivedBefore(plan, key){ return sumMoney(((plan.paid || {})[key] || []).filter(function(p){ return !p.varies; }), function(p){ return p.amount; }); }

// Uma previsão pode ser única ou repetir todo mês. No mês com menos dias, cai no último dia.
export function forecastOccurrences(forecasts, key){
  var out = [];
  forecasts.forEach(function(f){
    var fKey = monthKeyOf(f.date);
    var applies = f.recurring ? fKey <= key : fKey === key;
    if (!applies) return;
    var day = Math.min(Number(f.date.slice(8,10)), daysInMonth(Number(key.slice(0,4)), Number(key.slice(5,7))-1));
    // Previsão do salário (f.salary): a data segue a regra (dia do mês ou enésimo dia útil) e o valor segue os reajustes.
    var plan = f.salary && f.salary.rule ? f.salary : null;
    out.push({f: plan ? Object.assign({}, f, {amount: money(Math.max(0, amountFor(plan, key, f.amount) - receivedBefore(plan, key)))}) : f, date: plan ? payDate(plan.rule, key) : key + '-' + pad2(day), received: (f.received || {})[key]});
  });
  return out.sort(function(a,b){ return a.date.localeCompare(b.date); });
}
