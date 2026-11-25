/*
 * Ganhos e gastos: lista, filtros, calendário, seletor de parcelas e divisão de compras.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, formatDateBr, formatDateFull, validDateStr, monthBounds, shiftMonthKey, monthsBetween} from '../domain/dates.js';
import {creditDate} from '../domain/vouchers.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import * as Cats from '../domain/categories.js';
import {CUSTOM_COLORS} from '../domain/categories.js';
import * as Tx from '../domain/transactions.js';
import {MAX_INSTALLMENTS, clampInstall, isForOther, isRefund, isPersonal, myShare, othersShare, splitShares} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import {invoiceKeyFor, invoiceDates} from '../domain/cards.js';
import {recvNextAmount, recvNextDue, recvRemaining} from '../domain/receivables.js';

import {billMonth} from './bills.js';
import {monthGridHtml, dayEventsHtml, yearHtml} from './calendar.js';
import {Store} from '../data/store.js';

import {getPrefs, setPref} from '../data/session.js';
import {qs, qsa, csvCell, optionsHtml, icon, saveFile, toast, escapeHtml, autoFocus} from './dom.js';
import {openModal} from './modal.js';
import {PAYMENT_LABELS} from './constants.js';
import {paymentLabel, txRowHtml} from './home-tab.js';
import {renderBudgets} from './planning-tab.js';
import {renderAll, showTab} from './shell.js';
import {State, catLabel, categoryNameProblem, categorySelectHtml, wireCategorySuggestion, expandInstallments, expenseCats, forecastOccurrences, incomeCats, installHint, invoiceStatus, k, maxTxMonthOffset, txForMonth, voucherOf} from './state.js';
import {manageCategories, openTxModal, saveTransactions, savedToast} from './tx-edit.js';

/* ---------- Ganhos e gastos ---------- */
export function currentTxType(){ return qs('#typeToggle button.active').getAttribute('data-type'); }

