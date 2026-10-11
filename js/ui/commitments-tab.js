/*
 * Compromissos: dívidas (Eu devo) e valores a receber (Me devem).
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import * as Cards from '../domain/cards.js';
import {todayKey, monthKeyOf, formatDateBr, formatDateFull, validDateStr, monthLabelOf, shiftMonthKey} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, uid} from '../domain/util.js';
import {clampInstall} from '../domain/transactions.js';

import {invoiceKeyFor, invoiceDates} from '../domain/cards.js';
import {recvInstallInfo, recvNextDue, recvRemaining, recvDefaultRefund} from '../domain/receivables.js';

import {DEFAULT_URGENCY, urgencyOf, byUrgency} from '../domain/urgency.js';
import * as Research from '../domain/research.js';
import {Store} from '../data/store.js';

import {getPrefs, setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, optionsHtml, labelOf, icon, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {DEBT_KINDS, RECV_KINDS} from './constants.js';
import {paymentLabel, renderDashboard} from './home-tab.js';
import {ufOptions} from './my-data.js';
import {renderAll} from './shell.js';
import {State, URGENCY_RANK, accountName, catLabel, expandInstallments, installHint, installmentGroups, k, setUrgency, sortTransactions, urgencyOptions, urgencySelectHtml} from './state.js';
import {saveTransactions} from './tx-edit.js';
import {accountSelectHtml, fold, installStepperHtml} from './tx-list.js';

/* ---------- Dívidas ---------- */
export function renderDebts(){
  var gs = installmentGroups().filter(function(g){ return g.future.length; });
  // As compras parceladas no cartão ficam só em "Contas e cartões" (não aparecem duas vezes).
  document.getElementById('installDebtWrap').innerHTML = gs.length ?
    '<div class="tip-box install-note">' + icon('card') + '<span><strong>' + gs.length + ' compra(s) parcelada(s) no cartão</strong> (faltam ' + fmtMoney(sumMoney(gs, function(g){ return g.remaining; })) + ') ficam em “Contas e cartões”, dentro de cada cartão. Elas entram sozinhas na fatura e não precisam ser cadastradas aqui. Se a compra foi no cartão de outra pessoa, cadastre aqui como dívida.</span>' +
    '<button class="btn btn-ghost btn-sm" type="button" data-goto="cartoes">Ver nos cartões</button></div>' : '';
  var grid = document.getElementById('debtGrid');
  if (!State.debts.length){ grid.innerHTML = gs.length ? '' : '<p class="empty-state">Nenhuma dívida cadastrada. Se você não tem dívidas, ótimo: pode pular esta seção.</p>'; return; }
  var debtLeft = function(d){ return Math.max(0, Number(d.totalAmount||0) - Number(d.paidAmount||0)); };
  // Quitadas por último; entre as abertas, a mais urgente e depois a maior.
  var debts = byUrgency(State.debts, function(a, b){ return debtLeft(b) - debtLeft(a); });
  debts.sort(function(a, b){ return (debtLeft(a) <= 0) - (debtLeft(b) <= 0); });
  grid.innerHTML = debts.map(function(d){
    var remaining = Math.max(0, Number(d.totalAmount||0) - Number(d.paidAmount||0));
    var pct = d.totalAmount > 0 ? Math.min(1, Number(d.paidAmount||0)/Number(d.totalAmount)) : 0;
    var done = remaining <= 0;
    return '<div class="debt-card">' +
      '<div class="budget-top"><h4>'+escapeHtml(d.name)+'</h4><span class="card-tags"><span class="pill">' + escapeHtml(labelOf(DEBT_KINDS, d.kind) || 'Dívida') + '</span>' +
        (done ? '' : urgencySelectHtml('debts', d, d.name)) + '</span></div>' +
      (d.creditor ? '<span class="tx-meta">Com: ' + escapeHtml(d.creditor) + '</span>' : '') +
      '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
      '<div class="debt-figs"><span class="tabular">Pago: '+fmtMoney(d.paidAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
      (d.monthlyPayment ? '<span class="tx-meta">Parcela mensal: '+fmtMoney(d.monthlyPayment)+(remaining > 0 ? ' · cerca de ' + Math.ceil(remaining / d.monthlyPayment) + ' parcela(s) restante(s)' : '')+'</span>' : '') +
      '<div class="card-actions">' +
        (done ? '<span class="status-pill good">Quitada</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-debt-pay="'+d.id+'">Registrar pagamento</button>') +
        '<button class="btn btn-danger btn-sm" type="button" data-debt-del="'+d.id+'">Excluir</button>' +
      '</div>' + paymentLogHtml(d.payments, 'debt', d.id) + '</div>';
  }).join('');
}

// Registrar pagamento de dívida: quantas parcelas, de qual conta saiu e se conta como gasto do mês.
// Cada pagamento fica no histórico da dívida e pode ser desfeito (o registro continua, marcado).
export async function payDebt(id){
  var d = findById(State.debts, id);
  var remaining = Math.max(0, Number(d.totalAmount) - Number(d.paidAmount||0));
  var per = Number(d.monthlyPayment) > 0 ? Number(d.monthlyPayment) : 0;
  var maxN = per ? Math.max(1, Math.ceil(remaining / per - 0.0001)) : 1;
  var a = await openModal({
    title: 'Registrar pagamento',
    body: '<p>“' + escapeHtml(d.name) + '”: faltam ' + fmtMoney(remaining) + (per ? ' (cerca de ' + maxN + ' parcela(s) de ' + fmtMoney(per) + ')' : '') + '.</p>' +
      (per ? '<div class="field"><label for="dpN">Quantas parcelas você pagou?</label>' + installStepperHtml('dpN', 'n') + '</div>' : '') +
      '<div class="field"><label for="dpAmount">Valor pago</label><span class="money-input"><span>R$</span><input id="dpAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + money(per ? Math.min(per, remaining) : remaining) + '"></span>' +
        (per ? '<span class="field-hint">Muda sozinho com o número de parcelas; ajuste se pagou com juros ou desconto.</span>' : '') + '</div>' +
      accountSelectHtml('dpAcc', 'acc', 'De onde saiu o dinheiro?') +
      '<label class="check"><input type="checkbox" name="expense" checked> Contar como gasto do mês (categoria Dívidas)</label>' +
      '<p class="tip-box" id="dpEffect" aria-live="polite"></p>',
    submitLabel: 'Registrar',
    onOpen: function(modal){
      var amount = qs('#dpAmount', modal), nIn = qs('#dpN', modal);
      if (nIn){ nIn.max = maxN; nIn.addEventListener('input', function(){ if (Number(nIn.value) > maxN) nIn.value = maxN; amount.value = money(Math.min(remaining, per * Number(nIn.value))); effect(); }); }
      function effect(){
        var v = money(amount.value), acc = qs('#dpAcc', modal), accName = acc && acc.value ? acc.options[acc.selectedIndex].text : '';
        qs('#dpEffect', modal).innerHTML = '<strong>O que vai acontecer:</strong> ' + (v > 0 ? fmtMoney(v) : 'o valor') + ' abate da dívida' + (nIn && Number(nIn.value) > 1 ? ' (' + nIn.value + ' parcelas)' : '') +
          (accName ? '; sai do saldo de ' + escapeHtml(accName) : '; não mexe no saldo de nenhuma conta') +
          (qs('input[name=expense]', modal).checked ? '; conta como gasto do mês.' : '; não conta como gasto do mês.');
      }
      modal.addEventListener('input', effect); modal.addEventListener('change', effect); effect();
    },
    onSubmit: function(form){
      var v = money(form.amount.value);
      if (!(v > 0)) return {error:'Informe um valor maior que zero.'};
      if (v > remaining + 0.001) return {error:'O valor não pode passar de ' + fmtMoney(remaining) + '.'};
      return {amount: v, n: form.n ? clampInstall(form.n.value) : 1, asExpense: form.expense.checked, accountId: form.acc ? (form.acc.value || null) : null};
    }
  });
  if (!a || !a.amount) return;
  var txId = null;
  if (a.asExpense || a.accountId){
    var tx = {type:'expense', amount:a.amount, category:'dividas', categoryLabel: catLabel('dividas', 'expense'), date: todayKey(), description:'Pagamento: ' + d.name + (a.n > 1 ? ' (' + a.n + ' parcelas)' : ''),
      paymentMethod: a.accountId ? 'conta' : null, accountId: a.accountId, cardId: null, voucherId: null, debtId: d.id, createdAt: Date.now()};
    if (!a.asExpense) tx.outsideTotals = true;
    var saved = await Store.add(k(), 'transactions', tx);
    State.transactions.unshift(saved); sortTransactions();
    txId = saved.id;
  }
  var pays = (d.payments || []).concat([{id: uid(), date: todayKey(), amount: a.amount, n: a.n, accountId: a.accountId, asExpense: a.asExpense, txId: txId}]);
  var newPaid = money(Math.min(Number(d.totalAmount), Number(d.paidAmount||0) + a.amount));
  await Store.update(k(), 'debts', id, {paidAmount: newPaid, payments: pays});
  d.paidAmount = newPaid; d.payments = pays;
  renderAll();
  toast('Pagamento de ' + fmtMoney(a.amount) + ' registrado em “' + d.name + '”.');
}

// Histórico de pagamentos/recebimentos com "Desfazer" (o registro fica, marcado como desfeito).
export function paymentLogHtml(list, kind, ownerId){
  if (!list || !list.length) return '';
  return '<details class="budget-details pay-log"><summary>' + (kind === 'debt' ? 'Pagamentos' : 'Recebimentos') + ' (' + list.length + ')</summary>' +
    list.slice().reverse().map(function(p){
      var acc = p.accountId ? accountName(p.accountId) : 'sem conta';
      var how = kind === 'debt' ? (p.asExpense ? 'gasto do mês' : 'não contou como gasto') : (p.fromInvoices ? 'parcelas que já passaram pelas faturas' : p.asIncome ? 'ganho do mês' : 'devolução');
      return '<div class="list-row' + (p.undone ? ' undone' : '') + '"><div class="tx-main"><div class="tx-desc tabular">' + fmtMoney(p.amount) + (p.n > 1 ? ' · ' + p.n + ' parcelas' : '') + '</div>' +
        '<div class="tx-meta">' + formatDateBr(p.date) + ' · ' + escapeHtml(acc) + ' · ' + how + (p.undone ? ' · desfeito em ' + formatDateBr(p.undone) : '') + '</div></div>' +
        (p.undone ? '' : '<button class="btn btn-ghost btn-sm" type="button" data-pay-undo="' + kind + ':' + escapeHtml(ownerId) + ':' + escapeHtml(p.id) + '">Desfazer</button>') + '</div>';
    }).join('') + '</details>';
}
export async function undoPayment(ref){
  var parts = ref.split(':'), kind = parts[0], owner = findById(kind === 'debt' ? State.debts : State.receivables, parts[1]);
  var p = owner && (owner.payments || []).filter(function(x){ return x.id === parts[2]; })[0];
  if (!p || p.undone) return;
  if (!(await confirmAction({title: 'Desfazer este ' + (kind === 'debt' ? 'pagamento' : 'recebimento') + '?', danger: false, confirmLabel: 'Desfazer',
    message: fmtMoney(p.amount) + ' de ' + formatDateBr(p.date) + ' volta a ' + (kind === 'debt' ? 'faltar na dívida' : 'faltar receber') + (p.txId ? ', e o lançamento ligado a ele sai de “Ganhos e gastos”' : '') + '. O registro fica no histórico, marcado como desfeito. Depois, registre de novo com os dados certos.'}))) return;
  if (p.txId && findById(State.transactions, p.txId)){
    await Store.remove(k(), 'transactions', p.txId);
    State.transactions = State.transactions.filter(function(t){ return t.id !== p.txId; });
  }
  var pays = owner.payments.map(function(x){ return x.id === p.id ? Object.assign({}, x, {undone: todayKey()}) : x; });
  var patch = {payments: pays};
  if (kind === 'debt') patch.paidAmount = money(Math.max(0, Number(owner.paidAmount || 0) - p.amount));
  else patch.receivedAmount = money(Math.max(0, Number(owner.receivedAmount || 0) - p.amount));
  await Store.update(k(), kind === 'debt' ? 'debts' : 'receivables', owner.id, patch);
  Object.assign(owner, patch);
  renderAll();
  toast((kind === 'debt' ? 'Pagamento' : 'Recebimento') + ' desfeito.');
}

/* ---------- A receber ---------- */

// Mostra no formulário só o que vale para o que foi escolhido (parcelas, cartão).
export function syncRecvForm(){
  var n = clampInstall(document.getElementById('recvInstall').value);
  var perMode = n > 1 && qs('input[name=recvMode][value=parcela]').checked;
  var typed = money(document.getElementById('recvTotal').value);
  document.getElementById('recvModeField').hidden = n <= 1;
  document.getElementById('recvTotalLabel').textContent = n <= 1 ? 'Valor' : (perMode ? 'Valor de cada parcela' : 'Valor total');
  document.getElementById('recvDueLabel').textContent = n <= 1 ? 'Combinado para' : '1ª parcela em';
  document.getElementById('recvInstallHint').textContent = installHint(n, perMode ? money(typed * n) : typed);
  var onCard = document.getElementById('recvKind').value === 'cartao';
  var linked = onCard && !!document.getElementById('recvLink').value;
  document.getElementById('recvCardField').hidden = !onCard || !State.cards.length;
  document.getElementById('recvLinkField').hidden = !onCard || !document.getElementById('recvLink').options.length || document.getElementById('recvLink').options.length < 2;
  document.getElementById('recvLaunchField').hidden = !onCard || !State.cards.length || linked;
  // Ligado a uma compra já lançada: cartão, valor e parcelas vêm dela.
  ['recvCard', 'recvTotal', 'recvInstall'].forEach(function(id){ document.getElementById(id).disabled = linked; });
  qsa('#recvForm [data-for="recvInstall"]').forEach(function(b){ b.disabled = linked; });
}
// Cartão sugerido: o último escolhido aqui ou, se não houver, o da compra mais recente no cartão.
export function populateRecvCards(){
  var sel = document.getElementById('recvCard');
  // Mantém o que a pessoa escolheu agora; senão, o último escolhido antes ou o da compra mais recente.
  var prev = (sel.dataset.chosen && sel.value) || getPrefs().recvCard;
  if (!findById(State.cards, prev)){
    var last = State.transactions.filter(function(t){ return t.paymentMethod === 'cartao' && findById(State.cards, t.cardId); })
      .sort(function(a, b){ return (b.createdAt||0) - (a.createdAt||0); })[0];
    prev = last ? last.cardId : '';
  }
  sel.innerHTML = optionsHtml(State.cards.map(function(c){ return {id: c.id, label: c.name}; }), prev);
  populateRecvLinks();
  syncRecvForm();
}
// Compras que podem virar "A receber" (ainda não ligadas a ninguém), mais recentes primeiro.
// anyPay: inclui gastos em conta, Pix e vale (para ligar "A receber" antigos); senão, só cartão.
export function recvLinkCandidates(anyPay){
  var out = [], seen = {}, since = shiftMonthKey(monthKeyOf(todayKey()), anyPay ? -12 : -4) + '-01';
  State.transactions.forEach(function(t){
    if (t.type !== 'expense' || t.forOther || t.writeOff || t.debtId) return;
    if (!anyPay && (t.paymentMethod !== 'cartao' || !findById(State.cards, t.cardId))) return;
    if (t.installment){
      var gid = t.installment.group;
      if (seen[gid]) return;
      seen[gid] = true;
      var items = State.transactions.filter(function(x){ return x.installment && x.installment.group === gid; }).sort(function(a, b){ return a.installment.n - b.installment.n; });
      if (!anyPay && items[items.length - 1].date < todayKey()) return;
      out.push({id: 'g:' + gid, items: items, date: items[0].date, label: t.installment.baseDescription + ' · ' + items.length + 'x de ' + fmtMoney(items[items.length - 1].amount)});
    } else if (t.date >= since){
      out.push({id: 't:' + t.id, items: [t], date: t.date, label: (t.description || catLabel(t.category, 'expense')) + ' · ' + fmtMoney(t.amount)});
    }
  });
  return out.sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, anyPay ? 80 : 40).map(function(c){
    var pay = paymentLabel(c.items[0]);
    c.total = sumMoney(c.items, function(t){ return t.amount; });
    c.createdAt = c.items[0].createdAt || 0;
    c.label += (pay ? ' · ' + pay : '') + ' · ' + formatDateBr(c.date);
    return c;
  });
}
export function populateRecvLinks(){
  var sel = document.getElementById('recvLink'), prev = sel.value;
  var list = recvLinkCandidates();
  sel.innerHTML = optionsHtml([{id: '', label: 'Nenhuma: vou informar os dados'}].concat(list), list.some(function(c){ return c.id === prev; }) ? prev : '');
}
export function recvLinkOf(id){ return recvLinkCandidates().filter(function(c){ return c.id === id; })[0] || null; }

