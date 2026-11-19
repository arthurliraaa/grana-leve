/*
 * Relatórios em PDF.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {formatDateFull, formatDateBr, monthBounds, shiftMonthKey} from '../domain/dates.js';
import {fmtMoney, money} from '../domain/money.js';
import {sum} from '../domain/util.js';
import {myShare, othersShare, whoLabel} from '../domain/transactions.js';
import {findById} from '../domain/util.js';
import * as Cards from '../domain/cards.js';
import {invoiceDates, invoiceLabel} from '../domain/cards.js';

import {labelOf, toast, icon} from './dom.js';
import {pdfWriter, showPdf, pdfReady} from './pdf.js';
import {RECV_KINDS} from './constants.js';
import {pctDelta} from './shell.js';
import {State, catLabel, expenseCategoryTotals, expenseCats, installmentGroups, invoiceItems, invoiceStatus, monthTotals, totalAccountsBalance} from './state.js';

/* ---------- PDF ---------- */

// Parte da fatura que é minha: minhas compras + saldo de faturas anteriores pago em parte (é dívida minha).
function invoiceParts(c, key){
  var items = invoiceItems(c, key).filter(function(t){ return !(t.installment && t.installment.settled); });
  var carry = Cards.carryTotal(c, key);
  var mine = money(sum(items, myShare) + carry), others = money(sum(items, othersShare));
  var left = invoiceStatus(c, key) === 'paga' ? 0 : Cards.invoiceLeft(State.transactions, c, key);
  return {items: items, carry: carry, mine: mine, others: others, total: money(mine + others), left: left,
    leftMine: money(Math.min(left, Math.max(0, mine)))};
}
var PURCHASE_COLS = [60, 148, 86, 66, 66, 68];
function purchaseHeader(w){ w.header(['Data', 'Descrição', 'Categoria', 'Minha parte', 'Outras pessoas', 'Total'], PURCHASE_COLS); }
function purchaseRow(w, t){
  var who = whoLabel(t);
  w.row([formatDateBr(t.date), (t.description || '-') + (who !== 'Seu' ? ' (' + who + ')' : ''), catLabel(t.category, 'expense', t.categoryLabel),
    fmtMoney(myShare(t)), fmtMoney(othersShare(t)), fmtMoney(t.amount)], PURCHASE_COLS);
}

// Botões dos PDFs das faturas de todos os cartões (este mês e o que vem): em destaque e centralizados.
export function invoicePdfButtonsHtml(){
  return '<div class="ws-actions"><button type="button" class="btn btn-primary btn-pdf" data-allinv-pdf="0">' + icon('list') + 'PDF das faturas do mês</button>' +
    '<button type="button" class="btn btn-primary btn-pdf" data-allinv-pdf="1">' + icon('calendar') + 'PDF do mês que vem</button></div>';
}