var resetTxCatSuggestion = function(){};
export function populateCategorySelect(selected){
  var sel = document.getElementById('txCategory');
  var c = categorySelectHtml(currentTxType(), selected, true);
  sel.innerHTML = c.html;
  if (!selected){ sel.value = c.first; resetTxCatSuggestion(); }
}
// Formas de pagamento de um gasto (usadas no formulário da aba e no popup de lançamento).
export function paymentOptions(){
  var opts = [];
  if (State.accounts.length){
    State.accounts.forEach(function(a){ opts.push({id:'acc:' + a.id, label:'Pix ou débito · ' + a.name}); });
    opts.push({id:'conta', label:'Dinheiro (fora das contas)'});
  } else opts.push({id:'conta', label: PAYMENT_LABELS.conta});
  if (State.vouchers.length) State.vouchers.forEach(function(v){ opts.push({id:'vale:' + v.id, label:'Vale · ' + v.name}); });
  else opts.push({id:'vale', label: PAYMENT_LABELS.vale});
  State.cards.forEach(function(c){ opts.push({id:'card:' + c.id, label:'Cartão de crédito · ' + c.name}); });
  if (!State.cards.length) opts.push({id:'card:none', label:'Cartão de crédito (cadastre em Contas e cartões)'});
  return opts;
}
// Valor do select de pagamento que corresponde a um lançamento já salvo.
export function paymentValue(t){
  if (t.paymentMethod === 'cartao' && t.cardId) return 'card:' + t.cardId;
  if (t.paymentMethod === 'vale'){ var v = voucherOf(t); return v ? 'vale:' + v.id : 'vale'; }
  if (t.accountId && findById(State.accounts, t.accountId)) return 'acc:' + t.accountId;
  return 'conta';
}
// Contas para o campo “Entrou em” / “Saiu de”. A primeira conta vem marcada.
export function accountOptions(){
  return State.accounts.map(function(a){ return {id: a.id, label: a.name}; }).concat([{id:'', label:'Não informar (dinheiro)'}]);
}
export function accountSelectHtml(id, name, label, selected){
  if (!State.accounts.length) return '';
  return '<div class="field" id="' + id + 'Field"><label for="' + id + '">' + label + '</label><select id="' + id + '" name="' + name + '">' +
    optionsHtml(accountOptions(), selected === undefined ? State.accounts[0].id : (selected || '')) + '</select></div>';
}
// Grava no lançamento a forma de pagamento escolhida. Campos que não se aplicam ficam nulos,
// para que a edição apague o cartão ou o vale de antes.
export function applyPayment(tx, pay){
  tx.cardId = null; tx.voucherId = null; tx.accountId = null;
  if (pay.indexOf('card:') === 0){ tx.paymentMethod = 'cartao'; tx.cardId = pay.slice(5); }
  else if (pay.indexOf('vale:') === 0){ tx.paymentMethod = 'vale'; tx.voucherId = pay.slice(5); }
  else if (pay.indexOf('acc:') === 0){ tx.paymentMethod = 'conta'; tx.accountId = pay.slice(4); }
  else tx.paymentMethod = pay;
}
export function populatePaymentSelect(){
  var sel = document.getElementById('txPayment');
  var prev = sel.value;
  var opts = paymentOptions();
  sel.innerHTML = optionsHtml(opts, prev);
  // Ao cadastrar a primeira conta, ela passa a ser o padrão no lugar de “Dinheiro”.
  var hadAccounts = sel.getAttribute('data-accounts') === '1';
  if (!findById(opts, prev) || (prev === 'conta' && !hadAccounts)) sel.value = opts[0].id;
  sel.setAttribute('data-accounts', State.accounts.length ? '1' : '0');
  var acc = document.getElementById('txAccount');
  var prevAcc = acc.value;
  acc.innerHTML = optionsHtml(accountOptions(), prevAcc);
  if (!findById(accountOptions(), prevAcc)) acc.value = State.accounts.length ? State.accounts[0].id : '';
  syncTxFormVisibility();
}
/* ---------- Seletor de parcelas (− 3x +) ---------- */
export function installStepperHtml(id, name){
  return '<div class="stepper"><button type="button" data-step="-1" data-for="' + id + '" aria-label="Menos parcelas">−</button>' +
    '<input id="' + id + '" name="' + name + '" type="number" min="1" max="' + MAX_INSTALLMENTS + '" step="1" value="1" inputmode="numeric">' +
    '<span class="stepper-x" aria-hidden="true">x</span><button type="button" data-step="1" data-for="' + id + '" aria-label="Mais parcelas">+</button></div>';
}
// Opção da compra parcelada: se o valor digitado é o total ou o valor de cada parcela.
// Não há pergunta de "parcela atual": a data da compra e o cartão dizem quais parcelas já venceram.
export function installExtrasHtml(p){
  return '<div class="install-extras" id="' + p + 'Extras" hidden>' +
    '<fieldset class="radio-group"><legend>O valor digitado é</legend>' +
      '<label class="check"><input type="radio" name="' + p + 'Mode" value="total" checked> o total da compra</label>' +
      '<label class="check"><input type="radio" name="' + p + 'Mode" value="parcela"> o valor de cada parcela</label></fieldset>' +
    '</div>';
}
// {per, start}: start = primeira parcela ainda não vencida, pela data da compra e pelo cartão.
export function readInstallExtras(root, p, n, date, cardId){
  var box = root.querySelector('#' + p + 'Extras');
  var card = cardId && findById(State.cards, cardId);
  var start = card && n > 1 && validDateStr(date) ? Cards.firstDueInstallment(date, n, card, todayKey()) : 1;
  return {per: !!(box && n > 1 && root.querySelector('input[name=' + p + 'Mode]:checked').value === 'parcela'), start: start};
}
export function resetInstallExtras(root, p){
  var box = root.querySelector('#' + p + 'Extras');
  if (box) root.querySelector('input[name=' + p + 'Mode][value=total]').checked = true;
}
// Resumo: parcelas, total, parcelas já vencidas e em qual fatura a compra (ou a próxima parcela) entra.
export function installSummary(root, p, n, typed, date, cardId){
  var box = root.querySelector('#' + p + 'Extras');
  if (box) box.hidden = n <= 1;
  var ex = readInstallExtras(root, p, n, date, cardId);
  var card = cardId && findById(State.cards, cardId);
  if (ex.start > n) return 'Todas as ' + n + ' parcelas dessa compra já venceram: não há nada a lançar. Confira a data da compra.';
  var text = installHint(n, Tx.purchaseTotal(typed, n, ex.per), ex.start);
  if (card && validDateStr(date)){
    // Parcela i: fatura da compra + (i−1), como Cards.txInvoiceKey (não pela data da parcela).
    var ik = Cards.txInvoiceKey({date: date, purchaseDate: date, installment: n > 1 ? {n: ex.start} : null}, card), inv = invoiceDates(ik, card);
    text += ' · ' + (n > 1 ? (ex.start > 1 ? 'a ' + ex.start + 'ª parcela' : 'a 1ª parcela') + ' entra' : 'entra') + ' na fatura de ' + Cards.invoiceLabel(ik, card) +
      ' (fecha ' + formatDateBr(inv.closing) + ', vence ' + formatDateBr(inv.due) + ')';
  }
  return text;
}
// Cartão escolhido num select de forma de pagamento ("card:id"), ou null.
export function cardIdOf(pay){ return pay && pay.indexOf('card:') === 0 && pay !== 'card:none' ? pay.slice(5) : null; }
// Compra antiga para outra pessoa: avisa quantas parcelas já venceram e pergunta se ela já devolveu.
export function syncPriorBox(){
  var box = document.getElementById('txPriorBox');
  if (!box) return;
  var n = clampInstall(document.getElementById('txInstall').value), card = cardIdOf(document.getElementById('txPayment').value);
  var forSomeone = document.getElementById('txForOther').checked || document.getElementById('txSplit').checked;
  var start = n > 1 && card ? readInstallExtras(document, 'txIx', n, document.getElementById('txDate').value, card).start : 1;
  var k2 = Math.min(n, start - 1);
  box.hidden = !(forSomeone && k2 > 0 && currentTxType() === 'expense');
  if (box.hidden) return;
  var per = Tx.purchaseTotal(money(document.getElementById('txAmount').value), n, readInstallExtras(document, 'txIx', n).per) / n;
  document.getElementById('txPriorText').textContent = (k2 === 1 ? 'A 1ª parcela já venceu' : 'As ' + k2 + ' primeiras parcelas já venceram') +
    ' antes deste cadastro' + (per > 0 ? ' (' + fmtMoney(per * k2) + ')' : '') + '. Elas aparecem como pagas na fatura. E a pessoa:';
}
export function populateInstallSelect(){
  syncPriorBox();
  var inp = document.getElementById('txInstall');
  document.getElementById('txInstallHint').textContent = installSummary(document, 'txIx', clampInstall(inp.value), money(document.getElementById('txAmount').value),
    document.getElementById('txDate').value, cardIdOf(document.getElementById('txPayment').value));
}
export function syncTxFormVisibility(){
  var isExpense = currentTxType() === 'expense';
  var onCard = isExpense && document.getElementById('txPayment').value.indexOf('card:') === 0 && document.getElementById('txPayment').value !== 'card:none';
  document.getElementById('txInstallField').hidden = !onCard;
  if (!onCard){ document.getElementById('txInstall').value = '1'; resetInstallExtras(document, 'txIx'); }
  populateInstallSelect();
  document.getElementById('txPaymentField').hidden = !isExpense;
  document.getElementById('txSalaryLink').hidden = isExpense;   // ganho: calcular o líquido do salário
  document.getElementById('txAccountField').hidden = isExpense || !State.accounts.length;
  document.getElementById('txForOtherField').hidden = !isExpense;
  var other = document.getElementById('txForOther').checked;
  document.getElementById('txOtherName').hidden = !other;
  document.getElementById('txOtherHint').hidden = !other;
  var split = isExpense && document.getElementById('txSplit').checked;
  // "Mais opções" fica aberto enquanto uma delas estiver marcada; o botão diz o que vai salvar.
  if (other || split) document.getElementById('txForOtherField').open = true;
  document.getElementById('txSubmit').textContent = isExpense ? 'Salvar gasto' : 'Salvar ganho';
  document.getElementById('txSplitBox').hidden = !split;
  if (split && !qs('#txSplitRows .split-row')) addSplitRow();
  updateSplitSummary();
}

