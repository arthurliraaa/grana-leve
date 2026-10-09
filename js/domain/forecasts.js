// Previsões de entrada: {description, amount, date, recurring, received: {mês: valor}}.
import {monthKeyOf, daysInMonth, pad2} from './dates.js';

// Uma previsão pode ser única ou repetir todo mês. No mês com menos dias, cai no último dia.
export function forecastOccurrences(forecasts, key){
  var out = [];
  forecasts.forEach(function(f){
    var fKey = monthKeyOf(f.date);
    var applies = f.recurring ? fKey <= key : fKey === key;
    if (!applies) return;
    var day = Math.min(Number(f.date.slice(8,10)), daysInMonth(Number(key.slice(0,4)), Number(key.slice(5,7))-1));
    out.push({f: f, date: key + '-' + pad2(day), received: (f.received || {})[key]});
  });
  return out.sort(function(a,b){ return a.date.localeCompare(b.date); });
}