export function renderReceivables(){
  populateRecvCards();
  var people = {};
  State.receivables.forEach(function(r){ var n = String(r.person || '').trim(); if (n) people[fold(n)] = n; });
  document.getElementById('peopleList').innerHTML = Object.keys(people).sort().map(function(key){ return '<option value="' + escapeHtml(people[key]) + '">'; }).join('');
  var grid = document.getElementById('recvGrid');
  if (!State.receivables.length){ grid.innerHTML = '<p class="empty-state">Ninguém te deve nada por aqui. Quando emprestar dinheiro ou alguém usar seu cartão, anote acima.</p>'; return; }
  var items = State.receivables.slice().sort(function(a,b){
    var ad = recvRemaining(a) <= 0, bd = recvRemaining(b) <= 0;
    return (ad - bd) || (URGENCY_RANK[urgencyOf(a)] - URGENCY_RANK[urgencyOf(b)]) || String(recvNextDue(a)||'9999').localeCompare(String(recvNextDue(b)||'9999'));
  });
  // Agrupado por pessoa: um bloco por nome (sem diferenciar maiúscula e acento), com o total que falta.
  var groups = {}, order = [];
  items.forEach(function(r){
    var key = fold(String(r.person || '').trim());
    if (!groups[key]){ groups[key] = {name: String(r.person || '').trim(), list: []}; order.push(key); }
    groups[key].list.push(r);
  });
  grid.innerHTML = order.map(function(key){
    var g = groups[key], open = g.list.filter(function(r){ return recvRemaining(r) > 0; });
    var left = sumMoney(open, recvRemaining);
    var late = open.filter(function(r){ var d = recvNextDue(r); return d && d < todayKey(); }).length;
    return '<section class="person-group' + (open.length ? '' : ' all-done') + '" aria-label="' + escapeHtml(g.name) + '">' +
      '<div class="person-head"><span class="avatar" aria-hidden="true">' + escapeHtml((g.name[0] || '?').toUpperCase()) + '</span>' +
        '<div class="person-info"><h4>' + escapeHtml(g.name) + '</h4><span class="tx-meta">' + g.list.length + ' registro(s)' + (open.length ? ' · ' + open.length + ' em aberto' : ' · tudo recebido') +
          (late ? ' · <strong class="neg-text">' + late + ' atrasado(s)</strong>' : '') + '</span></div>' +
        '<div class="person-total"><span class="tx-meta">Falta receber</span><strong class="tabular">' + fmtMoney(left) + '</strong></div>' +
        (open.length > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-recv-charge-all="' + escapeHtml(key) + '">' + icon('chat') + 'Cobrar tudo</button>' : '') +
      '</div>' +
      '<div class="debt-grid person-items">' + g.list.map(recvCardHtml).join('') + '</div></section>';
  }).join('');
}

// Parcelas da compra ligada a este "A receber" (paga pela pessoa ou a parte dela numa dividida) e quantas
// já passaram pelas faturas do cartão (vencimento antes de hoje, ou acertadas antes do cadastro).
export function recvHistory(r){
  var parts = State.transactions.filter(function(t){
    return t.type === 'expense' && ((t.forOther && t.forOther.receivableId === r.id) || (t.split && t.split.people.some(function(p){ return p.receivableId === r.id; })));
  });
  if (!parts.length) return null;
  function share(t){
    if (t.forOther) return Number(t.amount);
    var p = t.split.people.filter(function(x){ return x.receivableId === r.id; })[0];
    return Number(t.amount) * p.amount / Number(t.split.total);
  }
  var today = todayKey();
  var passed = parts.filter(function(t){
    if (t.installment && t.installment.settled) return true;
    var c = t.paymentMethod === 'cartao' && findById(State.cards, t.cardId);
    return c ? Cards.invoiceDates(Cards.txInvoiceKey(t, c), c).due < today : t.date < today;
  });
  return {count: parts.length, passed: passed.length, passedAmount: money(sumMoney(passed, share)), total: money(sumMoney(parts, share))};
}
// O que está registrado como recebido ficou para trás das faturas? (ex.: compra antiga ligada depois)
export function recvBehind(r){
  var h = recvHistory(r);
  if (!h || !h.passed || r.forgiven) return null;
  if ((r.syncedParcels || 0) >= h.passed) return null;
  if (Number(r.receivedAmount || 0) + 0.005 >= h.passedAmount) return null;
  return h;
}
// Atualiza "Me devem" pelo histórico da compra: as parcelas que já passaram pelas faturas foram devolvidas
// (contam como recebidas, com registro no histórico) ou ainda estão em aberto (só deixa de alertar).
export async function syncReceivable(id){
  var r = findById(State.receivables, id), h = recvHistory(r);
  if (!h || !h.passed){ toast('Nenhuma parcela dessa compra passou pelas faturas ainda.'); return; }
  var a = await openModal({
    title: 'Atualizar pelas faturas',
    body: '<p>Da compra ligada a ' + escapeHtml(r.person) + ', <strong>' + h.passed + ' de ' + h.count + ' parcela(s)</strong> já passaram pelas faturas do cartão (<strong class="tabular">' + fmtMoney(h.passedAmount) + '</strong>).</p>' +
      '<fieldset class="radio-group"><legend>' + escapeHtml(r.person) + '…</legend>' +
        '<label class="check"><input type="radio" name="prior" value="paid" checked> já me devolveu essas parcelas</label>' +
        '<label class="check"><input type="radio" name="prior" value="owed"> ainda me deve essas parcelas</label></fieldset>' +
      '<p class="field-hint">“Já devolveu” marca o valor como recebido (devolução, sem mexer no saldo de nenhuma conta) e fica no histórico de recebimentos.</p>',
    submitLabel: 'Atualizar',
    onSubmit: function(form){ return {paid: form.prior.value === 'paid'}; }
  });
  if (!a) return;
  var patch = {syncedParcels: h.passed, priorSettled: {count: h.passed, amount: h.passedAmount, paid: a.paid}};
  var delta = money(h.passedAmount - Number(r.receivedAmount || 0));
  if (a.paid && delta > 0){
    patch.receivedAmount = money(Math.min(Number(r.totalAmount), Number(r.receivedAmount || 0) + delta));
    patch.payments = (r.payments || []).concat([{id: uid(), date: todayKey(), amount: delta, accountId: null, asIncome: false, txId: null, fromInvoices: true}]);
  }
  await Store.update(k(), 'receivables', r.id, patch);
  Object.assign(r, patch);
  renderAll();
  toast(a.paid ? 'Atualizado: ' + h.passed + ' parcela(s) marcadas como devolvidas.' : 'Atualizado: as parcelas que já passaram continuam em aberto.');
}

export function recvCardHtml(r){
  var remaining = recvRemaining(r);
  var pct = r.totalAmount > 0 ? Math.min(1, Number(r.receivedAmount||0)/Number(r.totalAmount)) : 0;
  var done = remaining <= 0;
  var info = recvInstallInfo(r);
  var due = recvNextDue(r);
  var late = !done && due && due < todayKey();
  var lateHtml = late ? ' · <strong style="color:var(--critical)">atrasado</strong>' : '';
  return '<div class="debt-card">' +
    '<div class="budget-top"><h4>'+escapeHtml(r.description || labelOf(RECV_KINDS, r.kind))+'</h4><span class="card-tags"><span class="pill brand">' + escapeHtml(labelOf(RECV_KINDS, r.kind)) + (info ? ' · ' + info.n + 'x' : '') + '</span>' +
      (done ? '' : urgencySelectHtml('receivables', r, r.person)) + '</span></div>' +
    (recvCardLine(r) && !done ? '<span class="tx-meta">' + recvCardLine(r) + '</span>' : '') +
    (recvBehind(r) && !done ? '<div class="sync-alert" role="note"><span><strong>' + recvBehind(r).passed + ' de ' + recvBehind(r).count + ' parcela(s)</strong> dessa compra já passaram pelas faturas (' +
      fmtMoney(recvBehind(r).passedAmount) + '), mas o recebido está em ' + fmtMoney(r.receivedAmount || 0) + '.</span>' +
      '<button class="btn btn-primary btn-sm" type="button" data-recv-sync="' + r.id + '">Atualizar pelas faturas</button></div>' : '') +
    (r.priorSettled ? '<p class="prior-note">Compra de ' + fmtMoney(r.totalAmount) + (info ? ' em ' + info.n + 'x' : '') + ': ' +
      (r.priorSettled.count === 1 ? 'a 1ª parcela' : 'as ' + r.priorSettled.count + ' primeiras parcelas') + ' (' + fmtMoney(r.priorSettled.amount) + ') já tinham vencido antes do cadastro e ' +
      (r.priorSettled.paid ? (r.priorSettled.count === 1 ? 'já foi acertada.' : 'já foram acertadas.') : (r.priorSettled.count === 1 ? 'ainda está em aberto.' : 'ainda estão em aberto.')) + '</p>' : '') +
    '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
    '<div class="debt-figs"><span class="tabular">Total: '+fmtMoney(r.totalAmount||0)+'</span><span class="tabular">Recebido: '+fmtMoney(r.receivedAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
    (info ? '<span class="tx-meta">' + (done ? info.n + ' parcelas de ' + fmtMoney(info.per) + ', todas recebidas' :
        'Parcela ' + info.next + ' de ' + info.n + ' · ' + fmtMoney(info.per) + (due ? ' · vence ' + formatDateFull(due) : '') + lateHtml) + '</span>' :
      (r.dueDate ? '<span class="tx-meta">Combinado para ' + formatDateFull(r.dueDate) + lateHtml + '</span>' : '')) +
    '<div class="card-actions">' +
      (r.forgiven ? '<span class="status-pill warning">Não vai devolver (' + fmtMoney(r.forgivenAmount || 0) + ')</span>' :
        done ? '<span class="status-pill good">Recebido</span>' :
        '<button class="btn btn-ghost btn-sm" type="button" data-recv-get="'+r.id+'">Registrar recebimento</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-recv-charge="'+r.id+'">' + icon('chat') + 'Cobrar</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-recv-forgive="'+r.id+'">Não vai devolver</button>') +
      (!r.linked && !r.forgiven && r.kind !== 'emprestimo' ? '<button class="btn btn-ghost btn-sm" type="button" data-recv-link="'+r.id+'" title="Para “A receber” anotados antes: escolha o gasto que você pagou pela pessoa">Ligar à compra</button>' : '') +
      '<button class="btn btn-danger btn-sm" type="button" data-recv-del="'+r.id+'">Excluir</button>' +
    '</div>' + paymentLogHtml(r.payments, 'recv', r.id) + '</div>';
}

// "A receber" antigo (de antes do vínculo): liga a um gasto já lançado. O gasto passa a ser "pago por"
// essa pessoa e, se quiser, os recebimentos antigos dela viram devolução (para não contar como ganho).
export async function linkReceivable(id){
  var r = findById(State.receivables, id);
  var cands = recvLinkCandidates(true);
  if (!cands.length){ toast('Nenhum gasto disponível para ligar nos últimos 12 meses.'); return; }
  // Sugestão: mesmo valor, lançado perto do momento em que o "A receber" foi criado.
  var best = cands.filter(function(c){ return Math.abs(c.total - Number(r.totalAmount)) < 0.005; })
    .sort(function(a, b){ return Math.abs(a.createdAt - (r.createdAt||0)) - Math.abs(b.createdAt - (r.createdAt||0)); })[0];
  var olds = State.transactions.filter(function(t){ return t.type === 'income' && !t.refund && t.category === 'recebimento' &&
    (t.receivableId === r.id || (!t.receivableId && t.description === 'Recebido de ' + r.person && (t.createdAt||0) >= (r.createdAt||0))); });
  var a = await openModal({
    title: 'Ligar à compra',
    body: '<p>Escolha o gasto que você pagou por ' + escapeHtml(r.person) + '. Ele sai dos seus gastos e ganha a etiqueta “Pago por ' + escapeHtml(r.person) + '”.</p>' +
      '<div class="field"><label for="lkTx">Gasto</label><select id="lkTx" name="tx">' +
        optionsHtml(cands.map(function(c){ return {id: c.id, label: (best && c.id === best.id ? '★ ' : '') + c.label}; }), best ? best.id : cands[0].id) + '</select>' +
        (best ? '<span class="field-hint">★ Sugestão: mesmo valor (' + fmtMoney(best.total) + '), lançado perto de quando você anotou o “A receber”.</span>' : '') + '</div>' +
      (olds.length ? '<label class="check"><input type="checkbox" name="refund" checked> Marcar ' + olds.length + ' recebimento(s) já registrado(s) de ' + escapeHtml(r.person) + ' (' +
        fmtMoney(sumMoney(olds, function(t){ return t.amount; })) + ') como devolução, para não contarem como ganho</label>' : ''),
    submitLabel: 'Ligar',
    onSubmit: function(form){ return {id: form.tx.value, refund: !!(form.refund && form.refund.checked)}; }
  });
  if (!a) return;
  var c = cands.filter(function(x){ return x.id === a.id; })[0];
  var fo = {forOther: {person: r.person, receivableId: r.id}};
  await Store.updateMany(k(), 'transactions', c.items.map(function(t){ return {id: t.id, partial: fo}; }));
  c.items.forEach(function(t){ Object.assign(t, fo); });
  if (a.refund){
    var rf = {refund: true, receivableId: r.id};
    await Store.updateMany(k(), 'transactions', olds.map(function(t){ return {id: t.id, partial: rf}; }));
    olds.forEach(function(t){ Object.assign(t, rf); });
  }
  var patch = {linked: true, category: c.items[0].category};
  if (c.items[0].paymentMethod === 'cartao') patch.cardId = c.items[0].cardId;
  await Store.update(k(), 'receivables', r.id, patch); Object.assign(r, patch);
  renderAll();
  toast('Ligado: o gasto agora é “pago por ' + r.person + '”' + (a.refund && olds.length ? ' e os recebimentos antigos viraram devolução.' : '.'));
  // Compra antiga: já pergunta sobre as parcelas que passaram pelas faturas.
  if (recvBehind(r)) await syncReceivable(r.id);
}

// "Cartão Inter · parcela 2 de 3 · fatura de novembro de 2026" (compra feita no seu cartão).
export function recvCardLine(r){
  var c = r.cardId && findById(State.cards, r.cardId);
  if (!c) return '';
  var info = recvInstallInfo(r), due = recvNextDue(r);
  return 'Cartão ' + escapeHtml(c.name) + (info ? ' · parcela ' + info.next + ' de ' + info.n : '') + (due ? ' · fatura de ' + monthLabelOf(due.slice(0, 7)) : '');
}
export async function receiveReceivable(id){
  var r = findById(State.receivables, id);
  var remaining = recvRemaining(r);
  var info = recvInstallInfo(r);
  var suggested = info ? money(Math.min(info.next === info.n ? remaining : info.per, remaining)) : remaining;
  var refundDefault = recvDefaultRefund(r);
  // Duas perguntas separadas: para onde foi o dinheiro e se ele conta como ganho.
  var a = await openModal({
    title: 'Registrar recebimento',
    body: '<p>' + escapeHtml(r.person) + ' te deve ' + fmtMoney(remaining) + (info ? '. Próxima: parcela ' + info.next + ' de ' + info.n : '') + '.</p>' +
      (recvCardLine(r) ? '<p class="tip-box">' + icon('card') + ' ' + recvCardLine(r) + '</p>' : '') +
      (info ? '<fieldset class="radio-group"><legend>Quanto entrou?</legend>' +
          '<label class="check"><input type="radio" name="mode" value="parcela" checked> Valor da parcela (' + fmtMoney(suggested) + ')</label>' +
          '<label class="check"><input type="radio" name="mode" value="outro"> Outro valor (a mais, a menos ou várias parcelas)</label>' +
        '</fieldset>' : '') +
      '<div class="field" id="rcvOtherField"' + (info ? ' hidden' : '') + '><label for="rcvOther">Valor recebido</label><span class="money-input"><span>R$</span><input id="rcvOther" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + (info ? '' : remaining) + '"></span></div>' +
      (State.accounts.length ? accountSelectHtml('rcvAcc', 'acc', 'Para onde foi o dinheiro?') : '') +
      '<fieldset class="radio-group"><legend>Como contar?</legend>' +
        '<label class="check"><input type="radio" name="as" value="refund"' + (refundDefault ? ' checked' : '') + '> Devolução: é dinheiro meu voltando (empréstimo ou algo que paguei pela pessoa). Não conta como ganho.</label>' +
        '<label class="check"><input type="radio" name="as" value="income"' + (refundDefault ? '' : ' checked') + '> Ganho do mês: é dinheiro novo (venda, serviço, acerto combinado).</label>' +
      '</fieldset>' +
      '<p class="tip-box" id="rcvEffect" aria-live="polite"></p>',
    submitLabel: 'Registrar',
    onOpen: function(modal){
      function value(){ var m = qs('input[name=mode]:checked', modal); return m && m.value === 'parcela' ? suggested : money(qs('#rcvOther', modal).value); }
      function effect(){
        var v = value(), acc = qs('#rcvAcc', modal), accName = acc && acc.value ? acc.options[acc.selectedIndex].text : '';
        var asIncome = qs('input[name=as]:checked', modal).value === 'income';
        qs('#rcvEffect', modal).innerHTML = '<strong>O que vai acontecer:</strong> ' + (v > 0 ? fmtMoney(v) : 'o valor') + ' sai do que ' + escapeHtml(r.person) + ' te deve' +
          (accName ? '; entra no saldo de ' + escapeHtml(accName) : '; não mexe no saldo de nenhuma conta') +
          (asIncome ? '; conta como ganho do mês.' : '; não conta como ganho (é devolução).');
      }
      modal.addEventListener('change', function(e){
        if (e.target.name === 'mode'){
          var other = e.target.value === 'outro';
          qs('#rcvOtherField', modal).hidden = !other;
          if (other) qs('#rcvOther', modal).focus();
        }
        effect();
      });
      modal.addEventListener('input', effect);
      effect();
    },
    onSubmit: function(form){
      var v = info && form.mode.value === 'parcela' ? suggested : money(form.amount.value);
      if (!(v > 0)) return {error:'Informe um valor maior que zero.'};
      if (v > remaining + 0.001) return {error:'O valor não pode passar de ' + fmtMoney(remaining) + '.'};
      return {amount: v, asIncome: form.as.value === 'income', accountId: form.acc ? (form.acc.value || null) : null};
    }
  });
  if (!a || !a.amount) return;
  var txId = null;
  // Ganho: sempre vira lançamento. Devolução: só quando entra numa conta (para o saldo subir).
  if (a.asIncome || a.accountId){
    var tx = {type:'income', amount:a.amount, category:'recebimento', categoryLabel: catLabel('recebimento', 'income'), date: todayKey(),
      description: (a.asIncome ? 'Recebido de ' : 'Devolução de ') + r.person, paymentMethod:null, accountId: a.accountId, receivableId: r.id, createdAt: Date.now()};
    if (!a.asIncome) tx.refund = true;
    var saved = await Store.add(k(), 'transactions', tx);
    State.transactions.unshift(saved); sortTransactions();
    txId = saved.id;
  }
  var pays = (r.payments || []).concat([{id: uid(), date: todayKey(), amount: a.amount, accountId: a.accountId, asIncome: a.asIncome, txId: txId}]);
  var newReceived = money(Math.min(Number(r.totalAmount), Number(r.receivedAmount||0) + a.amount));
  await Store.update(k(), 'receivables', id, {receivedAmount: newReceived, payments: pays});
  r.receivedAmount = newReceived; r.payments = pays;
  renderAll();
  toast('Recebimento de ' + fmtMoney(a.amount) + ' registrado' + (a.asIncome ? ' como ganho.' : ' como devolução.'));
}

// A pessoa não vai devolver o que falta: o "A receber" fecha e, se você quiser, o valor vira gasto seu.
export async function forgiveReceivable(id){
  var r = findById(State.receivables, id);
  var remaining = recvRemaining(r);
  var cat = r.category || 'outros';
  var a = await openModal({title: 'Não vai devolver?', submitLabel: 'Confirmar',
    body: '<p>' + escapeHtml(r.person) + ' não vai devolver os <strong class="tabular">' + fmtMoney(remaining) + '</strong> que faltam. O registro continua no histórico, marcado como “não vai devolver”.</p>' +
      '<label class="check"><input type="checkbox" name="own"' + (r.linked ? ' checked' : '') + '> Contar ' + fmtMoney(remaining) + ' como gasto meu (em ' + escapeHtml(catLabel(cat, 'expense')) + ')</label>' +
      '<p class="field-hint">Marque se o dinheiro saiu do seu bolso (você pagou ou emprestou). O lançamento não mexe em conta nem em cartão, porque o dinheiro já tinha saído antes.</p>',
    onSubmit: function(form){ return {extra: form.own.checked}; }
  });
  if (!a) return;
  await Store.update(k(), 'receivables', id, {forgiven: true, forgivenAmount: remaining, forgivenAt: todayKey()});
  r.forgiven = true; r.forgivenAmount = remaining; r.forgivenAt = todayKey();
  if (a.extra){
    // Só conta como gasto: o dinheiro já tinha saído no dia da compra, então não mexe em conta nem cartão.
    var saved = await Store.add(k(), 'transactions', {type:'expense', amount: remaining, category: cat, categoryLabel: catLabel(cat, 'expense'), date: todayKey(),
      description: 'Não devolvido por ' + r.person + (r.description ? ': ' + r.description : ''), paymentMethod: null, accountId: null, cardId: null, voucherId: null,
      writeOff: true, receivableId: r.id, createdAt: Date.now()});
    State.transactions.unshift(saved); sortTransactions();
  }
  renderAll();
  toast('Registrado: ' + r.person + ' não vai devolver.' + (a.extra ? ' O valor entrou nos seus gastos.' : ''));
}

export function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

// Cobrar uma pendência, ou todas as da mesma pessoa numa mensagem só ("Cobrar tudo").
export async function chargePerson(key){
  var list = State.receivables.filter(function(r){ return fold(String(r.person || '').trim()) === key && recvRemaining(r) > 0; });
  if (list.length) chargeReceivable(list[0].id, list);
}
export function chargeItem(r){
  var remaining = recvRemaining(r), info = recvInstallInfo(r), due = recvNextDue(r);
  return {what: info ? 'parcela ' + info.next + ' de ' + info.n + ', de ' + fmtMoney(Math.min(info.per, remaining)) : fmtMoney(remaining),
    due: due ? (info ? 'combinada' : 'combinado') + ' para ' + formatDateFull(due) : ''};
}
export async function chargeReceivable(id, all){
  var r = findById(State.receivables, id);
  var first = State.session.name.split(' ')[0], msg;
  if (all && all.length > 1){
    msg = 'Oi, ' + r.person.split(' ')[0] + '! Tudo bem? Passando para lembrar o que ficou combinado:\n' +
      all.map(function(x){ var c = chargeItem(x); return '• ' + (x.description || labelOf(RECV_KINDS, x.kind)) + ': ' + c.what + (c.due ? ' (' + c.due + ')' : ''); }).join('\n') +
      '\nTotal em aberto: ' + fmtMoney(sumMoney(all, recvRemaining)) + '. Quando puder, me avisa. Obrigado! ' + first;
  } else {
    var c = chargeItem(r), info = recvInstallInfo(r);
    msg = 'Oi, ' + r.person.split(' ')[0] + '! Tudo bem? Passando para lembrar ' + (info ? 'da ' : 'do valor de ') + c.what +
      (r.description ? ' (' + r.description + ')' : '') + (c.due ? ', ' + c.due : '') +
      '. Quando puder, me avisa. Obrigado! ' + first;
  }
  await openModal({
    title: 'Cobrar ' + r.person,
    body: '<div class="field"><label for="chargeMsg">Mensagem (pode editar)</label><textarea id="chargeMsg" name="msg" rows="' + (all && all.length > 1 ? 8 : 5) + '" maxlength="1200">' + escapeHtml(msg) + '</textarea></div>' +
      '<div class="field"><label for="chargePhone">WhatsApp da pessoa (opcional)</label><input id="chargePhone" name="phone" type="tel" maxlength="20" value="' + escapeHtml(r.phone||'') + '" placeholder="(11) 98888-7777"></div>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-charge="copy">Copiar mensagem</button></div>',
    submitLabel: 'Abrir no WhatsApp', cancelLabel: 'Fechar',
    onOpen: function(root){
      qs('[data-charge="copy"]', root).addEventListener('click', function(){
        var text = qs('#chargeMsg', root).value;
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('Mensagem copiada.'); }, function(){ toast('Não foi possível copiar.'); });
      });
    },
    onSubmit: async function(form){
      var phone = onlyDigits(form.phone.value);
      if (phone && phone.length >= 10 && phone.length <= 11) phone = '55' + phone;
      if (phone !== onlyDigits(r.phone) && form.phone.value.trim()){
        var targets = all && all.length > 1 ? all : [r];
        var ph = {phone: form.phone.value.trim()};
        await Store.updateMany(k(), 'receivables', targets.map(function(x){ return {id: x.id, partial: ph}; }));
        targets.forEach(function(x){ x.phone = ph.phone; });
      }
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(form.msg.value), '_blank', 'noopener');
      return true;
    }
  });
}