/* ---------- Dividir uma compra com outras pessoas ---------- */
// Uma linha “pessoa + parte” da divisão (a mesma no formulário da aba e no popup do +).
export function splitRowHtml(i){
  return '<input class="sp-name" type="text" list="peopleList" autocomplete="off" maxlength="60" placeholder="Nome" aria-label="Nome da pessoa ' + i + '">' +
    '<span class="money-input"><span class="sp-unit">R$</span><input class="sp-val" type="text" data-money autocomplete="off" inputmode="decimal" aria-label="Parte da pessoa ' + i + '"></span>' +
    '<button type="button" class="tx-del" data-sp-del aria-label="Remover pessoa ' + i + '" title="Remover">' + icon('trash') + '</button>';
}
export function splitSummaryText(total, list, pct){
  var sh = splitShares(total, list, pct);
  return {neg: sh.mine < -0.004, text: !(total > 0) ? 'Informe o valor da compra para ver a sua parte.' :
    sh.mine < -0.004 ? 'As partes passam do total (' + fmtMoney(total) + ').' :
    'Sua parte: ' + fmtMoney(sh.mine) + ' de ' + fmtMoney(total) + (sh.people.length ? ' · ' + sh.people.map(function(p){ return (p.person || '?') + ' ' + fmtMoney(p.amount); }).join(' · ') : '')};
}
export function addSplitRow(){
  var wrap = document.getElementById('txSplitRows'), i = wrap.children.length + 1;
  var row = document.createElement('div');
  row.className = 'split-row';
  row.innerHTML = splitRowHtml(i);
  wrap.appendChild(row);
  syncSplitUnits();
  return row;
}
export function splitPercent(){ return qs('input[name=txSplitMode]:checked').value === 'pct'; }
export function syncSplitUnits(){ qsa('#txSplitRows .sp-unit').forEach(function(u){ u.textContent = splitPercent() ? '%' : 'R$'; }); }
export function splitTotal(){
  var n = document.getElementById('txPayment').value.indexOf('card:') === 0 ? clampInstall(document.getElementById('txInstall').value) : 1;
  return Tx.purchaseTotal(money(document.getElementById('txAmount').value), n, readInstallExtras(document, 'txIx', n).per);
}
export function readSplit(){
  return qsa('#txSplitRows .split-row').map(function(r){ return {person: qs('.sp-name', r).value.trim(), value: money(qs('.sp-val', r).value)}; })
    .filter(function(e){ return e.person || e.value; });
}
export function updateSplitSummary(){
  var box = document.getElementById('txSplitBox');
  if (box.hidden) return;
  var r = splitSummaryText(splitTotal(), readSplit(), splitPercent());
  var el = document.getElementById('txSplitSummary');
  el.classList.toggle('neg-text', r.neg);
  el.textContent = r.text;
}
export function resetSplit(){ document.getElementById('txSplit').checked = false; document.getElementById('txSplitRows').innerHTML = ''; qs('input[name=txSplitMode][value=valor]').checked = true; }

// "A receber" ligado a um gasto (pago pela pessoa ou a parte dela numa compra dividida).
// Compra antiga parcelada: parcelas já vencidas antes do cadastro (installment.settled). priorPaid diz se a
// pessoa já devolveu essas parcelas (contam como recebidas) ou ainda deve.
export async function addLinkedReceivable(person, total, parts, tx, description, priorPaid){
  var settled = parts.filter(Tx.isSettled), share = tx.amount > 0 ? total / tx.amount : 1;
  var prior = money(sumMoney(settled, function(t){ return t.amount; }) * share);
  var r = {person: person, kind: tx.paymentMethod === 'cartao' ? 'cartao' : 'combinado', description: description, totalAmount: money(total),
    receivedAmount: settled.length && priorPaid ? prior : 0, dueDate: null, linked: true, category: tx.category, createdAt: Date.now()};
  if (settled.length) r.priorSettled = {count: settled.length, amount: prior, paid: !!priorPaid};
  var usedCard = tx.paymentMethod === 'cartao' ? findById(State.cards, tx.cardId) : null;
  if (usedCard){ r.cardId = usedCard.id; r.dueDate = invoiceDates(invoiceKeyFor(parts[0].date, usedCard), usedCard).due; }
  if (parts.length > 1){ r.installments = parts.length; r.installmentAmount = money(total / parts.length); }
  var saved = await Store.add(k(), 'receivables', r);
  State.receivables.push(saved);
  return saved;
}