export async function generateInvoicePdf(cardId, key){
  if (!(await pdfReady())) return;
  var c = findById(State.cards, cardId);
  var dates = invoiceDates(key, c), P = invoiceParts(c, key);
  var w = pdfWriter('Fatura ' + c.name + ' · ' + invoiceLabel(key, c), (State.session ? State.session.name : '') + '  ·  Fecha ' + formatDateFull(dates.closing) + '  ·  Vence ' + formatDateFull(dates.due));
  w.section('Resumo');
  var carries = Cards.carryIns(c, key);
  w.row(['Total da fatura', fmtMoney(Cards.invoiceTotal(State.transactions, c, key))], [200, 200], {bold:true});
  w.row(['Minha parte', fmtMoney(P.mine)], [200, 200]);
  w.row(['De outras pessoas (vão te devolver)', fmtMoney(P.others)], [200, 200]);
  carries.forEach(function(x){ w.row([(x.mode === 'parcelado' ? 'Parcelamento da fatura de ' + invoiceLabel(x.from, c) + ' (' + x.i + '/' + x.n + ')' : 'Saldo da fatura de ' + invoiceLabel(x.from, c)), fmtMoney(x.amount)], [200, 200]); });
  w.row(['Falta pagar', fmtMoney(P.left)], [200, 200]);
  w.row(['Situação', invoiceStatus(c, key)], [200, 200]);
  w.row(['Limite do cartão', fmtMoney(c.limit)], [200, 200]);
  w.space(12);
  w.section('Compras');
  var items = invoiceItems(c, key);
  if (!items.length){ w.text('Nenhuma compra nesta fatura.'); }
  else {
    purchaseHeader(w);
    items.forEach(function(t){ purchaseRow(w, t); });
    w.row(['', 'Total das compras', '', fmtMoney(money(sum(items, myShare))), fmtMoney(money(sum(items, othersShare))), fmtMoney(money(sum(items, function(t){ return t.amount; })))], PURCHASE_COLS, {bold:true});
  }
  w.footer();
  showPdf(w.doc, 'grana-leve-fatura-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + key + '.pdf', 'Fatura ' + c.name + ' · ' + invoiceLabel(key, c));
}

// PDF com as faturas de TODOS os cartões que vencem em um mês (offset 0 = este mês, 1 = mês que vem):
// uma parte por cartão, o resumo somando tudo (minha parte e de outras pessoas) e o que sobra nas contas.
export async function generateAllInvoicesPdf(offset){
  if (!(await pdfReady())) return;
  var mk = monthBounds(offset || 0), found = [];
  State.cards.forEach(function(c){
    var base = Cards.invoiceKeyFor(mk.key + '-15', c);
    [-2, -1, 0, 1, 2].forEach(function(d){
      var kk = shiftMonthKey(base, d);
      if (Cards.invoiceDates(kk, c).due.slice(0, 7) !== mk.key || found.some(function(f){ return f.card.id === c.id; })) return;
      var P = invoiceParts(c, kk);
      if (P.items.length || P.carry) found.push({card: c, key: kk, P: P});
    });
  });
  if (!found.length){ toast('Nenhuma fatura vence em ' + mk.label + '.'); return; }
  var title = mk.label.charAt(0).toUpperCase() + mk.label.slice(1);
  var w = pdfWriter('Faturas dos cartões · ' + title, (State.session ? State.session.name : '') + '  ·  faturas que vencem neste mês');
  found.forEach(function(f){
    var dates = invoiceDates(f.key, f.card);
    w.band(f.card.name + '  ·  vence ' + formatDateFull(dates.due) + '  ·  ' + invoiceStatus(f.card, f.key));
    if (f.P.items.length){
      purchaseHeader(w);
      f.P.items.forEach(function(t){ purchaseRow(w, t); });
    }
    f.P.carry && w.row(['', 'Saldo de faturas anteriores', '', fmtMoney(f.P.carry), fmtMoney(0), fmtMoney(f.P.carry)], PURCHASE_COLS);
    w.row(['', 'Total de ' + f.card.name, '', fmtMoney(f.P.mine), fmtMoney(f.P.others), fmtMoney(f.P.total)], PURCHASE_COLS, {bold:true});
    w.space(14);
  });
  var RC = [130, 80, 80, 90, 80];
  w.section('Resumo de todos os cartões');
  w.header(['Cartão', 'Total', 'Minha parte', 'Outras pessoas', 'Falta pagar'], RC);
  found.forEach(function(f){ w.row([f.card.name, fmtMoney(f.P.total), fmtMoney(f.P.mine), fmtMoney(f.P.others), fmtMoney(f.P.left)], RC); });
  var tot = {total: money(sum(found, function(f){ return f.P.total; })), mine: money(sum(found, function(f){ return f.P.mine; })), others: money(sum(found, function(f){ return f.P.others; })),
    left: money(sum(found, function(f){ return f.P.left; })), leftMine: money(sum(found, function(f){ return f.P.leftMine; }))};
  w.row(['Total', fmtMoney(tot.total), fmtMoney(tot.mine), fmtMoney(tot.others), fmtMoney(tot.left)], RC, {bold:true});
  if (State.accounts.length){
    var cash = totalAccountsBalance();
    w.space(12); w.section('Com o dinheiro das contas');
    w.row(['Nas contas hoje', fmtMoney(cash)], [260, 140]);
    w.row(['Faltam pagar (todos os cartões)', fmtMoney(tot.left)], [260, 140]);
    w.row(['Sobra se ninguém devolver', fmtMoney(money(cash - tot.left))], [260, 140], {bold:true});
    w.row(['Sobra se te devolverem (só a sua parte)', fmtMoney(money(cash - tot.leftMine))], [260, 140], {bold:true});
  }
  w.footer();
  showPdf(w.doc, 'grana-leve-faturas-' + mk.key + '.pdf', 'Faturas · ' + title);
}

export function pct1(n){ return (Math.round(n*10)/10).toString().replace('.',','); }

export async function generateMonthlyReport(){
  if (!(await pdfReady())) return;
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
  else { w.header(['Meta', 'Guardado', 'Objetivo', 'Progresso'], [180,110,110,80]); goals.forEach(function(g){ var p = g.targetAmount>0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0; w.row([g.name, fmtMoney(g.currentAmount||0), g.targetAmount>0 ? fmtMoney(g.targetAmount) : 'Sem alvo', g.targetAmount>0 ? Math.round(p*100)+'%' : '—'], [180,110,110,80]); }); }
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