// Eventos de Compromissos: formulários de dívida e de A receber.
export function wireCommitments(){
  document.getElementById('recvCard').addEventListener('change', function(e){ e.target.dataset.chosen = '1'; });
  document.getElementById('recvLink').addEventListener('change', function(e){
    var c = recvLinkOf(e.target.value);
    if (c){
      var first = c.items[0], card = findById(State.cards, first.cardId);
      document.getElementById('recvCard').value = first.cardId;
      document.getElementById('recvTotal').value = sumMoney(c.items, function(t){ return t.amount; });
      document.getElementById('recvInstall').value = c.items.length;
      qs('input[name=recvMode][value=total]').checked = true;
      document.getElementById('recvLaunch').checked = false;
      if (!document.getElementById('recvDesc').value) document.getElementById('recvDesc').value = first.installment ? first.installment.baseDescription : (first.description || '');
      if (!document.getElementById('recvDue').value) document.getElementById('recvDue').value = invoiceDates(invoiceKeyFor(first.date, card), card).due;
    }
    syncRecvForm();
  });

  document.getElementById('debtForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('debtName').value.trim();
    var total = money(document.getElementById('debtTotal').value);
    var paid = Math.max(0, money(document.getElementById('debtPaid').value || 0));
    var installment = Math.max(0, money(document.getElementById('debtInstallment').value || 0));
    if (!name || !(total > 0)){ toast('Informe nome e valor total da dívida.'); return; }
    if (paid > total){ toast('O valor já pago não pode ser maior que o total.'); return; }
    var debt = {name:name, kind: document.getElementById('debtKind').value, creditor: document.getElementById('debtCreditor').value.trim(), totalAmount:total, paidAmount:paid, monthlyPayment:installment, urgency: document.getElementById('debtUrgency').value, createdAt:Date.now()};
    var saved = await Store.add(k(), 'debts', debt);
    State.debts.push(saved);
    e.target.reset();
    renderDebts(); renderDashboard();
    toast('Dívida “' + name + '” adicionada.');
  });

  document.getElementById('recvForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var person = document.getElementById('recvPerson').value.trim();
    var typed = money(document.getElementById('recvTotal').value);
    var due = document.getElementById('recvDue').value;
    var kind = document.getElementById('recvKind').value;
    var desc = document.getElementById('recvDesc').value.trim();
    var n = clampInstall(document.getElementById('recvInstall').value);
    var perMode = n > 1 && qs('input[name=recvMode][value=parcela]').checked;
    if (!person || !(typed > 0)){ toast('Informe quem vai pagar e o valor.'); return; }
    if (!validDateStr(due)){ toast('Use uma data entre 1900 e 3000.'); return; }
    var total = perMode ? money(typed * n) : typed;
    var r = {person:person, kind: kind, description: desc, phone: document.getElementById('recvPhone').value.trim(), totalAmount: total, receivedAmount: 0, dueDate: due || null, urgency: document.getElementById('recvUrgency').value, createdAt: Date.now()};
    if (n > 1){ r.installments = n; r.installmentAmount = perMode ? typed : Math.floor(total * 100 / n) / 100; }
    // Compra feita no meu cartão: pode ser uma compra já lançada (fica ligada a ela) ou entrar agora
    // na fatura, já parcelada. Em qualquer caso o "A receber" guarda o cartão.
    var link = kind === 'cartao' ? recvLinkOf(document.getElementById('recvLink').value) : null;
    var usedCard = kind === 'cartao' ? findById(State.cards, link ? link.items[0].cardId : document.getElementById('recvCard').value) : null;
    var card = !link && usedCard && document.getElementById('recvLaunch').checked ? usedCard : null;
    if (usedCard){
      r.cardId = usedCard.id;
      setPref('recvCard', usedCard.id);
      if (!r.dueDate) r.dueDate = invoiceDates(invoiceKeyFor(link ? link.items[0].date : todayKey(), usedCard), usedCard).due;
    }
    if (card){ r.linked = true; r.category = 'compras'; }
    if (link){
      var items = link.items;
      r.linked = true; r.category = items[0].category;
      r.totalAmount = sumMoney(items, function(t){ return t.amount; });
      delete r.installments; delete r.installmentAmount;
      if (items.length > 1){ r.installments = items.length; r.installmentAmount = items[items.length - 1].amount; }
    }
    var saved = await Store.add(k(), 'receivables', r);
    State.receivables.push(saved);
    if (link){
      var fo = {forOther: {person: person, receivableId: saved.id}};
      await Store.updateMany(k(), 'transactions', link.items.map(function(t){ return {id: t.id, partial: fo}; }));
      link.items.forEach(function(t){ Object.assign(t, fo); });
    }
    if (card){
      var tx = {type:'expense', amount: total, category:'compras', categoryLabel: catLabel('compras', 'expense'), date: todayKey(),
        description: desc || 'Compra para ' + person, paymentMethod:'cartao', cardId: card.id, voucherId: null,
        forOther: {person: person, receivableId: saved.id}, createdAt: Date.now()};
      await saveTransactions(expandInstallments(tx, n));
    }
    e.target.reset();
    document.getElementById('recvLink').value = '';
    if (card || link) renderAll(); else { renderReceivables(); renderDashboard(); }
    toast(person + ' foi adicionado(a) em “A receber”' + (n > 1 ? ' em ' + n + 'x' : '') + '.' + (card ? ' A compra entrou na fatura do ' + card.name + '.' : '') +
      (link ? ' Ligado à compra no ' + usedCard.name + ', que deixa de contar como gasto seu.' : ''));
  });

  document.getElementById('debtKind').innerHTML = optionsHtml(DEBT_KINDS, 'banco');
  document.getElementById('recvKind').innerHTML = optionsHtml(RECV_KINDS, 'emprestimo');
  qsa('[data-urgency-options]').forEach(function(sel){ sel.innerHTML = optionsHtml(urgencyOptions(), DEFAULT_URGENCY); });
  qsa('[data-age-options]').forEach(function(sel){ sel.innerHTML = optionsHtml(Research.AGE_RANGES, ''); });
  qsa('[data-uf-options]').forEach(function(sel){ sel.innerHTML = optionsHtml(ufOptions(), ''); });
  document.getElementById('signupResearch').addEventListener('change', function(e){ document.getElementById('signupResearchProfile').hidden = !e.target.checked; });
  // Depois de enviar um formulário, a urgência volta para média.
  ['goalForm', 'debtForm', 'recvForm'].forEach(function(id){
    document.getElementById(id).addEventListener('reset', function(e){ setTimeout(function(){ qsa('[data-urgency-options]', e.target).forEach(function(sel){ sel.value = DEFAULT_URGENCY; }); }, 0); });
  });
  document.addEventListener('change', function(e){
    var sel = e.target.closest && e.target.closest('[data-urgency]');
    if (!sel) return;
    var parts = sel.getAttribute('data-urgency').split(':');
    setUrgency(parts[0], parts.slice(1).join(':'), sel.value);
  });
  ['recvInstall','recvTotal'].forEach(function(id){ document.getElementById(id).addEventListener('input', syncRecvForm); });
  document.getElementById('recvForm').addEventListener('change', syncRecvForm);
  document.getElementById('recvForm').addEventListener('reset', function(){ setTimeout(syncRecvForm, 0); });
}
