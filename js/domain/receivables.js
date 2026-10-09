/*
 * A receber: {person, kind, totalAmount, receivedAmount, dueDate, installments?, installmentAmount?}.
 * Parcelado: as parcelas recebidas contam pelo total que já entrou; a próxima vence um mês
 * depois da anterior, a partir de dueDate (1ª parcela).
 */
import {addMonthsIso} from './dates.js';
import {money, toCents} from './money.js';

export function recvRemaining(r){ return money(Math.max(0, Number(r.totalAmount || 0) - Number(r.receivedAmount || 0))); }
export function recvInstallInfo(r){
  var n = Number(r.installments) || 1;
  if (n <= 1) return null;
  var per = Number(r.installmentAmount) || money(Number(r.totalAmount) / n);
  var paid = Math.min(n, Math.floor(toCents(r.receivedAmount || 0) / toCents(per)));
  return {n: n, per: per, paid: paid, next: Math.min(n, paid + 1), nextDue: r.dueDate ? addMonthsIso(r.dueDate, paid) : null};
}
export function recvNextDue(r){ var i = recvInstallInfo(r); return i ? i.nextDue : r.dueDate; }
