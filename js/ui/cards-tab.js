/*
 * Cartões e faturas: cartão, fatura do mês, pagamento e relatório por cartão.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, formatDateBr, monthLabelOf, shiftMonthKey} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import * as Cards from '../domain/cards.js';
import {invoiceKeyFor, invoiceDates, invoiceLabel} from '../domain/cards.js';
import {pickerHtml, readPicker, wirePicker} from './brand-picker.js';

import {Store} from '../data/store.js';
import {qs, escapeHtml, optionsHtml, labelOf, icon, resolveVar, saveFile, toast} from './dom.js';
import {openModal} from './modal.js';
import {pdfWriter, pdfReady} from './pdf.js';
import {wireTooltips} from './charts.js';
import {isForOther, isPersonal, myShare, othersShare} from '../domain/transactions.js';
import {payAccountFor, renderBanks} from './accounts-tab.js';
import {txRowHtml} from './home-tab.js';
import {State, accountName, cardUsed, catOptions, expenseCats, installmentGroups, invoiceItems, invoiceStatus, k, totalAccountsBalance} from './state.js';
import {installmentRowHtml} from './tx-edit.js';
import {populatePaymentSelect} from './tx-list.js';

/* ---------- Relatório por cartão ---------- */
// Filtros: período, categoria e de quem é o gasto (tudo, só a minha parte ou só a de outras pessoas:
// pago por alguém que vai devolver ou a parte dos outros numa compra dividida).
var WHO = [{id: 'all', label: 'Tudo (minha parte e outras pessoas)'}, {id: 'mine', label: 'Só a minha parte'}, {id: 'others', label: 'Só de outras pessoas'}];
// Parte de cada pessoa num gasto: quem pagou por ela leva tudo; na dividida, a parte proporcional.
function peopleShares(t){
  if (isForOther(t)) return [{person: t.forOther.person || 'Outra pessoa', amount: Number(t.amount) || 0}];
  if (!(t.split && Number(t.split.total) > 0 && isPersonal(t))) return [];
  return (t.split.people || []).map(function(p){ return {person: p.person || 'Outra pessoa', amount: money(Number(t.amount) * Number(p.amount) / Number(t.split.total))}; });
}
export async function cardReport(cardId){
  var c = findById(State.cards, cardId);
  var cats = [{id:'all', label:'Todas as categorias'}].concat(catOptions(expenseCats()));
  var periods = [{id:'1', label:'Fatura atual'}, {id:'3', label:'Últimas 3 faturas'}, {id:'6', label:'Últimas 6 faturas'}, {id:'12', label:'Últimas 12 faturas'}, {id:'next', label:'Próximas faturas (parcelas)'}];
  var st = {period:'6', cat:'all', who:'all'};
  function keys(){
    var base = invoiceKeyFor(todayKey(), c), out = [];
    if (st.period === 'next'){ for (var i=1;i<=12;i++) out.push(shiftMonthKey(base, i)); return out; }
    for (var j=Number(st.period)-1;j>=0;j--) out.push(shiftMonthKey(base, -j));
    return out;
  }
  function amountOf(t){ return st.who === 'mine' ? myShare(t) : st.who === 'others' ? othersShare(t) : Number(t.amount); }
  function data(){
    var ks = keys();
    var rows = ks.map(function(key){
      var items = invoiceItems(c, key).filter(function(t){ return st.cat === 'all' || t.category === st.cat; });
      return {key:key, items:items, mine: money(sum(items, myShare)), others: money(sum(items, othersShare)), total: money(sum(items, amountOf))};
    });
    if (st.period === 'next') rows = rows.filter(function(r){ return r.total !== 0; });
    var byCat = {}, byPerson = {};
    rows.forEach(function(r){ r.items.forEach(function(t){
      byCat[t.category] = (byCat[t.category]||0) + amountOf(t);
      peopleShares(t).forEach(function(p){ var kk = p.person.trim().toLowerCase(); (byPerson[kk] = byPerson[kk] || {person: p.person.trim(), value: 0}).value += p.amount; });
    }); });
    var catRows = expenseCats().map(function(x){ return {label:x.label, color:x.color, value: money(byCat[x.id]||0)}; }).filter(function(x){ return x.value > 0; }).sort(function(a,b){ return b.value - a.value; });
    var people = Object.keys(byPerson).map(function(kk){ return {person: byPerson[kk].person, value: money(byPerson[kk].value)}; }).filter(function(p){ return p.value > 0; }).sort(function(a, b){ return b.value - a.value; });
    return {rows: rows, catRows: catRows, people: people, total: money(sum(rows, function(r){ return r.total; })),
      mine: money(sum(rows, function(r){ return r.mine; })), others: money(sum(rows, function(r){ return r.others; }))};
  }
  function pct(v, t){ return t > 0 ? Math.round(100 * v / t) : 0; }
  function render(modal){
    var d = data(), whoTxt = st.who === 'mine' ? ' da sua parte' : st.who === 'others' ? ' de outras pessoas' : '';
    var max = Math.max(1, Math.max.apply(null, d.rows.map(function(r){ return st.who === 'all' ? r.mine + r.others : r.total; }).concat([0])));
    function seg(cls, v, label, r){
      if (!(v > 0)) return '';
      return '<span class="inv-seg ' + cls + '" style="width:' + (100 * v / max).toFixed(2) + '%" tabindex="0" data-label="' + escapeHtml(invoiceLabel(r.key, c) + ' · ' + label) + '" data-value="' + fmtMoney(v) + '"></span>';
    }
    qs('#crBody', modal).innerHTML = !d.total ? '<p class="empty-state">Nenhum gasto' + whoTxt + ' neste período' + (st.cat !== 'all' ? ' nessa categoria' : '') + '.</p>' :
      '<div class="inv-total cr-split">' +
        '<div><span class="kpi-lbl">Total no período' + whoTxt + '</span><strong class="tabular">' + fmtMoney(d.total) + '</strong></div>' +
        (st.who !== 'others' ? '<div><span class="kpi-lbl"><i class="inv-key mine" aria-hidden="true"></i>Minha parte</span><strong class="tabular">' + fmtMoney(d.mine) + '</strong>' +
          (st.who === 'all' ? '<span class="kpi-sub">' + pct(d.mine, d.total) + '%</span>' : '') + '</div>' : '') +
        (st.who !== 'mine' ? '<div><span class="kpi-lbl"><i class="inv-key others" aria-hidden="true"></i>Outras pessoas</span><strong class="tabular">' + fmtMoney(d.others) + '</strong>' +
          '<span class="kpi-sub">' + (st.who === 'all' ? pct(d.others, d.total) + '% · ' : '') + 'vão te devolver</span></div>' : '') +
      '</div>' +
      '<h4>Por fatura</h4><div class="report-bars">' + d.rows.map(function(r){
        var track = st.who === 'all' ? '<span class="inv-track cr-track">' + seg('mine', r.mine, 'minha parte', r) + seg('others', r.others, 'outras pessoas', r) + '</span>' :
          '<span class="bar-track"><span style="width:' + (100*Math.max(0, r.total)/max) + '%; background: var(' + (st.who === 'mine' ? '--cat-1' : '--cat-4') + ')"></span></span>';
        return '<div class="report-bar"><span>' + monthLabelOf(r.key) + '</span>' + track + '<strong class="tabular">' + fmtMoney(r.total) + '</strong></div>';
      }).join('') + '</div>' +
      (st.who === 'all' ? '<div class="legend"><span class="legend-item"><span class="legend-swatch inv-key mine"></span>Minha parte</span><span class="legend-item"><span class="legend-swatch inv-key others"></span>Outras pessoas</span></div>' : '') +
      (st.who !== 'mine' && d.people.length ? '<h4>Quanto é de cada pessoa</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>Pessoa</th><th>Valor</th><th>%</th></tr></thead><tbody>' +
        d.people.map(function(p){ return '<tr><td>' + escapeHtml(p.person) + '</td><td class="tabular">' + fmtMoney(p.value) + '</td><td class="tabular">' + pct(p.value, d.others) + '%</td></tr>'; }).join('') +
        '</tbody></table></div><p class="tx-meta">Compras pagas por você para a pessoa e a parte dela nas compras divididas. O que já foi devolvido aparece em “Me devem”.</p>' : '') +
      '<h4>Por categoria</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' + d.catRows.map(function(x){
        return '<tr><td><span class="legend-swatch" style="display:inline-block;margin-right:6px;background:' + resolveVar(x.color) + '"></span>' + escapeHtml(x.label) + '</td><td class="tabular">' + fmtMoney(x.value) + '</td><td class="tabular">' + pct(x.value, d.total) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
    wireTooltips(qs('#crBody', modal), '.inv-seg');
  }
  function pdf(){
    if (!pdfReady()) return;
    var d = data();
    var w = pdfWriter('Relatório do cartão ' + c.name, labelOf(periods, st.period) + '  ·  ' + labelOf(cats, st.cat) + '  ·  ' + labelOf(WHO, st.who));
    w.section('Por fatura');
    if (st.who === 'all'){
      var cw = [150, 110, 110, 100];
      w.header(['Fatura', 'Minha parte', 'Outras pessoas', 'Total'], cw);
      d.rows.forEach(function(r){ w.row([invoiceLabel(r.key, c), fmtMoney(r.mine), fmtMoney(r.others), fmtMoney(r.total)], cw); });
      w.row(['Total', fmtMoney(d.mine), fmtMoney(d.others), fmtMoney(d.total)], cw, {bold:true});
    } else {
      w.header(['Fatura', 'Total'], [220, 140]);
      d.rows.forEach(function(r){ w.row([invoiceLabel(r.key, c), fmtMoney(r.total)], [220, 140]); });
      w.row(['Total', fmtMoney(d.total)], [220, 140], {bold:true});
    }
    w.space(12);
    if (st.who !== 'mine' && d.people.length){
      w.section('Quanto é de cada pessoa'); w.header(['Pessoa', 'Valor', '%'], [220, 140, 80]);
      d.people.forEach(function(p){ w.row([p.person, fmtMoney(p.value), pct(p.value, d.others) + '%'], [220, 140, 80]); });
      w.space(12);
    }
    w.section('Por categoria');
    if (!d.catRows.length) w.text('Nenhuma compra no período.');
    else { w.header(['Categoria', 'Valor', '%'], [220, 140, 80]); d.catRows.forEach(function(x){ w.row([x.label, fmtMoney(x.value), pct(x.value, d.total) + '%'], [220, 140, 80]); }); }
    w.footer();
    saveFile('grana-leve-relatorio-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.pdf', w.doc.output('blob'), 'application/pdf').then(function(){ toast('Relatório baixado.'); });
  }
  await openModal({
    title: 'Relatório · ' + c.name, wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<div class="report-filters cr-filters">' +
        '<div class="field"><label for="crPeriod">Período</label><select id="crPeriod">' + optionsHtml(periods, st.period) + '</select></div>' +
        '<div class="field"><label for="crCat">Categoria</label><select id="crCat">' + optionsHtml(cats, st.cat) + '</select></div>' +
        '<div class="field"><label for="crWho">De quem</label><select id="crWho">' + optionsHtml(WHO, st.who) + '</select></div>' +
      '</div><div id="crBody" class="stack"></div>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-cr-pdf>Baixar em PDF</button></div>',
    onOpen: function(modal){
      render(modal);
      modal.addEventListener('change', function(){ st.period = qs('#crPeriod', modal).value; st.cat = qs('#crCat', modal).value; st.who = qs('#crWho', modal).value; render(modal); });
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
// Situação da fatura em palavras simples (a pílula mostra só a palavra: aberta, fechada, vencida, paga).
var STATUS_TEXT = {aberta: 'Ainda recebe compras', fechada: 'Fechou, aguardando pagamento', vencida: 'Venceu: pague o quanto antes', paga: 'Fatura paga'};
function daysUntil(date){ return Math.round((Date.parse(date) - Date.parse(todayKey())) / 86400000); }
function dueNote(date, status){
  if (status === 'paga') return 'já paga';
  var d = daysUntil(date);
  return d < 0 ? 'venceu há ' + (-d) + (d === -1 ? ' dia' : ' dias') : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : 'em ' + d + ' dias';
}
// Seção do cartão dentro do bloco do banco (o nome e o ícone ficam no cabeçalho do banco): limite
// disponível, fatura do mês, vencimento e situação numa linha; ações no cabeçalho da seção.
export function cardHtml(c){
  var key = shiftMonthKey(invoiceKeyFor(todayKey(), c), State.invoiceOffsets[c.id] || 0);
  var items = invoiceItems(c, key), carries = Cards.carryIns(c, key);
  var total = Cards.invoiceTotal(State.transactions, c, key);
  var dates = invoiceDates(key, c);
  var partial = Cards.partialPayment(c, key);
  var status = invoiceStatus(c, key);
  var used = cardUsed(c), limit = Number(c.limit) || 0;
  var pct = limit > 0 ? Math.min(1, used / limit) : 0;
  var paidWith = (c.invoicePayments || {})[key];
  var payAcc = State.accounts.length ? accountName(payAccountFor(c)) : '';
  var gs = installmentGroups().filter(function(g){ return g.cardId === c.id && g.future.length; });
  return '<div class="bank-sec credit-card" aria-label="Cartão de crédito ' + escapeHtml(c.name) + '">' +
    '<div class="sec-head"><span class="sec-title">' + icon('card') + 'Cartão de crédito<span class="tx-meta"> · fecha dia ' + c.closingDay + ' · vence dia ' + c.dueDay +
      (payAcc ? ' · paga com ' + escapeHtml(payAcc) : '') + '</span></span>' +
      '<span class="sec-actions"><button class="btn btn-ghost btn-sm" type="button" data-card-report="' + c.id + '">Relatório</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-card-edit="' + c.id + '">Editar cartão</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-card-del="' + c.id + '">Excluir cartão</button></span></div>' +
    '<div class="sec-kpis card-kpis">' +
      '<div class="kpi avail"><span class="kpi-lbl">Limite disponível</span><strong class="tabular kpi-val">' + fmtMoney(Math.max(0, limit - used)) + '</strong>' +
        '<span class="kpi-sub tabular">de ' + fmtMoney(limit) + ' · usado ' + Math.round(pct * 100) + '%</span>' +
        '<div class="progress thin" role="img" aria-label="Limite usado: ' + Math.round(pct * 100) + '%"><span style="width:' + (pct*100) + '%; background:' + (pct >= 0.9 ? 'var(--critical)' : pct >= 0.7 ? 'var(--warning)' : 'var(--brand)') + '"></span></div></div>' +
      '<div class="kpi"><span class="kpi-lbl inv-nav">' +
          '<button type="button" data-inv-shift="' + c.id + '" data-dir="-1" aria-label="Fatura anterior">' + icon('chevron-left') + '</button>' +
          '<span>Fatura de ' + invoiceLabel(key, c) + '</span>' +
          '<button type="button" data-inv-shift="' + c.id + '" data-dir="1" aria-label="Próxima fatura">' + icon('chevron-right') + '</button></span>' +
        '<strong class="invoice-total tabular kpi-val">' + fmtMoney(total) + '</strong><span class="kpi-sub">fecha ' + formatDateBr(dates.closing) + '</span></div>' +
      '<div class="kpi"><span class="kpi-lbl">Vencimento</span><strong class="tabular kpi-val">' + formatDateBr(dates.due) + '</strong>' +
        '<span class="kpi-sub' + (status === 'vencida' ? ' neg-text' : '') + '">' + dueNote(dates.due, status) + '</span></div>' +
      '<div class="kpi"><span class="kpi-lbl">Situação</span><span class="status-pill pill-lg ' + (partial ? 'warning' : INVOICE_PILL[status]) + '">' + (partial ? 'paga em parte' : status) + '</span>' +
        '<span class="kpi-sub">' + (partial ? partialText(c, key, partial) : paidWith && paidWith.accountId ? 'Paga com ' + escapeHtml(accountName(paidWith.accountId)) : STATUS_TEXT[status]) + '</span></div>' +
    '</div>' +
    '<div class="sec-foot">' +
      (total > 0 ? '<button class="btn ' + (status === 'paga' ? 'btn-ghost' : 'btn-primary') + ' btn-sm" type="button" data-inv-paid="' + c.id + '" data-key="' + key + '">' + (status === 'paga' ? (partial ? 'Desfazer pagamento' : 'Desmarcar paga') : 'Pagar fatura') + '</button>' : '') +
      '<button class="btn btn-ghost btn-sm" type="button" data-inv-pdf="' + c.id + '" data-key="' + key + '">Fatura em PDF</button>' +
      (carries.length ? '<div class="carry-list">' + carries.map(function(x){ return carryRowHtml(c, x); }).join('') + '</div>' : '') +
      (items.length ? '<details class="budget-details"><summary>Ver as ' + items.length + ' compra(s) desta fatura</summary>' +
        '<p class="tx-meta same-tx-note">São as mesmas compras de “Ganhos e gastos”, agrupadas pela fatura em que entraram: não somam de novo.</p>' +
        items.map(txRowHtml).join('') + '</details>' : carries.length ? '' : '<span class="tx-meta">Nenhuma compra nesta fatura.</span>') +
      (gs.length ? '<details class="budget-details"><summary>Compras parceladas (' + gs.length + ')</summary><div class="debt-grid" style="margin-top:8px">' + gs.map(function(g){ return installmentRowHtml(g, false); }).join('') + '</div></details>' : '') +
    '</div></div>';
}

// Fatura paga em parte: quanto foi pago e para onde foi o resto.
function partialText(c, key, p){
  var next = invoiceLabel(shiftMonthKey(key, 1), c);
  return 'Pagou ' + fmtMoney(p.amount) + (p.accountId ? ' com ' + escapeHtml(accountName(p.accountId)) : '') + ' · ' +
    (p.mode === 'parcelado' ? 'resto em ' + p.n + 'x de ' + fmtMoney(p.parcel) + ' desde ' + next : 'faltou ' + fmtMoney(p.rest) + ', foi para ' + next);
}
// Saldo que veio de uma fatura anterior (não é compra nova: só a parte do principal; os juros aparecem
// como compra "Juros do ...").
export function carryRowHtml(c, x){
  var from = invoiceLabel(x.from, c);
  return '<div class="carry-row"><span>' + icon('swap') + (x.mode === 'parcelado' ? 'Parcelamento da fatura de ' + from + ' (' + x.i + '/' + x.n + ')' : 'Saldo em aberto da fatura de ' + from) +
    '<span class="tx-meta"> · sem os juros</span></span><strong class="tabular">' + fmtMoney(x.amount) + '</strong></div>';
}

export function cardFormBody(c){
  c = c || {};
  return '<div class="field"><label for="ecName">Nome do cartão</label><input id="ecName" name="name" type="text" maxlength="40" value="' + escapeHtml(c.name||'') + '"></div>' +
    '<div class="field"><label for="ecLimit">Limite</label><span class="money-input"><span>R$</span><input id="ecLimit" name="limit" type="text" data-money autocomplete="off" inputmode="decimal" value="' + (c.limit||'') + '"></span></div>' +
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
