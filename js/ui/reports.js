/*
 * Relatórios em PDF.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {formatDateFull, monthBounds} from '../domain/dates.js';
import {fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import {invoiceDates, invoiceLabel} from '../domain/cards.js';

import {labelOf} from './dom.js';
import {pdfWriter, showPdf, pdfReady} from './pdf.js';
import {RECV_KINDS} from './constants.js';
import {pctDelta} from './shell.js';
import {State, catLabel, expenseCategoryTotals, expenseCats, installmentGroups, invoiceItems, invoiceStatus, monthTotals} from './state.js';

/* ---------- PDF ---------- */

export function generateInvoicePdf(cardId, key){
  if (!pdfReady()) return;
  var c = findById(State.cards, cardId);
  var items = invoiceItems(c, key);
  var dates = invoiceDates(key, c);
  var w = pdfWriter('Fatura ' + c.name + ' · ' + invoiceLabel(key, c), (State.session ? State.session.name : '') + '  ·  Fecha ' + formatDateFull(dates.closing) + '  ·  Vence ' + formatDateFull(dates.due));
  w.section('Resumo');
  w.row(['Total da fatura', fmtMoney(sum(items, function(t){ return t.amount; }))], [200, 200], {bold:true});
  w.row(['Situação', invoiceStatus(c, key)], [200, 200]);
  w.row(['Limite do cartão', fmtMoney(c.limit)], [200, 200]);
  w.space(12);
  w.section('Compras');
  if (!items.length){ w.text('Nenhuma compra nesta fatura.'); }
  else {
    var widths = [70, 190, 130, 100];
    w.header(['Data', 'Descrição', 'Categoria', 'Valor'], widths);
    items.forEach(function(t){ w.row([formatDateFull(t.date), t.description || '-', catLabel(t.category, 'expense', t.categoryLabel), fmtMoney(t.amount)], widths); });
  }
  w.footer();
  showPdf(w.doc, 'grana-leve-fatura-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + key + '.pdf', 'Fatura ' + c.name + ' · ' + invoiceLabel(key, c));
}

export function pct1(n){ return (Math.round(n*10)/10).toString().replace('.',','); }

export function generateMonthlyReport(){
  if (!pdfReady()) return;
  var cur = monthBounds(0), prev = monthBounds(-1);
  var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
  var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);
  var cats = expenseCats().map(function(c){ return {label:c.label, cur:curCats[c.id]||0, prev:prevCats[c.id]||0}; })
    .filter(function(c){ return c.cur>0 || c.prev>0; }).sort(function(a,b){ return b.cur-a.cur; });
  function deltaText(a, b){ var d = pctDelta(a, b); if (d === null) return (a>0 && !b) ? 'novo' : '-'; return (d>=0?'+':'') + pct1(d) + '%'; }

  var title = cur.label.charAt(0).toUpperCase() + cur.label.slice(1);
  var w = pdfWriter('Grana Leve · Relatório mensal', title + '  ·  ' + (State.session ? State.session.name : ''));
  var W4 = [140,130,130,80];
  w.section('Resumo do mês');
  w.header(['', 'Este mês', 'Mês anterior', 'Variação'], W4);
  w.row(['Ganhos', fmtMoney(curT.income), fmtMoney(prevT.income), deltaText(curT.income, prevT.income)], W4);
  w.row(['Gastos', fmtMoney(curT.expense), fmtMoney(prevT.expense), deltaText(curT.expense, prevT.expense)], W4);
  w.row(['Saldo', fmtMoney(curT.saldo), fmtMoney(prevT.saldo), deltaText(curT.saldo, prevT.saldo)], W4, {bold:true});
  w.space(12);

  w.section('Gastos por categoria');
  if (!cats.length) w.text('Nenhum gasto registrado neste mês.');
  else { w.header(['Categoria', 'Este mês', 'Mês anterior', 'Variação'], [160,120,120,80]); cats.forEach(function(c){ w.row([c.label, fmtMoney(c.cur), fmtMoney(c.prev), deltaText(c.cur, c.prev)], [160,120,120,80]); }); }
  w.space(12);

  var goals = State.goals.filter(function(g){ return !g.deletedAt; });
  w.section('Metas de economia');
  if (!goals.length) w.text('Nenhuma meta cadastrada.');
  else { w.header(['Meta', 'Guardado', 'Objetivo', 'Progresso'], [180,110,110,80]); goals.forEach(function(g){ var p = g.targetAmount>0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0; w.row([g.name, fmtMoney(g.currentAmount||0), fmtMoney(g.targetAmount), Math.round(p*100)+'%'], [180,110,110,80]); }); }
  w.space(12);

  w.section('Dívidas');
  if (!State.debts.length) w.text('Nenhuma dívida cadastrada.');
  else { w.header(['Dívida', 'Pago', 'Falta', 'Total'], [180,110,110,80]); State.debts.forEach(function(d){ w.row([d.name, fmtMoney(d.paidAmount||0), fmtMoney(Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0))), fmtMoney(d.totalAmount)], [180,110,110,80]); }); }
  var openGroups = installmentGroups().filter(function(g){ return g.future.length; });
  if (openGroups.length){
    w.space(8); w.section('Compras parceladas no cartão');
    w.header(['Compra', 'Parcela', 'Falta', 'Total'], [180,110,110,80]);
    openGroups.forEach(function(g){ w.row([g.name, g.done + ' de ' + g.total, fmtMoney(g.remaining), fmtMoney(g.totalAmount)], [180,110,110,80]); });
  }
  w.space(12);

  w.section('A receber');
  var recv = State.receivables.filter(function(r){ return Number(r.receivedAmount||0) < Number(r.totalAmount||0); });
  if (!recv.length) w.text('Nada pendente para receber.');
  else { w.header(['Pessoa', 'Tipo', 'Falta receber', 'Combinado'], [160,140,100,80]); recv.forEach(function(r){ w.row([r.person, labelOf(RECV_KINDS, r.kind), fmtMoney(Number(r.totalAmount)-Number(r.receivedAmount||0)), r.dueDate ? formatDateFull(r.dueDate) : '-'], [160,140,100,80]); }); }

  w.footer();
  showPdf(w.doc, 'grana-leve-relatorio-' + cur.key + '.pdf', 'Relatório de ' + cur.label);
}
