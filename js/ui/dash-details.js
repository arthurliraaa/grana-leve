/*
 * Início, detalhes: popups que abrem ao tocar nos totais, faturas, bancos, categorias e na comparação.
 * Todos usam as mesmas peças: linhas de compra (lineOf/billLine), tabela (linesTable), seção (sectionHtml) e
 * o popup (showDetail), para o formato ficar igual em qualquer um deles.
 */
import {todayKey, monthKeyOf, formatDateBr, monthBounds} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import {isPersonal, myShare, othersShare, whoLabel, categoryExpenses} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import {escapeHtml} from './dom.js';
import {openModal} from './modal.js';
import {generateInvoicePdf, generateAllInvoicesPdf} from './reports.js';
import {State, txForMonth, catLabel, expenseCats} from './state.js';
import {creditDebitData, dashMonth, invoiceSplitData, monthName, monthProjection} from './dash-data.js';

/* ---------- Peças comuns ---------- */
var MINE = 'Seu';
function money_(v){ return '<strong class="tabular">' + fmtMoney(v) + '</strong>'; }
function emptyHtml(text){ return '<p class="empty-state">' + text + '</p>'; }
// Uma linha da lista: {date, name, tags: [texto pequeno], who, amount}.
function lineOf(t, amount, opts){
  opts = opts || {};
  var tags = [];
  if (t.installment) tags.push(t.installment.n + '/' + t.installment.total);
  if (opts.card && t.paymentMethod === 'cartao') tags.push('cartão');
  return {date: t.date, name: t.description || opts.fallback || catLabel(t.category, t.type, t.categoryLabel), tags: tags, who: opts.who || whoLabel(t), amount: amount};
}
function billLine(o){ return {date: o.date, name: o.b.name, tags: ['conta fixa prevista'], who: MINE, amount: o.amount}; }
// Tabela de linhas. who: false esconde a coluna “De quem” (usada nos ganhos).
function linesTable(lines, who){
  var showWho = who !== false;
  return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>' + (showWho ? 'Gasto' : 'Descrição') + '</th>' + (showWho ? '<th>De quem</th>' : '') + '<th>Valor</th></tr></thead><tbody>' + lines.map(function(l){
    var mine = l.who === MINE || l.who === 'Sua parte (dividida)';
    return '<tr><td>' + formatDateBr(l.date) + '</td><td>' + escapeHtml(l.name) + l.tags.map(function(g){ return ' <small class="tx-meta">' + escapeHtml(g) + '</small>'; }).join('') + '</td>' +
      (showWho ? '<td><span class="who-tag ' + (mine ? 'mine' : 'others') + '">' + escapeHtml(l.who) + '</span></td>' : '') + '<td class="tabular">' + fmtMoney(l.amount) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
}
// Seção com título (e total), uma linha de apoio e o conteúdo.
function sectionHtml(title, total, meta, inner){
  return '<section class="detail-sec"><h3>' + escapeHtml(title) + (total === null || total === undefined ? '' : ' · <span class="tabular">' + fmtMoney(total) + '</span>') + '</h3>' +
    (meta ? '<p class="tx-meta">' + meta + '</p>' : '') + inner + '</section>';
}
// O popup: título, resumo, conteúdo e, se houver, o botão de PDF (pdf = função que gera).
async function showDetail(o){
  var r = await openModal({title: o.title, wide: true, submitLabel: o.pdf ? o.pdfLabel : null, cancelLabel: 'Fechar',
    body: (o.summary ? '<p class="card-sub">' + o.summary + '</p>' : '') + o.body, onSubmit: o.pdf ? function(){ return {pdf: true}; } : undefined});
  if (r && r.pdf && o.pdf) o.pdf();
}
function monthTitle(m){ return m.label.split(' de ')[0]; }
function sumAmount(lines){ return money(sum(lines, function(l){ return l.amount; })); }