// Liga as parcelas de um gasto a quem vai devolver (paguei por outra pessoa) ou divide a compra: cria os “A receber”
// e marca cada parcela. o = {tx, parts, desc, forOther, splitList, pct, priorPaid}. Retorna {shares} ou {error}.
export async function attachOthers(o){
  var tx = o.tx, parts = o.parts, charged = sumMoney(parts, function(t){ return t.amount; }), label = o.desc || catLabel(tx.category, tx.type), shares = null;
  if (o.splitList){
    shares = splitShares(tx.amount, o.splitList, o.pct);
    if (shares.mine < -0.004) return {error: 'As partes das outras pessoas passam do total da compra (' + fmtMoney(tx.amount) + ').'};
    // Cada pessoa vira um "A receber" com a parte dela do que vai ser cobrado; só a sua parte é gasto seu.
    var split = {total: tx.amount, mine: shares.mine, people: []};
    for (var si = 0; si < shares.people.length; si++){
      var sp = shares.people[si];
      var sr = await addLinkedReceivable(sp.person, charged * sp.amount / tx.amount, parts, tx, label + ' (parte de ' + sp.person.split(' ')[0] + ')', o.priorPaid);
      split.people.push({person: sp.person, receivableId: sr.id, amount: sp.amount});
    }
    parts.forEach(function(t){ t.split = split; });
  }
  if (o.forOther){
    // O gasto fica ligado ao "A receber": não conta como gasto seu, e o que voltar é devolução, não ganho.
    var recv = await addLinkedReceivable(o.forOther, charged, parts, tx, label, o.priorPaid);
    parts.forEach(function(t){ t.forOther = {person: o.forOther, receivableId: recv.id}; });
  }
  return {shares: shares};
}
export function othersToast(type, tx, n, start, shares, forOther){
  return (type === 'expense' ? 'Gasto' : 'Ganho') + ' de ' + fmtMoney(tx.amount) + (n > 1 ? ' em ' + n + 'x' + (start > 1 ? ' (a partir da ' + start + 'ª)' : '') : '') + ' registrado.' +
    (shares ? ' Sua parte: ' + fmtMoney(shares.mine) + '; ' + shares.people.length + ' pessoa(s) em “A receber”.' : '') + (forOther ? ' ' + forOther + ' foi para “A receber”.' : '');
}

