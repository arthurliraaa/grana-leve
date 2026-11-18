/*
 * Simulador: "se eu fizer isso, como ficam as minhas contas?". Só contas, nada é salvo.
 * months: [{key, label, out, inc}] a partir do mês atual: o que já está assumido para sair (faturas suas,
 * contas fixas, parcelas de dívidas) e o que está previsto para entrar. cash = o que há nas contas hoje.
 * adds: {deslocamento do mês: valor que sai a mais}. inflowNow: dinheiro que entra já (ex.: empréstimo recebido).
 */
import {money} from './money.js';
import {goalSummary} from './goals.js';

// Como fica cada mês sem e com a simulação. Por padrão (carry = false) cada mês é visto sozinho: o que entra menos o
// que sai naquele mês, sem somar o que sobrou ou faltou nos anteriores; só o primeiro mês parte do que há nas contas
// hoje. Com carry = true, o que sobra de um mês segue para o outro (saldo acumulado).
export function projectCash(cash, months, adds, inflowNow, carry){
  var base = Number(cash) || 0, sim = base + (Number(inflowNow) || 0), rows = [];
  months.forEach(function(m, i){
    var extra = Number((adds || {})[i]) || 0, net = (m.inc || 0) - (m.out || 0);
    if (!carry && i > 0){ base = 0; sim = 0; }
    base = money(base + net);
    sim = money(sim + net - extra);
    rows.push({key: m.key, label: m.label, out: money(m.out || 0), inc: money(m.inc || 0), added: money(extra), base: base, sim: sim, diff: money(sim - base)});
  });
  return rows;
}
// Primeiro mês em que a simulação deixa o saldo negativo (e o saldo não era negativo antes): {label, sim} ou null.
export function firstRedMonth(rows){
  for (var i = 0; i < rows.length; i++) if (rows[i].sim < -0.004) return {label: rows[i].label, sim: rows[i].sim, wasRed: rows[i].base < -0.004};
  return null;
}
// Parcelas de uma compra: n parcelas, a 1ª leva os centavos que sobram.
export function splitInstallments(total, n){
  var c = Math.round(total * 100), per = Math.floor(c / n), out = [];
  for (var i = 0; i < n; i++) out.push((per + (i === 0 ? c - per * n : 0)) / 100);
  return out;
}
// Usar dinheiro guardado numa meta: quanto sobra nela, quanto da meta isso é e quanto tempo leva para repor.
export function goalUseImpact(g, amount, today){
  var cur = Number(g.currentAmount) || 0, T = Number(g.targetAmount) || 0, pace = goalSummary(g, today).pace;
  var after = money(Math.max(0, cur - amount));
  return {current: cur, after: after, shortfall: amount > cur + 0.004 ? money(amount - cur) : 0, hasTarget: T > 0,
    pctBefore: T > 0 ? Math.round(100 * cur / T) : null, pctAfter: T > 0 ? Math.round(100 * after / T) : null,
    pace: pace, monthsToRefill: pace > 0 ? Math.ceil(amount / pace) : null, targetDate: g.targetDate || null};
}
