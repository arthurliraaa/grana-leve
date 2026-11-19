// Previsões de entrada: {description, amount, date, recurring, received: {mês: valor}, salary?} (salary: ver salary-plan.js).
import {monthKeyOf, daysInMonth, pad2} from './dates.js';
import {payDate, amountFor} from './salary-plan.js';

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
    out.push({f: plan ? Object.assign({}, f, {amount: amountFor(plan, key, f.amount)}) : f, date: plan ? payDate(plan.rule, key) : key + '-' + pad2(day), received: (f.received || {})[key]});
  });
  return out.sort(function(a,b){ return a.date.localeCompare(b.date); });
}