/* ---------- Faturas ---------- */
export async function openInvoiceDetail(cardId, key){
  var c = findById(State.cards, cardId);
  if (!c) return;
  var items = Cards.invoiceItems(State.transactions, c, key), dates = Cards.invoiceDates(key, c), carries = Cards.carryIns(c, key);
  var counted = items.filter(function(t){ return !(t.installment && t.installment.settled); });
  var mine = money(sum(counted, myShare) + Cards.carryTotal(c, key)), others = money(sum(counted, othersShare));
  await showDetail({
    title: c.name + ' · fatura de ' + Cards.invoiceLabel(key, c), pdfLabel: 'Baixar a fatura em PDF', pdf: function(){ generateInvoicePdf(cardId, key); },
    summary: 'Fecha ' + formatDateBr(dates.closing) + ' · vence ' + formatDateBr(dates.due) + ' · ' + Cards.invoiceStatus(c, key, todayKey(), State.transactions) +
      '<br>Minha parte ' + money_(mine) + ' · de outras pessoas ' + money_(others) + ' · total ' + money_(money(mine + others)),
    body: carries.map(function(x){ return '<p class="tx-meta">' + (x.mode === 'parcelado' ? 'Parcelamento da fatura de ' + Cards.invoiceLabel(x.from, c) + ' (' + x.i + '/' + x.n + ')' : 'Saldo da fatura de ' + Cards.invoiceLabel(x.from, c)) + ': ' + fmtMoney(x.amount) + '</p>'; }).join('') +
      (items.length ? linesTable(items.map(function(t){ return lineOf(t, Number(t.amount)); })) : emptyHtml('Nenhuma compra nesta fatura.'))
  });
}
// Total das faturas: todas as faturas do mês, cartão por cartão.
export async function openAllInvoicesDetail(off){
  var d = invoiceSplitData(off || 0);
  var mine = money(sum(d.rows, function(r){ return r.mine; })), others = money(sum(d.rows, function(r){ return r.others; }));
  await showDetail({
    title: 'Faturas que vencem em ' + monthName(off), pdfLabel: 'Baixar PDF de todas as faturas', pdf: function(){ generateAllInvoicesPdf(off || 0); },
    summary: 'Total ' + money_(money(mine + others)) + ' · minha parte ' + money_(mine) + ' · de outras pessoas ' + money_(others),
    body: d.rows.map(function(x){
      var items = Cards.invoiceItems(State.transactions, x.card, x.key);
      return sectionHtml(x.card.name + ' · fatura de ' + x.label, x.total, 'Vence ' + formatDateBr(x.due) + ' · ' + x.status + ' · minha parte ' + fmtMoney(x.mine) + ' · de outras pessoas ' + fmtMoney(x.others),
        items.length ? linesTable(items.map(function(t){ return lineOf(t, Number(t.amount)); })) : '');
    }).join('') || emptyHtml('Nenhuma fatura vence neste mês.')
  });
}

/* ---------- Bancos (crédito × débito) ---------- */
// Crédito e débito/Pix de um banco no mês (mesma regra do gráfico), em duas listas com subtotal.
function bankPartsHtml(row, off){
  var key = monthBounds(off || 0).key, today = todayKey(), upToToday = !off;
  var tx = State.transactions.filter(function(t){ return t.type === 'expense' && monthKeyOf(t.date) === key && (!upToToday || t.date <= today); }).sort(function(a, b){ return a.date.localeCompare(b.date); });
  function part(title, list){
    var lines = list.map(function(t){ return lineOf(t, Number(t.amount)); });
    return lines.length ? '<h4>' + title + ' · <span class="tabular">' + fmtMoney(sumAmount(lines)) + '</span></h4>' + linesTable(lines) : '';
  }
  return part('No cartão de crédito (pela data da compra)', tx.filter(function(t){ return t.paymentMethod === 'cartao' && row.cardIds.indexOf(t.cardId) >= 0; })) +
    part('Da conta (Pix ou débito)', tx.filter(function(t){ return t.paymentMethod === 'conta' && row.accIds.indexOf(t.accountId) >= 0; }));
}
export async function openBankDetail(index, off){
  var row = creditDebitData(off || 0).rows[index];
  if (!row) return;
  await showDetail({
    title: row.name + ' · ' + monthName(off),
    summary: 'Total ' + money_(row.total) + ' · crédito ' + fmtMoney(row.credit) + ' · débito/Pix ' + fmtMoney(row.debit) + '. Inclui o que outras pessoas vão te devolver.',
    body: bankPartsHtml(row, off) || emptyHtml('Nada neste período.')
  });
}
// Total nos bancos: todos os bancos, cada um com o que saiu no crédito e no débito/Pix.
export async function openAllBanksDetail(off){
  var rows = creditDebitData(off || 0).rows.filter(function(r){ return r.total > 0; });
  await showDetail({
    title: 'Total nos bancos · ' + monthName(off),
    summary: 'Total ' + money_(money(sum(rows, function(r){ return r.total; }))) + ' em ' + rows.length + (rows.length === 1 ? ' banco' : ' bancos') + '. Inclui o que outras pessoas vão te devolver.',
    body: rows.map(function(r){ return sectionHtml(r.name, r.total, '', bankPartsHtml(r, off)); }).join('') || emptyHtml('Nada neste período.')
  });
}

