/*
 * Início, detalhes: popups que abrem ao tocar nos totais, faturas, bancos, categorias e na comparação.
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

// Toque numa fatura ou num banco dos gráficos: lista o que tem dentro, dizendo de quem é cada compra.
function detailRowsHtml(list, amountFn){
  return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Gasto</th><th>De quem</th><th>Valor</th></tr></thead><tbody>' + list.map(function(t){
    var who = whoLabel(t);
    return '<tr><td>' + formatDateBr(t.date) + '</td><td>' + escapeHtml(t.description || catLabel(t.category, 'expense', t.categoryLabel)) + (t.installment ? ' <small class="tx-meta">' + t.installment.n + '/' + t.installment.total + '</small>' : '') +
      '</td><td><span class="who-tag ' + (who === 'Seu' ? 'mine' : 'others') + '">' + escapeHtml(who) + '</span></td><td class="tabular">' + fmtMoney(amountFn(t)) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
}
export async function openInvoiceDetail(cardId, key){
  var c = findById(State.cards, cardId);
  if (!c) return;
  var items = Cards.invoiceItems(State.transactions, c, key), dates = Cards.invoiceDates(key, c), carries = Cards.carryIns(c, key);
  var mine = money(sum(items.filter(function(t){ return !(t.installment && t.installment.settled); }), myShare) + Cards.carryTotal(c, key));
  var others = money(sum(items.filter(function(t){ return !(t.installment && t.installment.settled); }), othersShare));
  var r = await openModal({
    title: c.name + ' · fatura de ' + Cards.invoiceLabel(key, c), wide: true, submitLabel: 'Baixar a fatura em PDF', cancelLabel: 'Fechar',
    body: '<p class="card-sub">Fecha ' + formatDateBr(dates.closing) + ' · vence ' + formatDateBr(dates.due) + ' · ' + Cards.invoiceStatus(c, key, todayKey(), State.transactions) +
      '<br>Minha parte <strong class="tabular">' + fmtMoney(mine) + '</strong> · de outras pessoas <strong class="tabular">' + fmtMoney(others) + '</strong> · total <strong class="tabular">' + fmtMoney(money(mine + others)) + '</strong></p>' +
      carries.map(function(x){ return '<p class="tx-meta">' + (x.mode === 'parcelado' ? 'Parcelamento da fatura de ' + Cards.invoiceLabel(x.from, c) + ' (' + x.i + '/' + x.n + ')' : 'Saldo da fatura de ' + Cards.invoiceLabel(x.from, c)) + ': ' + fmtMoney(x.amount) + '</p>'; }).join('') +
      (items.length ? detailRowsHtml(items, function(t){ return Number(t.amount); }) : '<p class="empty-state">Nenhuma compra nesta fatura.</p>'),
    onSubmit: function(){ return {pdf: true}; }
  });
  if (r && r.pdf) generateInvoicePdf(cardId, key);
}
// Crédito e débito/Pix de um banco no mês (mesma regra do gráfico), em duas listas com subtotal.
function bankPartsHtml(row, off){
  var key = monthBounds(off || 0).key, today = todayKey(), upToToday = !off;
  var tx = State.transactions.filter(function(t){ return t.type === 'expense' && monthKeyOf(t.date) === key && (!upToToday || t.date <= today); }).sort(function(a, b){ return a.date.localeCompare(b.date); });
  var credit = tx.filter(function(t){ return t.paymentMethod === 'cartao' && row.cardIds.indexOf(t.cardId) >= 0; });
  var debit = tx.filter(function(t){ return t.paymentMethod === 'conta' && row.accIds.indexOf(t.accountId) >= 0; });
  function part(title, list){
    return list.length ? '<h4>' + title + ' · <span class="tabular">' + fmtMoney(money(sum(list, function(t){ return Number(t.amount); }))) + '</span></h4>' + detailRowsHtml(list, function(t){ return Number(t.amount); }) : '';
  }
  return part('No cartão de crédito (pela data da compra)', credit) + part('Da conta (Pix ou débito)', debit);
}
export async function openBankDetail(index, off){
  var d = creditDebitData(off || 0), row = d.rows[index];
  if (!row) return;
  await openModal({
    title: row.name + ' · ' + monthName(off), wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<p class="card-sub">Total <strong class="tabular">' + fmtMoney(row.total) + '</strong> · crédito ' + fmtMoney(row.credit) + ' · débito/Pix ' + fmtMoney(row.debit) + '. Inclui o que outras pessoas vão te devolver.</p>' +
      (bankPartsHtml(row, off) || '<p class="empty-state">Nada neste período.</p>')
  });
}
// Total nos bancos: todos os bancos, cada um com o que saiu no crédito e no débito/Pix.
export async function openAllBanksDetail(off){
  var d = creditDebitData(off || 0), rows = d.rows.filter(function(r){ return r.total > 0; });
  var tot = money(sum(rows, function(r){ return r.total; }));
  await openModal({
    title: 'Total nos bancos · ' + monthName(off), wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<p class="card-sub">Total <strong class="tabular">' + fmtMoney(tot) + '</strong> em ' + rows.length + (rows.length === 1 ? ' banco' : ' bancos') + '. Inclui o que outras pessoas vão te devolver.</p>' +
      (rows.map(function(r){
        return '<section class="detail-sec"><h3>' + escapeHtml(r.name) + ' · <span class="tabular">' + fmtMoney(r.total) + '</span></h3>' + bankPartsHtml(r, off) + '</section>';
      }).join('') || '<p class="empty-state">Nada neste período.</p>')
  });
}
// Total das faturas: todas as faturas do mês, cartão por cartão.
export async function openAllInvoicesDetail(off){
  var d = invoiceSplitData(off || 0);
  var mine = money(sum(d.rows, function(r){ return r.mine; })), others = money(sum(d.rows, function(r){ return r.others; }));
  var r = await openModal({
    title: 'Faturas que vencem em ' + monthName(off), wide: true, submitLabel: 'Baixar PDF de todas as faturas', cancelLabel: 'Fechar',
    body: '<p class="card-sub">Total <strong class="tabular">' + fmtMoney(money(mine + others)) + '</strong> · minha parte <strong class="tabular">' + fmtMoney(mine) + '</strong> · de outras pessoas <strong class="tabular">' + fmtMoney(others) + '</strong></p>' +
      (d.rows.map(function(x){
        var items = Cards.invoiceItems(State.transactions, x.card, x.key);
        return '<section class="detail-sec"><h3>' + escapeHtml(x.card.name) + ' · fatura de ' + escapeHtml(x.label) + ' · <span class="tabular">' + fmtMoney(x.total) + '</span></h3>' +
          '<p class="tx-meta">Vence ' + formatDateBr(x.due) + ' · ' + x.status + ' · minha parte ' + fmtMoney(x.mine) + ' · de outras pessoas ' + fmtMoney(x.others) + '</p>' +
          (items.length ? detailRowsHtml(items, function(t){ return Number(t.amount); }) : '') + '</section>';
      }).join('') || '<p class="empty-state">Nenhuma fatura vence neste mês.</p>'),
    onSubmit: function(){ return {pdf: true}; }
  });
  if (r && r.pdf) generateAllInvoicesPdf(off || 0);
}
// Comparação com o mês anterior: uma categoria (as compras dos dois meses) ou o total de ganhos/gastos/saldo.
function simpleRowsHtml(list, amountFn){
  return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' + list.map(function(t){
    return '<tr><td>' + formatDateBr(t.date) + '</td><td>' + escapeHtml(t.description || catLabel(t.category, t.type)) + '</td><td class="tabular">' + fmtMoney(amountFn(t)) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
}
function monthItems(key, type, catId){
  return txForMonth(key).filter(function(t){ return t.type === type && isPersonal(t) && !t.reversal && !t.refund && (!catId || t.category === catId) && (type === 'income' || myShare(t) > 0); })
    .sort(function(a, b){ return a.date.localeCompare(b.date); });
}
export async function openCompareDetail(kind, catId){
  var off = State.dashOffset || 0, cur = monthBounds(off), prev = monthBounds(off - 1);
  var keys = [{m: cur, p: monthProjection(cur.key)}, {m: prev, p: monthProjection(prev.key)}];
  var title, body = '';
  function sec(m, html, total){ return '<section class="detail-sec"><h3>' + escapeHtml(m.label) + ' · <span class="tabular">' + fmtMoney(total) + '</span></h3>' + html + '</section>'; }
  if (kind === 'cmpcat'){
    var cat = expenseCats().filter(function(c){ return c.id === catId; })[0] || {label: catId};
    title = cat.label + ' · ' + cur.label.split(' de ')[0] + ' × ' + prev.label.split(' de ')[0];
    keys.forEach(function(k){
      var items = monthItems(k.m.key, 'expense', catId), bills = k.p.bills.filter(function(o){ return o.b.category === catId; });
      var total = money(sum(items, myShare) + sum(bills, function(o){ return o.amount; }));
      var rows = items.map(function(t){ return {date: t.date, description: (t.description || cat.label) + (t.installment ? ' ' + t.installment.n + '/' + t.installment.total : ''), amt: myShare(t)}; })
        .concat(bills.map(function(o){ return {date: o.date, description: o.b.name + ' (conta fixa prevista)', amt: o.amount}; }));
      body += sec(k.m, rows.length ? simpleRowsHtml(rows, function(r){ return r.amt; }) : '<p class="empty-state">Nada nesta categoria.</p>', total);
    });
  } else if (kind === 'exp' || kind === 'inc'){
    var type = kind === 'exp' ? 'expense' : 'income';
    title = (kind === 'exp' ? 'Gastos' : 'Ganhos') + ' · ' + cur.label.split(' de ')[0] + ' × ' + prev.label.split(' de ')[0];
    keys.forEach(function(k){
      var items = monthItems(k.m.key, type), total = kind === 'exp' ? k.p.exp : k.p.inc;
      var rows = items.map(function(t){ return {date: t.date, description: (t.description || catLabel(t.category, t.type)) + (t.installment ? ' ' + t.installment.n + '/' + t.installment.total : ''), amt: type === 'expense' ? myShare(t) : Number(t.amount)}; });
      if (kind === 'exp') rows = rows.concat(k.p.bills.map(function(o){ return {date: o.date, description: o.b.name + ' (conta fixa prevista)', amt: o.amount}; }));
      body += sec(k.m, rows.length ? simpleRowsHtml(rows, function(r){ return r.amt; }) : '<p class="empty-state">Nada neste mês.</p>', total);
    });
  } else {
    title = 'Saldo · ' + cur.label.split(' de ')[0] + ' × ' + prev.label.split(' de ')[0];
    body = '<div class="table-scroll"><table class="data-table"><thead><tr><th></th><th>' + escapeHtml(cur.label) + '</th><th>' + escapeHtml(prev.label) + '</th></tr></thead><tbody>' +
      '<tr><td>Ganhos</td><td class="tabular">' + fmtMoney(keys[0].p.inc) + '</td><td class="tabular">' + fmtMoney(keys[1].p.inc) + '</td></tr>' +
      '<tr><td>Gastos</td><td class="tabular">' + fmtMoney(keys[0].p.exp) + '</td><td class="tabular">' + fmtMoney(keys[1].p.exp) + '</td></tr>' +
      '<tr><td><strong>Saldo</strong></td><td class="tabular"><strong>' + fmtMoney(money(keys[0].p.inc - keys[0].p.exp)) + '</strong></td><td class="tabular"><strong>' + fmtMoney(money(keys[1].p.inc - keys[1].p.exp)) + '</strong></td></tr></tbody></table></div>' +
      '<p class="tx-meta">Saldo = ganhos − gastos do mês (a sua parte). Em meses futuros, é uma previsão.</p>';
  }
  await openModal({title: title, wide: true, submitLabel: null, cancelLabel: 'Fechar', body: body});
}
// Toque numa categoria do gráfico: lista o que foi gasto nela no mês (mesma regra do gráfico: “Tudo” ou só a sua parte).
export async function openCategoryDetail(catId){
  var m = dashMonth(), key = m.key, scope = State.donutScope === 'mine' ? 'mine' : 'all', all = scope === 'all';
  var cat = expenseCats().filter(function(c){ return c.id === catId; })[0] || {label: catId, emoji: ''};
  var items = categoryExpenses(State.transactions, key, catId, all).map(function(t){ return {t: t, v: all ? Number(t.amount) || 0 : myShare(t)}; }).filter(function(x){ return x.v !== 0; });
  var bills = monthProjection(key).bills.filter(function(o){ return o.b.category === catId; });
  var total = money(sum(items, function(x){ return x.v; }) + sum(bills, function(o){ return o.amount; }));
  var rows = items.map(function(x){
    var t = x.t, who = whoLabel(t);
    return '<tr><td>' + formatDateBr(t.date) + '</td><td>' + escapeHtml(t.description || cat.label) + (t.installment ? ' <small class="tx-meta">' + t.installment.n + '/' + t.installment.total + '</small>' : '') +
      (t.paymentMethod === 'cartao' ? ' <small class="tx-meta">cartão</small>' : '') + '</td><td><span class="who-tag ' + (who === 'Seu' ? 'mine' : 'others') + '">' + escapeHtml(!all && t.split ? 'Sua parte (dividida)' : who) + '</span></td><td class="tabular">' + fmtMoney(x.v) + '</td></tr>';
  }).concat(bills.map(function(o){
    return '<tr><td>' + formatDateBr(o.date) + '</td><td>' + escapeHtml(o.b.name) + ' <small class="tx-meta">conta fixa prevista</small></td><td><span class="who-tag mine">Seu</span></td><td class="tabular">' + fmtMoney(o.amount) + '</td></tr>';
  })).join('');
  await openModal({
    title: (cat.emoji ? cat.emoji + ' ' : '') + cat.label + ' · ' + m.label.split(' de ')[0], wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<p class="card-sub">Total <strong class="tabular">' + fmtMoney(total) + '</strong> · ' + (all ? 'tudo o que saiu, inclusive a parte de outras pessoas' : 'só a sua parte') + '</p>' +
      (rows ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Gasto</th><th>De quem</th><th>Valor</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="empty-state">Nada nesta categoria.</p>')
  });
}