// Filtros de categoria e de conta/cartão específicos (as opções mudam com o cadastro).
export function populateTxFilters(){
  var cat = document.getElementById('txFilterCat'), pay = document.getElementById('txFilterPay');
  var pc = cat.value || 'all', pp = pay.value || 'all';
  // Só as categorias que têm lançamentos (e a escolhida agora), para a lista não ficar enorme.
  var usedExp = {}, usedInc = {};
  State.transactions.forEach(function(t){ (t.type === 'income' ? usedInc : usedExp)[t.category] = true; });
  usedExp[pc] = usedInc[pc] = true;
  cat.innerHTML = optionsHtml([{id: 'all', label: 'Todas as categorias'}].concat(
    expenseCats().filter(function(c){ return usedExp[c.id]; }).map(function(c){ return {id: c.id, label: (c.emoji ? c.emoji + ' ' : '') + c.label}; }),
    incomeCats().filter(function(c){ return usedInc[c.id]; }).map(function(c){ return {id: c.id, label: (c.emoji ? c.emoji + ' ' : '') + c.label + ' (ganho)'}; })), pc);
  if (cat.value !== pc) cat.value = 'all';
  pay.innerHTML = optionsHtml([{id: 'all', label: 'Qualquer pagamento'}, {id: 'conta', label: 'Dinheiro, Pix ou débito'}, {id: 'cartao', label: 'Cartão de crédito'}, {id: 'vale', label: 'Vale'}].concat(
    State.accounts.map(function(a){ return {id: 'acc:' + a.id, label: 'Conta ' + a.name}; }),
    State.cards.map(function(c){ return {id: 'card:' + c.id, label: 'Cartão ' + c.name}; })), pp);
  if (pay.value !== pp) pay.value = 'all';
}
// Previsto no mês (para o calendário): entradas previstas, contas fixas, faturas e valores a receber.
export function monthEvents(key){
  var out = [];
  forecastOccurrences(key).forEach(function(o){ if (o.received === undefined) out.push({date: o.date, kind: 'previsto', label: o.f.description, amount: Number(o.f.amount)}); });
  billMonth(key).forEach(function(o){ if (!o.paid) out.push({date: o.date, kind: 'fixa', label: o.b.name, amount: o.amount}); });
  State.cards.forEach(function(c){
    [shiftMonthKey(key, -1), key].forEach(function(ik){
      var dts = invoiceDates(ik, c), total = Cards.invoiceTotal(State.transactions, c, ik);
      if (dts.due.slice(0, 7) === key && total > 0 && invoiceStatus(c, ik) !== 'paga') out.push({date: dts.due, kind: 'fatura', label: 'Fatura ' + c.name, amount: total});
    });
  });
  State.vouchers.forEach(function(v){
    var d = creditDate(v, key);
    if (d) out.push({date: d, kind: 'vale', label: v.name, amount: Number(v.amount) || 0});
  });
  State.receivables.forEach(function(r){
    var left = recvRemaining(r), due = recvNextDue(r);
    if (left > 0 && due && due.slice(0, 7) === key) out.push({date: due, kind: 'receber', label: r.person + (r.description ? ' · ' + r.description : ''), amount: recvNextAmount(r)});
  });
  var type = document.getElementById('txFilterType').value;
  var other = !!document.getElementById('txSearch').value.trim() || document.getElementById('txFilterCat').value !== 'all' || document.getElementById('txFilterPay').value !== 'all';
  return out.filter(function(e){
    if (other || type === 'others') return false;
    if (type === 'income') return e.kind === 'previsto' || e.kind === 'receber' || e.kind === 'vale';
    if (type === 'expense') return e.kind === 'fixa' || e.kind === 'fatura';
    return true;
  });
}
export function setTxView(v){
  State.txView = v;
  setPref('txView', v);
  qsa('[data-txview]').forEach(function(b){ var on = b.getAttribute('data-txview') === v; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  renderTransactionsTab();
}
export function renderTransactionsTab(){
  populateTxFilters();
  // A ordem das categorias acompanha os lançamentos; com o formulário vazio, volta para a mais usada.
  var pristine = !document.getElementById('txAmount').value && !document.getElementById('txDesc').value.trim() && !document.getElementById('txCategory').dataset.chosen;
  populateCategorySelect(pristine ? undefined : document.getElementById('txCategory').value);
  var view = State.txView || 'list';
  var mb = monthBounds(State.txMonthOffset);
  document.getElementById('txMonthLabel').textContent = view === 'year' ? mb.key.slice(0, 4) : mb.label;
  document.getElementById('nextMonth').disabled = State.txMonthOffset >= maxTxMonthOffset() && view !== 'year';
  document.getElementById('txSort').hidden = view !== 'list';
  var calEl = document.getElementById('txCal');
  calEl.hidden = view === 'list';
  if (view === 'year'){ renderTxYear(mb); return; }
  var tx = filterTransactions(txForMonth(mb.key));
  var filtering = tx.length !== txForMonth(mb.key).length || isFiltering();
  syncFilterButton();
  var income = sum(tx.filter(function(t){ return t.type==='income' && isPersonal(t); }), function(t){ return t.amount; });
  var expenseTx = tx.filter(function(t){ return t.type==='expense' && isPersonal(t); });
  var others = sum(tx, othersShare);
  var expense = sum(expenseTx, myShare);
  var onCard = sum(expenseTx.filter(function(t){ return t.paymentMethod==='cartao'; }), myShare);
  var onVale = sum(expenseTx.filter(function(t){ return t.paymentMethod==='vale'; }), myShare);
  // Os gastos aparecem como total (tudo o que saiu) e, se houver, a divisão entre o que é meu e de outras pessoas.
  var bits = [(filtering ? 'Filtrando: ' : '') + tx.length + ' lançamento(s)', 'ganhos ' + fmtMoney(income),
    'gastos ' + fmtMoney(expense + others) + (others > 0.004 ? ' (seus ' + fmtMoney(expense) + ' · de outras pessoas ' + fmtMoney(others) + ')' : '') + (onCard ? ' · no cartão ' + fmtMoney(onCard) : '') + (onVale ? ' · no vale ' + fmtMoney(onVale) : '')];
  document.getElementById('txSummary').innerHTML = bits.map(function(x){ return '<span>' + escapeHtml(x) + '</span>'; }).join(' ');
  var list = document.getElementById('txList');
  if (view === 'cal'){ renderTxCalendar(mb, tx, list); return; }
  if (!tx.length){ list.innerHTML = purchaseNotices(mb.key) + '<p class="empty-state">' + (filtering ? 'Nenhum lançamento encontrado com esses filtros.' : 'Nenhum lançamento neste mês.') + '</p>'; return; }
  list.innerHTML = purchaseNotices(mb.key) + listWithRefundGroups(sortTxView(tx));
}
// Devoluções de uma mesma pessoa (3 ou mais) ficam numa caixa que abre e fecha, para a lista não virar uma parede de
// linhas iguais (ex.: 24 parcelas devolvidas). A escolha de abrir fica lembrada até recarregar.
function refundPerson(t){
  var r = t.receivableId && findById(State.receivables, t.receivableId);
  if (r && r.person) return String(r.person).trim();
  var m = /^(?:Devolução de|Recebido de)\s+(.+)$/.exec(t.description || '');
  return m ? m[1].trim() : '';
}
function listWithRefundGroups(sorted){
  State.txGroupOpen = State.txGroupOpen || {};
  var groups = {};
  sorted.forEach(function(t){
    if (t.type !== 'income' || !t.refund) return;
    var p = refundPerson(t);
    if (p) (groups[fold(p)] = groups[fold(p)] || {name: p, list: []}).list.push(t);
  });
  var placed = {}, out = [];
  sorted.forEach(function(t){
    var key = t.type === 'income' && t.refund && refundPerson(t) ? fold(refundPerson(t)) : null, g = key && groups[key];
    if (!(g && g.list.length >= 3)){ out.push(txRowHtml(t)); return; }
    if (placed[key]) return;
    placed[key] = true;
    var total = sum(g.list, function(x){ return Number(x.amount) || 0; }), gk = 'refund:' + key;
    out.push('<details class="tx-group" data-group-key="' + escapeHtml(gk) + '"' + (State.txGroupOpen[gk] ? ' open' : '') + '><summary><span class="tg-ico" aria-hidden="true">🤝</span>' +
      '<span class="tg-main"><strong>Devoluções de ' + escapeHtml(g.name) + '</strong><small>' + g.list.length + ' recebimentos · último em ' + formatDateBr(g.list[0].date) + '</small></span>' +
      '<span class="tabular tg-total">+ ' + fmtMoney(total) + '</span></summary>' + g.list.map(txRowHtml).join('') + '</details>');
  });
  return out.join('');
}
// No calendário, a parcela do cartão que conta neste mês (pela fatura) fica no dia do vencimento da fatura.
function calendarDate(t, key){
  if (t.date.slice(0, 7) === key) return t.date;
  var c = t.paymentMethod === 'cartao' && findById(State.cards, t.cardId);
  return c ? Cards.invoiceDates(Cards.txInvoiceKey(t, c), c).due : t.date;
}
// Compras feitas neste mês no cartão que só entram em faturas seguintes: aparecem como aviso, sem somar.
function purchaseNotices(key){
  var list = filterTransactions(State.transactions.filter(function(t){
    return t.type === 'expense' && t.paymentMethod === 'cartao' && (t.purchaseDate || t.date).slice(0, 7) === key &&
      Tx.monthOf(t) !== key && (!t.installment || t.installment.n === 1);
  }));
  if (!list.length) return '';
  var noteTotal = sum(list, function(t){ return t.installment ? Number(t.installment.totalAmount) : Number(t.amount); });
  return '<details class="purchase-notes" data-notes-toggle' + (getPrefs().txNotesOpen === false ? '' : ' open') + '><summary class="tiles-group">Compras deste mês que entram em faturas seguintes <span>não somam aqui · ' +
    list.length + (list.length === 1 ? ' compra' : ' compras') + ' · ' + fmtMoney(noteTotal) + '</span></summary>' +
    list.map(function(t){
      var c = findById(State.cards, t.cardId), inv = Cards.invoiceFor(t.date, c), n = t.installment ? t.installment.total : 1;
      var name = t.installment ? t.installment.baseDescription : (t.description || catLabel(t.category, 'expense'));
      var total = t.installment ? Number(t.installment.totalAmount) : t.amount;
      return '<div class="purchase-note">' + icon('card') + '<div class="tx-main"><div class="tx-desc">' + escapeHtml(name) + '</div>' +
        '<div class="tx-meta">' + formatDateBr(t.purchaseDate || t.date) + ' · ' + escapeHtml(c ? 'Cartão ' + c.name : 'Cartão') + ' · ' +
        (n > 1 ? n + 'x de ' + fmtMoney(t.amount) + ' (' + fmtMoney(total) + ') · 1ª parcela' : 'entra') + ' na fatura de ' + inv.label + ' (vence ' + formatDateBr(inv.due) + ')</div></div>' +
        '<button class="tx-del tx-edit" type="button" data-edit-tx="' + escapeHtml(t.id) + '" aria-label="Editar compra" title="Editar">' + icon('edit') + '</button></div>';
    }).join('') + '</details>';
}
export function renderTxCalendar(mb, tx, list){
  var days = {}, events = monthEvents(mb.key);
  function day(d){ return days[d] || (days[d] = {income: 0, expense: 0, count: 0, events: [], tx: []}); }
  tx.forEach(function(t){
    var x = day(calendarDate(t, mb.key));
    x.count++; x.tx.push(t);
    if (t.type === 'income' && isPersonal(t)) x.income = money(x.income + Number(t.amount));
    if (t.type === 'expense') x.expense = money(x.expense + myShare(t));
  });
  events.forEach(function(e){ day(e.date).events.push(e); });
  var today = todayKey();
  var sel = State.calDay && State.calDay.slice(0, 7) === mb.key ? State.calDay : (today.slice(0, 7) === mb.key ? today : null);
  document.getElementById('txCal').innerHTML = monthGridHtml(mb.key, days, sel);
  if (!sel){ list.innerHTML = '<p class="empty-state">Toque num dia para ver os lançamentos e o que está previsto.</p>'; return; }
  var d = days[sel] || {tx: [], events: []};
  list.innerHTML = '<p class="tiles-group">' + formatDateFull(sel) + '</p>' +
    (d.tx.length ? sortTxView(d.tx).map(txRowHtml).join('') : '<p class="tx-meta">Nenhum lançamento neste dia.</p>') + dayEventsHtml(d.events);
}
export function renderTxYear(mb){
  var year = mb.key.slice(0, 4), months = [], totInc = 0, totExp = 0, totOth = 0;
  for (var m = 1; m <= 12; m++){
    var key = year + '-' + (m < 10 ? '0' : '') + m, tx = filterTransactions(txForMonth(key));
    var inc = sum(tx.filter(function(t){ return t.type === 'income' && isPersonal(t); }), function(t){ return t.amount; });
    var exp = sum(tx.filter(function(t){ return t.type === 'expense'; }), myShare);
    totInc += inc; totExp += exp; totOth += sum(tx, othersShare);
    months.push({key: key, income: money(inc), expense: money(exp)});
  }
  var yb = [(isFiltering() ? 'Filtrando: ' : '') + 'Ano de ' + year, 'ganhos ' + fmtMoney(totInc),
    'gastos ' + fmtMoney(totExp + totOth) + (totOth > 0.004 ? ' (seus ' + fmtMoney(totExp) + ' · de outras pessoas ' + fmtMoney(totOth) + ')' : ''),
    'saldo ' + fmtMoney(totInc - totExp) + (totOth > 0.004 ? ' (só com os seus gastos)' : '')];
  document.getElementById('txSummary').innerHTML = yb.map(function(x){ return '<span>' + escapeHtml(x) + '</span>'; }).join(' ');
  document.getElementById('txCal').innerHTML = yearHtml(year, months, monthBounds(0).key);
  document.getElementById('txList').innerHTML = '<p class="tx-meta">Toque num mês para ver o calendário dele.</p>';
}

// Busca sem diferenciar acentos e maiúsculas ("almoco" encontra "Almoço").
export function fold(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
// “Filtrar”: os filtros ficam recolhidos; o botão mostra quantos estão ligados.
export function syncFilterButton(){
  var n = ['txFilterType', 'txFilterCat', 'txFilterPay'].filter(function(id){ return document.getElementById(id).value !== 'all'; }).length;
  var c = document.getElementById('txFilterCount');
  c.hidden = !n; c.textContent = n;
  document.getElementById('txFilterBtn').setAttribute('aria-label', 'Filtrar' + (n ? ' (' + n + (n === 1 ? ' filtro ligado)' : ' filtros ligados)') : ''));
}
export function isFiltering(){
  return !!document.getElementById('txSearch').value.trim() || document.getElementById('txFilterType').value !== 'all' || document.getElementById('txFilterPay').value !== 'all' ||
    document.getElementById('txFilterCat').value !== 'all';
}
// Ordem da lista de "Ganhos e gastos" (lembrada por pessoa): data, ordem de cadastro ou valor.
export var TX_SORTS = {
  recent: function(a, b){ return (b.date||'').localeCompare(a.date||'') || (b.createdAt||0) - (a.createdAt||0); },
  added: function(a, b){ return (a.createdAt||0) - (b.createdAt||0) || (a.date||'').localeCompare(b.date||''); },
  amount: function(a, b){ return Number(b.amount) - Number(a.amount) || (b.date||'').localeCompare(a.date||''); }
};
export function sortTxView(list){ return list.slice().sort(TX_SORTS[document.getElementById('txSort').value] || TX_SORTS.recent); }
export function filterTransactions(list){
  var q = fold(document.getElementById('txSearch').value.trim());
  var type = document.getElementById('txFilterType').value;
  var pay = document.getElementById('txFilterPay').value;
  var cat = document.getElementById('txFilterCat').value;
  return list.filter(function(t){
    if (type === 'others'){ if (!isForOther(t) && !isRefund(t)) return false; }
    else if (type !== 'all' && t.type !== type) return false;
    if (cat !== 'all' && t.category !== cat) return false;
    if (pay.indexOf('acc:') === 0){ if (t.accountId !== pay.slice(4)) return false; }
    else if (pay.indexOf('card:') === 0){ if (t.paymentMethod !== 'cartao' || t.cardId !== pay.slice(5)) return false; }
    else if (pay !== 'all' && (t.type !== 'expense' || (t.paymentMethod || 'conta') !== pay)) return false;
    if (q && fold((t.description || '') + ' ' + catLabel(t.category, t.type, t.categoryLabel) + ' ' + paymentLabel(t)).indexOf(q) < 0) return false;
    return true;
  });
}

// A mesma lista de categorias serve para “Ganhos e gastos” e “Planejar gastos”.
export async function addCategory(name, type, look){
  name = String(name || '').trim();
  var problem = categoryNameProblem(name, type);
  if (problem) return {error: problem};
  look = look || {};
  var color = look.color || CUSTOM_COLORS[State.categories.length % CUSTOM_COLORS.length];
  var saved = await Store.add(k(), 'categories', {label:name, type:type, color:color, emoji: look.emoji || Cats.DEFAULT_EMOJI, createdAt:Date.now()});
  State.categories.push(saved);
  return saved;
}
export async function createCategory(type){
  var r = await openModal({
    title: 'Nova categoria de ' + (type === 'income' ? 'ganho' : 'gasto'),
    body: '<div class="field"><label for="newCatName">Nome</label><input id="newCatName" name="name" type="text" maxlength="30" placeholder="Ex: Pets, Academia"></div>' +
      '<p class="field-hint">A categoria aparece em “Ganhos e gastos”' + (type === 'income' ? '.' : ' e em “Planejar gastos”.') + '</p>',
    submitLabel: 'Criar categoria',
    onSubmit: function(form){ return addCategory(form.name.value, type); }
  });
  if (r && r.id){ toast('Categoria “' + r.label + '” criada.'); return r.id; }
  return null;
}

// Eventos de Ganhos e gastos: formulário, filtros, parcelas, divisão, calendário e CSV.
export function wireTransactions(){
  // Os botões − e + funcionam em qualquer seletor de parcelas, inclusive dentro dos popups.
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-step]');
    if (!b) return;
    var inp = document.getElementById(b.getAttribute('data-for'));
    if (!inp || inp.disabled) return;
    inp.value = clampInstall(clampInstall(inp.value) + Number(b.getAttribute('data-step')));
    inp.dispatchEvent(new Event('input', {bubbles:true}));
  });
  document.addEventListener('change', function(e){
    if (e.target.matches && e.target.matches('.stepper input')){ e.target.value = clampInstall(e.target.value); e.target.dispatchEvent(new Event('input', {bubbles:true})); }
  });
  document.getElementById('txSplitAdd').addEventListener('click', function(){ autoFocus(qs('.sp-name', addSplitRow())); updateSplitSummary(); });
  document.getElementById('txSplitEqual').addEventListener('click', function(){
    var rows = qsa('#txSplitRows .split-row'), total = splitTotal();
    if (!rows.length) return;
    var each = splitPercent() ? Math.floor(10000 / (rows.length + 1)) / 100 : Math.floor(total * 100 / (rows.length + 1)) / 100;
    rows.forEach(function(r){ qs('.sp-val', r).value = each; });
    updateSplitSummary();
  });
  document.getElementById('txSplitRows').addEventListener('click', function(e){
    var b = e.target.closest('[data-sp-del]');
    if (!b) return;
    b.closest('.split-row').remove();
    if (!qs('#txSplitRows .split-row')){ document.getElementById('txSplit').checked = false; syncTxFormVisibility(); }
    updateSplitSummary();
  });
  document.getElementById('txSplitBox').addEventListener('input', updateSplitSummary);
  document.getElementById('txSplitBox').addEventListener('change', function(){ syncSplitUnits(); updateSplitSummary(); });
  ['txAmount', 'txInstall'].forEach(function(id){ document.getElementById(id).addEventListener('input', updateSplitSummary); });

  document.getElementById('typeToggle').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-type]');
    if (!btn) return;
    qsa('button', document.getElementById('typeToggle')).forEach(function(b){ b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    populateCategorySelect();
    syncTxFormVisibility();
  });
  resetTxCatSuggestion = wireCategorySuggestion(document.getElementById('txDesc'), document.getElementById('txCategory'), document.getElementById('txCatHint'), currentTxType);
  document.getElementById('txCategory').addEventListener('change', async function(e){
    if (e.target.value !== '__new') return;
    var id = await createCategory(currentTxType());
    populateCategorySelect(id || undefined);
    if (id){ renderBudgets(); }
  });
  document.getElementById('txForOther').addEventListener('change', function(e){ if (e.target.checked) resetSplit(); syncTxFormVisibility(); });
  document.getElementById('txSplit').addEventListener('change', function(e){ if (e.target.checked) document.getElementById('txForOther').checked = false; syncTxFormVisibility(); });
  // Pagou com vale: já sugere a categoria Alimentação.
  document.getElementById('txPayment').addEventListener('change', function(e){
    if (e.target.value.indexOf('vale') === 0 && currentTxType() === 'expense') document.getElementById('txCategory').value = 'alimentacao';
    syncTxFormVisibility();
  });
  document.getElementById('txAmount').addEventListener('input', populateInstallSelect);
  document.getElementById('txInstall').addEventListener('input', populateInstallSelect);
  document.getElementById('txIxWrap').innerHTML = installExtrasHtml('txIx');
  ['input', 'change'].forEach(function(ev){ document.getElementById('txDate').addEventListener(ev, populateInstallSelect); });
  document.getElementById('txIxWrap').addEventListener('input', populateInstallSelect);
  document.getElementById('txIxWrap').addEventListener('change', populateInstallSelect);
  document.getElementById('txList').addEventListener('toggle', function(e){ if (e.target.matches && e.target.matches('[data-notes-toggle]')) setPref('txNotesOpen', e.target.open); }, true);
  document.getElementById('txList').addEventListener('toggle', function(e){ var d = e.target; if (d.matches && d.matches('[data-group-key]')){ State.txGroupOpen = State.txGroupOpen || {}; State.txGroupOpen[d.getAttribute('data-group-key')] = d.open; } }, true);
  document.getElementById('txSort').addEventListener('change', function(e){ setPref('txSort', e.target.value); });
  ['txSearch','txFilterType','txFilterPay','txSort','txFilterCat'].forEach(function(id){
    document.getElementById(id).addEventListener(id === 'txSearch' ? 'input' : 'change', renderTransactionsTab);
  });
  document.getElementById('manageCatsBtn').addEventListener('click', manageCategories);

  document.getElementById('fabAdd').addEventListener('click', function(){ openTxModal(); });

  document.getElementById('prevMonth').addEventListener('click', function(){ State.txMonthOffset -= State.txView === 'year' ? 12 : 1; renderTransactionsTab(); });
  qsa('[data-txview]').forEach(function(b){ b.addEventListener('click', function(){ setTxView(b.getAttribute('data-txview')); }); });
  document.getElementById('txCal').addEventListener('click', function(e){
    var d = e.target.closest('[data-cal-day]'), mth = e.target.closest('[data-cal-month]');
    if (d){ State.calDay = d.getAttribute('data-cal-day'); renderTransactionsTab(); var b = qs('[data-cal-day="' + State.calDay + '"]'); if (b) b.focus(); }
    if (mth){ State.txMonthOffset = monthsBetween(monthBounds(0).key, mth.getAttribute('data-cal-month')); State.calDay = null; setTxView('cal'); }
  });
  document.getElementById('nextMonth').addEventListener('click', function(){
    if (State.txView === 'year'){ State.txMonthOffset += 12; renderTransactionsTab(); return; }
    if (State.txMonthOffset < maxTxMonthOffset()){ State.txMonthOffset++; renderTransactionsTab(); }
  });

  document.getElementById('txForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var type = currentTxType();
    var amount = money(document.getElementById('txAmount').value);
    var category = document.getElementById('txCategory').value;
    var date = document.getElementById('txDate').value || todayKey();
    var desc = document.getElementById('txDesc').value.trim();
    if (!(amount > 0)){ toast('Informe um valor válido.'); return; }
    if (!validDateStr(date)){ toast('Use uma data entre 1900 e 3000.'); return; }
    if (category === '__new'){ toast('Escolha uma categoria.'); return; }
    var tx = {type:type, amount:amount, category:category, categoryLabel: catLabel(category, type), date:date, description:desc, paymentMethod:null, accountId:null, createdAt: Date.now()};
    if (type === 'income') tx.accountId = document.getElementById('txAccount').value || null;
    var forOther = null;
    if (type === 'expense'){
      var pay = document.getElementById('txPayment').value;
      if (pay === 'card:none'){ toast('Cadastre um cartão em “Contas e cartões” primeiro.'); showTab('cartoes'); return; }
      applyPayment(tx, pay);
      if (document.getElementById('txForOther').checked){
        forOther = document.getElementById('txOtherName').value.trim();
        if (!forOther){ toast('Informe quem vai te devolver o valor.'); return; }
      }
    }
    var splitList = type === 'expense' && !forOther && document.getElementById('txSplit').checked ? readSplit() : null;
    if (splitList){
      if (!splitList.length){ toast('Adicione quem vai dividir a compra com você.'); return; }
      if (splitList.some(function(e){ return !e.person || !(e.value > 0); })){ toast('Informe o nome e a parte de cada pessoa.'); return; }
    }
    var n = tx.paymentMethod === 'cartao' ? clampInstall(document.getElementById('txInstall').value) : 1;
    var ex = readInstallExtras(document, 'txIx', n, date, tx.cardId);
    if (n > 1 && ex.start > n){ toast('Todas as parcelas dessa compra já venceram. Confira a data da compra.'); return; }
    tx.amount = Tx.purchaseTotal(amount, n, ex.per);
    var parts = expandInstallments(tx, n, ex.start);
    var priorPaid = qs('input[name=txPrior]:checked') ? qs('input[name=txPrior]:checked').value === 'paid' : true;
    var shares = null;
    if (splitList || forOther){
      var linked = await attachOthers({tx: tx, parts: parts, desc: desc, forOther: forOther, splitList: splitList, pct: splitPercent(), priorPaid: priorPaid});
      if (linked.error){ toast(linked.error); return; }
      shares = linked.shares;
      if (splitList){ resetSplit(); syncTxFormVisibility(); }
      if (forOther){
        document.getElementById('txForOther').checked = false;
        document.getElementById('txOtherName').value = '';
        syncTxFormVisibility();
      }
    }
    var savedParts = await saveTransactions(parts);
  document.getElementById('txForOtherField').open = false;
  qs('input[name=txPrior][value=paid]').checked = true;
    resetInstallExtras(document, 'txIx');
    document.getElementById('txAmount').value = '';
    document.getElementById('txDesc').value = '';
    document.getElementById('txInstall').value = '1';
    populateInstallSelect();
    renderAll();
    if (!shares && !forOther) savedToast(type, tx, n, ex.start, savedParts);
    else toast(othersToast(type, tx, n, ex.start, shares, forOther));
  });

  document.getElementById('exportCsvBtn').addEventListener('click', async function(){
    var mb = monthBounds(State.txMonthOffset);
    var tx = txForMonth(mb.key);
    if (!tx.length){ toast('Não há lançamentos neste mês para exportar.'); return; }
    var rows = [['Data','Tipo','Categoria','Descrição','Forma de pagamento','Valor (R$)']];
    tx.forEach(function(t){
      rows.push([t.date, t.type==='income'?'Ganho':'Gasto', catLabel(t.category,t.type,t.categoryLabel), t.description||'', paymentLabel(t) || (t.type==='expense' ? PAYMENT_LABELS.conta : ''), String(t.amount).replace('.',',')]);
    });
    var csv = rows.map(function(r){ return r.map(csvCell).join(';'); }).join('\r\n');
    try{
      await saveFile('grana-leve-' + mb.key + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
      toast('Lançamentos baixados.');
    } catch(err){ toast('Não foi possível baixar o arquivo agora.'); }
  });
}
