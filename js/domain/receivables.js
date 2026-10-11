/*
 * A receber: {person, kind, totalAmount, receivedAmount, dueDate, installments?, installmentAmount?}.
 * Parcelado: as parcelas recebidas contam pelo total que já entrou; a próxima vence um mês
 * depois da anterior, a partir de dueDate (1ª parcela).
 */
import {addMonthsIso} from './dates.js';
import {money, toCents} from './money.js';

// forgiven: a pessoa não vai devolver o que faltava (fica registrado, mas não está mais "a receber").
export function recvRemaining(r){ return r.forgiven ? 0 : money(Math.max(0, Number(r.totalAmount || 0) - Number(r.receivedAmount || 0))); }
// Receber de volta um empréstimo ou um gasto pago pela pessoa é devolução, não ganho.
export function recvDefaultRefund(r){ return !!(r.linked || r.kind === 'emprestimo' || r.kind === 'cartao'); }
export function recvInstallInfo(r){
  var n = Number(r.installments) || 1;
  if (n <= 1) return null;
  var per = Number(r.installmentAmount) || money(Number(r.totalAmount) / n);
  var paid = Math.min(n, Math.floor(toCents(r.receivedAmount || 0) / toCents(per)));
  return {n: n, per: per, paid: paid, next: Math.min(n, paid + 1), nextDue: r.dueDate ? addMonthsIso(r.dueDate, paid) : null};
}
export function recvNextDue(r){ var i = recvInstallInfo(r); return i ? i.nextDue : r.dueDate; }
// Quanto cobrar "do mês" `key` (AAAA-MM): parceladas, as parcelas com vencimento até o fim do mês
// ainda não recebidas (inclui atrasadas; desconta o que já entrou da parcela atual); sem parcelas,
// o que falta se o combinado vence até o fim do mês (ou não tem data). Nunca passa do que falta.
export function recvDueByMonth(r, key){
  var left = recvRemaining(r);
  if (!(left > 0)) return 0;
  var end = key + '-31', info = recvInstallInfo(r);
  if (!info) return !r.dueDate || r.dueDate <= end ? left : 0;
  if (!r.dueDate) return money(Math.min(info.per, left));
  var count = 0;
  for (var i = info.paid; i < info.n && addMonthsIso(r.dueDate, i) <= end; i++) count++;
  var partial = money(Number(r.receivedAmount || 0) - info.paid * info.per);
  return money(Math.min(left, Math.max(0, count * info.per - partial)));
}
// Parcelas que vencem até o fim do mês e ainda não foram recebidas (para o texto da cobrança).
export function recvDueCount(r, key){
  var info = recvInstallInfo(r);
  if (!info || !r.dueDate || !(recvRemaining(r) > 0)) return info && recvRemaining(r) > 0 ? 1 : 0;
  var count = 0;
  for (var i = info.paid; i < info.n && addMonthsIso(r.dueDate, i) <= key + '-31'; i++) count++;
  return count;
}
