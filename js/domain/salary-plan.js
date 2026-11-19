/*
 * Plano do salário: quando ele cai (dia do mês ou enésimo dia útil), quanto vale em cada mês (com reajustes) e a
 * evolução do que foi recebido. Fica dentro de uma previsão de entrada (forecast.salary):
 *   salary: {rule, steps: [{from: 'AAAA-MM', gross, net}], months: {'AAAA-MM': {gross, net, extras, discounts, fgts, date}}, profile}
 *   profile: cópia do perfil da calculadora (salário, descontos, ganhos), para aparecer em outro aparelho
 *   rule: {type: 'day', day: 15} | {type: 'workday', n: 5, saturday: true}
 * Contas puras. Feriados não são conhecidos: a pessoa corrige a data na hora de confirmar que o dinheiro caiu.
 */
import {daysInMonth, pad2, monthNames} from './dates.js';
import {money} from './money.js';

// Dia do mês (1 a 31) do enésimo dia útil. month: 0 a 11. Sábado conta como dia útil para o pagamento do salário
// (Súmula 381 do TST); domingo nunca conta. Sem feriados.
export function nthWorkday(year, month, n, saturday){
  var want = Math.max(1, Math.floor(Number(n) || 1)), count = 0, last = daysInMonth(year, month);
  for (var d = 1; d <= last; d++){
    var w = new Date(year, month, d).getDay();
    if (w === 0 || (w === 6 && saturday === false)) continue;
    if (++count === want) return d;
  }
  return last;
}
// Data (AAAA-MM-DD) em que o salário cai no mês key (AAAA-MM).
export function payDate(rule, key){
  var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1, day;
  if (rule && rule.type === 'workday') day = nthWorkday(y, m, rule.n, rule.saturday);
  else day = Math.min(Math.max(1, Math.floor(Number(rule && rule.day) || 1)), daysInMonth(y, m));
  return key + '-' + pad2(day);
}
export function ruleLabel(rule){
  if (rule && rule.type === 'workday') return 'no ' + (Number(rule.n) || 1) + 'º dia útil';
  return 'todo dia ' + (Number(rule && rule.day) || 1);
}
// Passo do salário vigente no mês key: o último cujo “a partir de” já chegou (antes do primeiro, vale o primeiro).
export function stepFor(plan, key){
  var steps = (plan && plan.steps || []).slice().sort(function(a, b){ return a.from.localeCompare(b.from); }), cur = steps[0] || null;
  steps.forEach(function(s){ if (s.from <= key) cur = s; });
  return cur;
}
export function amountFor(plan, key, fallback){ var s = stepFor(plan, key); return s ? money(s.net) : money(fallback || 0); }
// Variação entre dois valores, em %, com uma casa.
export function changePct(prev, cur){ return prev > 0 ? Math.round((cur - prev) / prev * 1000) / 10 : 0; }
// Evolução mês a mês: o que foi recebido (líquido), o bruto e se houve reajuste (bruto maior que o do mês anterior).
export function evolution(plan){
  var rows = [], prev = null;
  Object.keys(plan && plan.months || {}).sort().forEach(function(key){
    var m = plan.months[key], row = {key: key, gross: money(m.gross), net: money(m.net), extras: money(m.extras || 0), discounts: money(m.discounts || 0), date: m.date || '',
      netChange: prev ? changePct(prev.net, money(m.net)) : 0, grossChange: prev ? changePct(prev.gross, money(m.gross)) : 0};
    row.raise = !!prev && row.gross > prev.gross + 0.004;
    rows.push(row); prev = row;
  });
  return rows;
}
// Reajustes (mudanças do salário base), do mais antigo ao mais recente.
export function raises(plan){
  var steps = (plan && plan.steps || []).slice().sort(function(a, b){ return a.from.localeCompare(b.from); }), out = [];
  for (var i = 1; i < steps.length; i++){
    if (Math.abs(steps[i].gross - steps[i - 1].gross) > 0.004) out.push({from: steps[i].from, before: steps[i - 1].gross, after: steps[i].gross, pct: changePct(steps[i - 1].gross, steps[i].gross), net: steps[i].net});
  }
  return out;
}
// Registra um passo novo quando o bruto ou o líquido fixo mudaram em relação ao vigente no mês.
export function withStep(plan, key, gross, net){
  var cur = stepFor(plan, key), steps = (plan.steps || []).filter(function(s){ return s.from !== key; });
  if (cur && Math.abs(cur.gross - gross) < 0.005 && Math.abs(cur.net - net) < 0.005) return plan;
  steps.push({from: key, gross: money(gross), net: money(net)});
  return Object.assign({}, plan, {steps: steps.sort(function(a, b){ return a.from.localeCompare(b.from); })});
}
export function monthName(key){ return monthNames[Number(key.slice(5, 7)) - 1] + '/' + key.slice(0, 4); }
