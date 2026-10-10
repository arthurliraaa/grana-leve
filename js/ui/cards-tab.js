/*
 * Cartões e faturas: cartão, fatura do mês, pagamento e relatório por cartão.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, formatDateBr, formatDateFull, monthLabelOf, shiftMonthKey} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import * as Cards from '../domain/cards.js';
import {invoiceKeyFor, invoiceDates, invoiceLabel} from '../domain/cards.js';
import {pickerHtml, readPicker, wirePicker} from './brand-picker.js';
import {lookOf, cardPaint} from '../domain/brands.js';
import {Store} from '../data/store.js';
import {qs, escapeHtml, optionsHtml, labelOf, icon, resolveVar, saveFile, toast} from './dom.js';
import {openModal} from './modal.js';
import {pdfWriter, pdfReady} from './pdf.js';
import {payAccountFor, renderBanks} from './accounts-tab.js';
import {txRowHtml} from './home-tab.js';
import {State, accountName, cardUsed, catOptions, expenseCats, installmentGroups, invoiceItems, invoiceStatus, k, totalAccountsBalance} from './state.js';
import {installmentRowHtml} from './tx-edit.js';
import {populatePaymentSelect} from './tx-list.js';

/* ---------- Relatório por cartão ---------- */
export async function cardReport(cardId){
  var c = findById(State.cards, cardId);
  var cats = [{id:'all', label:'Todas as categorias'}].concat(catOptions(expenseCats()));
  var periods = [{id:'1', label:'Fatura atual'}, {id:'3', label:'Últimas 3 faturas'}, {id:'6', label:'Últimas 6 faturas'}, {id:'12', label:'Últimas 12 faturas'}, {id:'next', label:'Próximas faturas (parcelas)'}];
  var st = {period:'6', cat:'all'};
  function keys(){
    var base = invoiceKeyFor(todayKey(), c), out = [];
    if (st.period === 'next'){ for (var i=1;i<=12;i++) out.push(shiftMonthKey(base, i)); return out; }
    for (var j=Number(st.period)-1;j>=0;j--) out.push(shiftMonthKey(base, -j));
    return out;
  }
  function data(){
    var ks = keys();
    var rows = ks.map(function(key){
      var items = invoiceItems(c, key).filter(function(t){ return st.cat === 'all' || t.category === st.cat; });
      return {key:key, items:items, total: sum(items, function(t){ return t.amount; })};
    });
    if (st.period === 'next') rows = rows.filter(function(r){ return r.total > 0; });
    var byCat = {};
    rows.forEach(function(r){ r.items.forEach(function(t){ byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); }); });
    var catRows = expenseCats().map(function(x){ return {label:x.label, color:x.color, value: byCat[x.id]||0}; }).filter(function(x){ return x.value > 0; }).sort(function(a,b){ return b.value - a.value; });
    return {rows: rows, catRows: catRows, total: sum(rows, function(r){ return r.total; })};
  }
  function render(modal){
    var d = data();
    var max = Math.max(1, Math.max.apply(null, d.rows.map(function(r){ return r.total; }).concat([0])));
    qs('#crBody', modal).innerHTML = !d.total ? '<p class="empty-state">Nenhuma compra neste período' + (st.cat !== 'all' ? ' nessa categoria' : '') + '.</p>' :
      '<div class="tile"><span class="tile-lbl">Total no período</span><span class="tile-val tabular">' + fmtMoney(d.total) + '</span></div>' +
      '<h4>Por fatura</h4><div class="report-bars">' + d.rows.map(function(r){
        return '<div class="report-bar"><span>' + monthLabelOf(r.key) + '</span><span class="bar-track"><span style="width:' + (100*r.total/max) + '%"></span></span><strong class="tabular">' + fmtMoney(r.total) + '</strong></div>';
      }).join('') + '</div>' +
      '<h4>Por categoria</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' + d.catRows.map(function(x){
        return '<tr><td><span class="legend-swatch" style="display:inline-block;margin-right:6px;background:' + resolveVar(x.color) + '"></span>' + escapeHtml(x.label) + '</td><td class="tabular">' + fmtMoney(x.value) + '</td><td class="tabular">' + Math.round(100*x.value/d.total) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function pdf(){
    if (!pdfReady()) return;
    var d = data();
    var w = pdfWriter('Relatório do cartão ' + c.name, labelOf(periods, st.period) + '  ·  ' + labelOf(cats, st.cat));
    w.section('Por fatura'); w.header(['Fatura', 'Total'], [220, 140]);
    d.rows.forEach(function(r){ w.row([invoiceLabel(r.key, c), fmtMoney(r.total)], [220, 140]); });
    w.row(['Total', fmtMoney(d.total)], [220, 140], {bold:true}); w.space(12);
    w.section('Por categoria');
    if (!d.catRows.length) w.text('Nenhuma compra no período.');
    else { w.header(['Categoria', 'Valor', '%'], [220, 140, 80]); d.catRows.forEach(function(x){ w.row([x.label, fmtMoney(x.value), Math.round(100*x.value/d.total) + '%'], [220, 140, 80]); }); }
    w.footer();
    saveFile('grana-leve-relatorio-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.pdf', w.doc.output('blob'), 'application/pdf').then(function(){ toast('Relatório baixado.'); });
  }
  await openModal({
    title: 'Relatório · ' + c.name, wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<div class="report-filters">' +
        '<div class="field"><label for="crPeriod">Período</label><select id="crPeriod">' + optionsHtml(periods, st.period) + '</select></div>' +
        '<div class="field"><label for="crCat">Categoria</label><select id="crCat">' + optionsHtml(cats, st.cat) + '</select></div>' +
      '</div><div id="crBody" class="stack"></div>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-cr-pdf>Baixar em PDF</button></div>',
    onOpen: function(modal){
      render(modal);
      modal.addEventListener('change', function(){ st.period = qs('#crPeriod', modal).value; st.cat = qs('#crCat', modal).value; render(modal); });
      qs('[data-cr-pdf]', modal).addEventListener('click', pdf);
    }
  });
}

/* ---------- Cartões e faturas ---------- */

export var INVOICE_PILL = {aberta:'good', fechada:'warning', vencida:'critical', paga:'good'};

// Resumo de "Contas e cartões": dinheiro nas contas, faturas a pagar e quanto sobra depois.
export function renderWalletSummary(){
  var el = document.getElementById('walletSummary');
  if (!State.accounts.length && !State.cards.length){ el.innerHTML = ''; return; }
  var inv = Cards.invoicesSummary(State.transactions, State.cards, todayKey());
  var cash = State.accounts.length ? totalAccountsBalance() : null;
  var next = inv.toPay[0];
  function box(label, value, sub, cls){ return '<div class="ws-box"><span class="tile-lbl">' + label + '</span><strong class="tabular ' + (cls || '') + '">' + fmtMoney(value) + '</strong>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>'; }
  el.innerHTML = (cash !== null ? box('Nas contas', cash, State.accounts.length + (State.accounts.length > 1 ? ' contas' : ' conta'), cash < 0 ? 'neg-text' : '') : '') +
    (State.cards.length ? box('Faturas a pagar', inv.toPayTotal, next ? (next.status === 'vencida' ? 'venceu ' : 'vence ') + formatDateBr(next.due) + ' · ' + escapeHtml(next.card.name) : 'nenhuma fechada') +
      box('Fatura aberta', inv.openTotal, 'ainda recebe compras') : '') +
    (cash !== null && State.cards.length ? box('Sobra depois de pagar', money(cash - inv.toPayTotal), 'contas − faturas fechadas', cash - inv.toPayTotal < 0 ? 'neg-text' : '') : '');
}
// Cartões aparecem dentro do bloco do banco (renderBanks, em accounts-tab.js).
export function renderCards(){
  renderWalletSummary();
  renderBanks();
}
// Um cartão: limite disponível, fatura do mês (com navegação), compras, parceladas e ações.
export function cardHtml(c){
  var baseKey = invoiceKeyFor(todayKey(), c);
  var key = shiftMonthKey(baseKey, State.invoiceOffsets[c.id] || 0);
  var items = invoiceItems(c, key);
  var total = sum(items, function(t){ return t.amount; });
  var dates = invoiceDates(key, c);
  var status = invoiceStatus(c, key);
  var used = cardUsed(c);
  var limit = Number(c.limit) || 0;
  var pct = limit > 0 ? Math.min(1, used/limit) : 0;
  var look = lookOf(c), paint = look.color ? cardPaint(look.color) : null;
  return '<div class="credit-card">' +
    '<div class="credit-card-top' + (paint ? ' painted' : '') + '"' + (paint ? ' style="background:linear-gradient(135deg,' + paint.from + ',' + paint.to + ');color:' + paint.text + '"' : '') + '>' +
      '<div class="cc-title"><span class="bank-badge on-card" aria-hidden="true">' + escapeHtml(look.mark) + '</span>' +
        '<div><h4>' + escapeHtml(c.name) + '</h4><span class="sub">Fecha dia ' + c.closingDay + ' · vence dia ' + c.dueDay + '</span>' +
          (State.accounts.length ? '<span class="sub">Paga com ' + escapeHtml(accountName(payAccountFor(c))) + '</span>' : '') + '</div></div>' +
      '<div class="avail"><span class="sub">Limite disponível</span><strong class="tabular">' + fmtMoney(Math.max(0, limit - used)) + '</strong><span class="sub">de ' + fmtMoney(limit) + '</span></div>' +
    '</div>' +
    '<div class="credit-card-body">' +
      '<div class="progress" title="Limite usado"><span style="width:' + (pct*100) + '%; background:' + (pct >= 0.9 ? 'var(--critical)' : pct >= 0.7 ? 'var(--warning)' : 'var(--brand)') + '"></span></div>' +
      '<div class="invoice-head">' +
        '<div class="month-switch">' +
          '<button type="button" data-inv-shift="' + c.id + '" data-dir="-1" aria-label="Fatura anterior">' + icon('chevron-left') + '</button>' +
          '<strong>Fatura de ' + invoiceLabel(key, c) + '</strong>' +
          '<button type="button" data-inv-shift="' + c.id + '" data-dir="1" aria-label="Próxima fatura">' + icon('chevron-right') + '</button>' +
        '</div>' +
        '<span class="status-pill ' + INVOICE_PILL[status] + '">' + status + ((c.invoicePayments || {})[key] ? ' com ' + escapeHtml(accountName(c.invoicePayments[key].accountId)) : '') + '</span>' +
      '</div>' +
      '<div class="invoice-head"><span class="invoice-total tabular">' + fmtMoney(total) + '</span>' +
        '<span class="meta-line"><span>Fecha ' + formatDateFull(dates.closing) + '</span><span>Vence ' + formatDateFull(dates.due) + '</span></span></div>' +
      (items.length ? '<details class="budget-details"><summary>Ver ' + items.length + ' compra(s)</summary>' + items.map(txRowHtml).join('') + '</details>' : '<p class="tx-meta">Nenhuma compra nesta fatura.</p>') +
      (function(){
        var gs = installmentGroups().filter(function(g){ return g.cardId === c.id && g.future.length; });
        return gs.length ? '<details class="budget-details"><summary>Compras parceladas (' + gs.length + ')</summary><div class="debt-grid" style="margin-top:8px">' + gs.map(function(g){ return installmentRowHtml(g, false); }).join('') + '</div></details>' : '';
      })() +
      '<div class="card-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-inv-pdf="' + c.id + '" data-key="' + key + '">Ver fatura em PDF</button>' +
        (total > 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-inv-paid="' + c.id + '" data-key="' + key + '">' + (status === 'paga' ? 'Desmarcar paga' : 'Marcar como paga') + '</button>' : '') +
        '<button class="btn btn-ghost btn-sm" type="button" data-card-report="' + c.id + '">Relatório</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-card-edit="' + c.id + '">Editar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-card-del="' + c.id + '">Excluir</button>' +
      '</div>' +
    '</div></div>';
}

export function cardFormBody(c){
  c = c || {};
  return '<div class="field"><label for="ecName">Nome do cartão</label><input id="ecName" name="name" type="text" maxlength="40" value="' + escapeHtml(c.name||'') + '"></div>' +
    '<div class="field"><label for="ecLimit">Limite</label><span class="money-input"><span>R$</span><input id="ecLimit" name="limit" type="number" step="0.01" min="0" max="99999999" value="' + (c.limit||'') + '"></span></div>' +
    '<div class="field"><label for="ecClosing">Dia do fechamento</label><input id="ecClosing" name="closing" type="number" min="1" max="31" value="' + (c.closingDay||'') + '"></div>' +
    '<div class="field"><label for="ecDue">Dia do vencimento</label><input id="ecDue" name="due" type="number" min="1" max="31" value="' + (c.dueDay||'') + '"></div>' +
    (State.accounts.length ? '<div class="field"><label for="ecPayAcc">Conta que paga a fatura</label><select id="ecPayAcc" name="payAcc">' +
      optionsHtml([{id: '', label: 'Automático (mesmo banco do cartão)'}].concat(State.accounts.map(function(a){ return {id: a.id, label: a.name}; })), c.payAccountId || '') + '</select>' +
      '<span class="field-hint">Vem marcada ao pagar a fatura. Dá para trocar na hora.</span></div>' : '') +
    '<fieldset class="brand-fieldset"><legend><span id="ecPreview"></span>Cor e ícone</legend>' + pickerHtml('ecP', c) + '</fieldset>';
}
export function readCardFields(name, limit, closing, due){
  name = String(name).trim();
  limit = money(limit); closing = Number(closing); due = Number(due);
  if (!name) return {error:'Dê um nome para o cartão.'};
  if (!(limit >= 0)) return {error:'Informe o limite do cartão.'};
  if (!(closing >= 1 && closing <= 31) || !(due >= 1 && due <= 31) || closing % 1 || due % 1) return {error:'Os dias de fechamento e vencimento vão de 1 a 31.'};
  return {name:name, limit:limit, closingDay:closing, dueDay:due};
}

export async function editCard(id){
  var c = findById(State.cards, id);
  await openModal({
    title: 'Editar cartão', body: cardFormBody(c),
    onOpen: function(modal){ wirePicker(modal, 'ecP', qs('#ecName', modal), qs('#ecPreview', modal)); },
    onSubmit: async function(form){
      var v = readCardFields(form.name.value, form.limit.value, form.closing.value, form.due.value);
      if (v.error) return v;
      Object.assign(v, readPicker(form, 'ecP'));
      if (form.payAcc) v.payAccountId = form.payAcc.value || null;
      await Store.update(k(), 'cards', id, v);
      Object.assign(c, v);
      renderCards(); populatePaymentSelect();
      toast('Cartão atualizado.');
    }
  });
}