/* ---------- Comparação com o mês anterior ---------- */
function monthItems(key, type, catId){
  return txForMonth(key).filter(function(t){ return t.type === type && isPersonal(t) && !t.reversal && !t.refund && (!catId || t.category === catId) && (type === 'income' || myShare(t) > 0); })
    .sort(function(a, b){ return a.date.localeCompare(b.date); });
}
// kind: 'cmpcat' (uma categoria, com catId), 'exp' (gastos), 'inc' (ganhos) ou 'saldo' (ganhos − gastos).
export async function openCompareDetail(kind, catId){
  var off = State.dashOffset || 0, cur = monthBounds(off), prev = monthBounds(off - 1), pair = monthTitle(cur) + ' × ' + monthTitle(prev);
  var months = [{m: cur, p: monthProjection(cur.key)}, {m: prev, p: monthProjection(prev.key)}];
  if (kind === 'saldo'){
    function row(label, a, b, strong){ var f = strong ? function(v){ return '<strong>' + fmtMoney(v) + '</strong>'; } : fmtMoney; return '<tr><td>' + (strong ? '<strong>' + label + '</strong>' : label) + '</td><td class="tabular">' + f(a) + '</td><td class="tabular">' + f(b) + '</td></tr>'; }
    var p0 = months[0].p, p1 = months[1].p;
    await showDetail({title: 'Saldo · ' + pair, body: '<div class="table-scroll"><table class="data-table"><thead><tr><th></th><th>' + escapeHtml(cur.label) + '</th><th>' + escapeHtml(prev.label) + '</th></tr></thead><tbody>' +
      row('Ganhos', p0.inc, p1.inc) + row('Gastos', p0.exp, p1.exp) + row('Saldo', money(p0.inc - p0.exp), money(p1.inc - p1.exp), true) + '</tbody></table></div>' +
      '<p class="tx-meta">Saldo = ganhos − gastos do mês (a sua parte). Em meses futuros, é uma previsão.</p>'});
    return;
  }
  var isCat = kind === 'cmpcat', type = kind === 'inc' ? 'income' : 'expense';
  var cat = isCat ? (expenseCats().filter(function(c){ return c.id === catId; })[0] || {label: catId}) : null;
  var title = (isCat ? cat.label : kind === 'exp' ? 'Gastos' : 'Ganhos') + ' · ' + pair;
  await showDetail({title: title, body: months.map(function(x){
    var items = monthItems(x.m.key, type, isCat ? catId : null);
    var lines = items.map(function(t){ return lineOf(t, type === 'expense' ? myShare(t) : Number(t.amount), {who: MINE, fallback: isCat ? cat.label : undefined}); });
    if (type === 'expense') lines = lines.concat(x.p.bills.filter(function(o){ return !isCat || o.b.category === catId; }).map(billLine));
    var total = isCat ? sumAmount(lines) : (kind === 'exp' ? x.p.exp : x.p.inc);
    return sectionHtml(x.m.label, total, '', lines.length ? linesTable(lines, type === 'expense') : emptyHtml(isCat ? 'Nada nesta categoria.' : 'Nada neste mês.'));
  }).join('')});
}

/* ---------- Categoria do gráfico ---------- */
// Toque numa categoria do gráfico: lista o que foi gasto nela no mês (mesma regra do gráfico: “Tudo” ou só a sua parte).
export async function openCategoryDetail(catId){
  var m = dashMonth(), all = State.donutScope !== 'mine';
  var cat = expenseCats().filter(function(c){ return c.id === catId; })[0] || {label: catId, emoji: ''};
  var lines = categoryExpenses(State.transactions, m.key, catId, all).map(function(t){
    return lineOf(t, all ? Number(t.amount) || 0 : myShare(t), {card: true, fallback: cat.label, who: !all && t.split ? 'Sua parte (dividida)' : undefined});
  }).filter(function(l){ return l.amount !== 0; }).concat(monthProjection(m.key).bills.filter(function(o){ return o.b.category === catId; }).map(billLine));
  await showDetail({
    title: (cat.emoji ? cat.emoji + ' ' : '') + cat.label + ' · ' + monthTitle(m),
    summary: 'Total ' + money_(sumAmount(lines)) + ' · ' + (all ? 'tudo o que saiu, inclusive a parte de outras pessoas' : 'só a sua parte'),
    body: lines.length ? linesTable(lines) : emptyHtml('Nada nesta categoria.')
  });
}
