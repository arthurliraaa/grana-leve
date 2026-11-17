/*
 * Metas: movimentações, rendimento e previsões.
 * {id, name, targetAmount, currentAmount, targetDate?, yieldRate? (% ao ano), createdAt,
 *  moves?: [{id, date 'AAAA-MM-DD', amount, kind: 'deposit' | 'yield' | 'withdraw'}]}
 * currentAmount continua sendo o saldo da meta; moves é o histórico que permite calcular o ritmo.
 * Metas antigas (sem moves) contam o que já estava guardado como um depósito na data de criação.
 *
 * Contas (juros compostos, mês a mês, depósito no fim de cada mês):
 *   taxa do mês        r = (1 + a)^(1/12) − 1          (a = taxa ao ano; 10% a.a. ≈ 0,797% a.m.)
 *   saldo depois de n  S(n) = C·(1+r)^n + P·((1+r)^n − 1)/r      (sem rendimento: C + P·n)
 *   para chegar em T   P = (T − C·(1+r)^n) · r / ((1+r)^n − 1)    (sem rendimento: (T − C)/n)
 *   meses até T        n = ln((T + P/r)/(C + P/r)) / ln(1+r)       (sem rendimento: (T − C)/P)
 */
import {money, sumMoney, toCents, fromCents} from './money.js';
import {monthsBetween} from './dates.js';

// Meta "só juntar": sem valor alvo (targetAmount 0). Nunca fica concluída nem tem "quanto falta".
export function hasTarget(g){ return Number(g && g.targetAmount) > 0; }

export function monthlyRate(yearPct){
  var a = Number(yearPct) / 100;
  return a > 0 ? Math.pow(1 + a, 1 / 12) - 1 : 0;
}
// Saldo depois de n meses guardando P por mês, com rendimento r ao mês.
export function futureValue(C, P, r, n){
  if (!(n > 0)) return C;
  if (!r) return C + P * n;
  var g = Math.pow(1 + r, n);
  return C * g + P * (g - 1) / r;
}
// Quanto guardar por mês para chegar em T em n meses (0 se o que já tem, rendendo, já basta).
export function monthlyNeeded(T, C, r, n){
  if (!(n > 0)) return Math.max(0, T - C);
  var need = r ? (T - C * Math.pow(1 + r, n)) * r / (Math.pow(1 + r, n) - 1) : (T - C) / n;
  return Math.max(0, need);
}
// Meses até chegar em T guardando P por mês (Infinity se nunca chega).
export function monthsToTarget(T, C, P, r){
  if (C >= T) return 0;
  if (!r) return P > 0 ? (T - C) / P : Infinity;
  if (P <= 0 && C <= 0) return Infinity;
  var k = P / r;
  return Math.log((T + k) / (C + k)) / Math.log(1 + r);
}

// Movimentações da meta, em ordem de data (com a conta antiga convertida).
export function goalMoves(g){
  if (Array.isArray(g.moves) && g.moves.length) return g.moves.slice().sort(function(a, b){ return a.date.localeCompare(b.date); });
  var c = Number(g.currentAmount) || 0;
  return c > 0 ? [{id: 'inicial', date: g.createdAt ? isoDay(g.createdAt) : '', amount: c, kind: 'deposit', legacy: true}] : [];
}
function isoDay(ts){ var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function signed(m){ return m.kind === 'withdraw' ? -Number(m.amount) : Number(m.amount); }

// Resumo: quanto foi guardado (depósitos − retiradas), quanto rendeu e o ritmo de depósitos por mês.
// O ritmo é a média dos últimos 3 meses de calendário (ou desde o 1º depósito, se a meta é mais nova).
// O mês atual só entra na conta se já teve depósito (no dia 3, ainda não guardar não baixa a média).
export function goalSummary(g, today){
  var moves = goalMoves(g);
  var deposited = sumMoney(moves.filter(function(m){ return m.kind !== 'yield'; }), signed);
  var earned = sumMoney(moves.filter(function(m){ return m.kind === 'yield'; }), signed);
  var monthKey = today.slice(0, 7);
  var since = shiftKey(monthKey, -2) + '-01';
  var first = moves.filter(function(m){ return m.kind === 'deposit' && !m.legacy; })[0];
  var start = first && first.date > since ? first.date : since;
  var recent = moves.filter(function(m){ return m.kind !== 'yield' && m.date >= start && !m.legacy; });
  var thisMonth = recent.some(function(m){ return m.date.slice(0, 7) === monthKey; });
  var months = Math.max(1, monthsBetween(start.slice(0, 7), monthKey) + (thisMonth ? 1 : 0));
  var pace = recent.length ? money(Math.max(0, sumMoney(recent, signed)) / months) : 0;
  return {current: money(Number(g.currentAmount) || 0), deposited: deposited, earned: earned, pace: pace, paceMonths: months, moves: moves};
}
function shiftKey(key, n){
  var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
// Meses (com fração) entre hoje e o prazo: 15/out → 15/dez = 2.
export function monthsUntil(today, dateKey){
  var a = new Date(today + 'T12:00:00'), b = new Date(dateKey + 'T12:00:00');
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30);
}
// Data aproximada daqui a n meses (com fração).
export function dateAfterMonths(today, n){
  var a = new Date(today + 'T12:00:00'), whole = Math.floor(n);
  var d = new Date(a.getFullYear(), a.getMonth() + whole, a.getDate());
  d.setDate(d.getDate() + Math.round((n - whole) * 30));
  return isoDay(d.getTime());
}

// Previsão da meta: o que falta, quanto guardar por mês para o prazo, quando acaba no ritmo atual e
// quanto terá no prazo. Valores arredondados para centavos; months com uma casa.
export function goalForecast(g, today){
  var s = goalSummary(g, today), T = Number(g.targetAmount) || 0, C = s.current, r = monthlyRate(g.yieldRate);
  if (!hasTarget(g)){
    // Sem alvo: só o ritmo e, havendo prazo, quanto terá nele guardando no mesmo ritmo.
    var open = {summary: s, target: 0, left: 0, rate: r, done: false, openEnded: true};
    if (g.targetDate && g.targetDate > today){
      var nm = monthsUntil(today, g.targetDate);
      open.deadlineMonths = Math.round(nm * 10) / 10;
      open.atDeadline = money(futureValue(C, s.pace, r, nm));
    }
    return open;
  }
  var out = {summary: s, target: T, left: money(Math.max(0, T - C)), rate: r, done: C >= T};
  if (out.done) return out;
  if (g.targetDate && g.targetDate > today){
    var n = monthsUntil(today, g.targetDate);
    out.deadlineMonths = Math.round(n * 10) / 10;
    out.needed = money(monthlyNeeded(T, C, r, n));
    out.atDeadline = money(futureValue(C, s.pace, r, n));
    out.onTrack = out.atDeadline + 0.005 >= T;
    // Quanto do que terá no prazo vem do rendimento (guardando o necessário).
    out.yieldUntilDeadline = r ? money(Math.max(0, T - C - out.needed * n)) : 0;
  }
  var m = monthsToTarget(T, C, s.pace, r);
  if (isFinite(m)){
    out.monthsToGo = Math.round(m * 10) / 10;
    out.finishDate = dateAfterMonths(today, m);
  }
  return out;
}
// Para testes: simula mês a mês (rende e depois deposita) e devolve o saldo.
export function simulate(C, P, r, n){
  var c = toCents(C);
  for (var i = 0; i < n; i++) c = Math.round(c * (1 + r)) + toCents(P);
  return fromCents(c);
}
