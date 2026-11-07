/*
 * A receber: {person, kind, totalAmount, receivedAmount, dueDate, installments?, installmentAmount?}.
 * Parcelado: as parcelas recebidas contam pelo total que já entrou; a próxima vence um mês
 * depois da anterior, a partir de dueDate (1ª parcela). Os centavos que sobram da divisão vão na
 * 1ª parcela, como nas compras do cartão (100 em 3x = 33,34 + 33,33 + 33,33).
 */
import {addMonthsIso} from './dates.js';
import {money, toCents, fromCents} from './money.js';

// forgiven: a pessoa não vai devolver o que faltava (fica registrado, mas não está mais "a receber").
export function recvRemaining(r){ return r.forgiven ? 0 : money(Math.max(0, Number(r.totalAmount || 0) - Number(r.receivedAmount || 0))); }
// Receber de volta um empréstimo ou um gasto pago pela pessoa é devolução, não ganho.
export function recvDefaultRefund(r){ return !!(r.linked || r.kind === 'emprestimo' || r.kind === 'cartao'); }

// Parcelas padrão de um "A receber" de `total` em `n`x, em reais, calculadas em centavos inteiros:
// a sobra da divisão fica na 1ª. É a "parcela padrão" que a UI deve sugerir (recvParts(t, n)[n-1]).
export function recvParts(total, n){
  n = Math.max(1, Math.round(Number(n)) || 1);
  var cents = Math.max(0, toCents(total)), base = Math.floor(cents / n), out = [];
  for (var i = 0; i < n; i++) out.push(fromCents(i === 0 ? cents - base * (n - 1) : base));
  return out;
}
// Parcelas deste "A receber". Com installmentAmount gravado, ele vale para as parcelas 2..n e a 1ª
// fica com o que sobra do total (como nas compras do cartão); sem ele, recvParts.
function partsOf(r, n){
  var total = toCents(r.totalAmount), per = toCents(r.installmentAmount);
  if (per > 0){
    var first = total - per * (n - 1);
    if (first > 0){
      var out = [fromCents(first)];
      for (var i = 1; i < n; i++) out.push(fromCents(per));
      return out;
    }
  }
  return recvParts(r.totalAmount, n);
}
// Parcelas já recebidas, pelo total que entrou. Registros antigos foram recebidos com todas as
// parcelas iguais (100 em 3x: 33,33 por vez, sem a sobra na 1ª); por isso a parcela i (< n) conta
// como recebida quando got ≥ soma(parts[0..i−1]) − sobra, sendo sobra = parts[0] − parts[n−1]. A sobra
// só é exigida para quitar a última: a quitação total continua pedindo o total.
// Devolve {paid, got, cum: [soma acumulada em centavos], extra: sobra em centavos}.
function paidCount(parts, received){
  var n = parts.length, got = toCents(received || 0), extra = Math.max(0, toCents(parts[0]) - toCents(parts[n - 1]));
  var cum = [0], paid = 0;
  for (var i = 0; i < n; i++) cum.push(cum[i] + toCents(parts[i]));
  while (paid < n && got >= (paid + 1 === n ? cum[n] : cum[paid + 1] - extra)) paid++;
  return {paid: paid, got: got, cum: cum, extra: extra};
}
// Centavos que ainda faltam para ter recebido as parcelas 1..j. Quem já pagou a sobra da 1ª (got ≥ soma
// das parcelas quitadas) segue pelas parcelas cheias; registro antigo, a sobra fica para a última.
function owedThrough(p, j){
  var n = p.cum.length - 1, target = p.cum[j];
  if (j < n && p.got < p.cum[p.paid]) target -= p.extra;
  return Math.max(0, target - p.got);
}

// per: valor de cada parcela (a 1ª pode ter alguns centavos a mais; ver recvNextAmount).
export function recvInstallInfo(r){
  var n = Number(r.installments) || 1;
  if (n <= 1) return null;
  var parts = partsOf(r, n), paid = paidCount(parts, r.receivedAmount).paid;
  return {n: n, per: parts[n - 1], paid: paid, next: Math.min(n, paid + 1), nextDue: r.dueDate ? addMonthsIso(r.dueDate, paid) : null};
}
// Quanto falta da próxima parcela (descontando o que já entrou dela). Sem parcelas: o que falta.
export function recvNextAmount(r){
  var left = recvRemaining(r), n = Number(r.installments) || 1;
  if (n <= 1 || !(left > 0)) return left;
  var p = paidCount(partsOf(r, n), r.receivedAmount);
  if (p.paid >= n) return left;
  return money(Math.min(left, fromCents(owedThrough(p, p.paid + 1))));
}
export function recvNextDue(r){ var i = recvInstallInfo(r); return i ? i.nextDue : r.dueDate; }
// Quanto cobrar "do mês" `key` (AAAA-MM): parceladas, as parcelas com vencimento até o fim do mês
// ainda não recebidas (inclui atrasadas; desconta o que já entrou da parcela atual); sem parcelas,
// o que falta se o combinado vence até o fim do mês (ou não tem data). Nunca passa do que falta.
export function recvDueByMonth(r, key){
  var left = recvRemaining(r);
  if (!(left > 0)) return 0;
  var end = key + '-31', n = Number(r.installments) || 1;
  if (n <= 1) return !r.dueDate || r.dueDate <= end ? left : 0;
  if (!r.dueDate) return recvNextAmount(r);
  var p = paidCount(partsOf(r, n), r.receivedAmount), j = p.paid;
  while (j < n && addMonthsIso(r.dueDate, j) <= end) j++;
  return j > p.paid ? money(Math.min(left, fromCents(owedThrough(p, j)))) : 0;
}
// Parcelas que vencem até o fim do mês e ainda não foram recebidas (para o texto da cobrança).
export function recvDueCount(r, key){
  var info = recvInstallInfo(r);
  if (!info || !r.dueDate || !(recvRemaining(r) > 0)) return info && recvRemaining(r) > 0 ? 1 : 0;
  var count = 0;
  for (var i = info.paid; i < info.n && addMonthsIso(r.dueDate, i) <= key + '-31'; i++) count++;
  return count;
}
