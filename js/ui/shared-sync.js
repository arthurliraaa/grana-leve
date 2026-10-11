/*
 * Cobranças compartilhadas entre duas contas (só com conta online; tabela shared_charges).
 * - Quem cobra ("Me devem", receivable.sharedId) registra recebimentos e confirma ou recusa os avisos
 *   de pagamento de quem deve.
 * - Quem deve ("Eu devo", debt.shared.sid) avisa "paguei"; o aviso fica pendente até quem cobra
 *   confirmar. O "já pago" dela é o que quem cobra confirmou + os avisos ainda pendentes.
 * - No login, cada lado vê as novidades do outro (eventos depois do *_seen_at) numa janela só, e os
 *   avisos pendentes também aparecem no cartão da cobrança até alguém decidir.
 * Nada aqui trava o app: sem servidor, sem a migração ou sem internet, tudo segue como antes.
 */
import {todayKey, formatDateBr} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, uid} from '../domain/util.js';
import {recvDefaultRefund} from '../domain/receivables.js';
import {Store} from '../data/store.js';
import {qs, escapeHtml, optionsHtml, toast} from './dom.js';
import {openModal} from './modal.js';
import {renderAll} from './shell.js';
import {State, k} from './state.js';
import {recordReceipt} from './commitments-tab.js';

// Só a conta online tem as funções do servidor (o Store local não tem sharedList).
export function sharedOnline(){ return !!(Store.sharedList && State.session); }
function first(name){ return String(name || '').split(' ')[0] || 'A pessoa'; }

// Linhas lidas no último login (por id) e avisos pendentes de cada lado.
function rowsById(){ return State.sharedRows || {}; }
export function sharedRowOf(id){ return id ? rowsById()[id] || null : null; }
export function pendingPaidEvents(row){
  return row ? (row.events || []).filter(function(e){ return e.kind === 'paid' && e.status === 'pending'; }) : [];
}

// Avisa o outro lado. Sem conexão (ou sem a migração), guarda para tentar no próximo login.
export async function sendSharedEvent(sid, kind, amount, date, ref){
  if (!sid || !sharedOnline()) return null;
  try { return await Store.sharedEvent(sid, kind, amount, date, ref); }
  catch(e){ return {failed: true, message: e.userMessage}; }
}

// Quem deve registrou um pagamento: vira aviso "paguei" para quem cobra confirmar.
export async function notifyDebtPayment(d, payment){
  if (!(d.shared && d.shared.sid) || !sharedOnline()) return;
  var ev = await sendSharedEvent(d.shared.sid, 'paid', payment.amount, payment.date);
  var patch = ev && ev.id ? {sharedEvent: ev.id} : {sharedPending: true};
  d.payments = d.payments.map(function(p){ return p.id === payment.id ? Object.assign({}, p, patch) : p; });
  await Store.update(k(), 'debts', d.id, {payments: d.payments});
  var row = sharedRowOf(d.shared.sid);
  if (row && ev && ev.id) row.events = (row.events || []).concat([ev]);
  renderAll();
  toast(ev && ev.id ? first(d.shared.from) + ' vai ver o aviso do pagamento para confirmar.' : 'Pagamento salvo. O aviso para ' + first(d.shared.from) + ' vai no próximo login.');
}
// Quem deve desfez um pagamento que ainda estava pendente.
export async function notifyDebtUndo(d, payment){
  if (!(d.shared && d.shared.sid) || !payment.sharedEvent) return;
  var r = await sendSharedEvent(d.shared.sid, 'cancel', null, null, payment.sharedEvent);
  if (r && r.failed) toast(first(d.shared.from) + ' já tinha confirmado esse pagamento: peça para desfazer do lado dela/dele.');
}
// Quem cobra registrou (ou desfez) um recebimento fora dos avisos.
export async function notifyReceipt(r, amount, undo){
  if (!r.sharedId) return;
  var res = await sendSharedEvent(r.sharedId, undo ? 'unreceived' : 'received', amount, todayKey());
  if (res && res.failed) toast('Salvo aqui. ' + first(r.person) + ' vê a atualização quando a conexão voltar.');
}
// Quem cobra ou quem deve apagou o registro: sai da cobrança no servidor.
export async function leaveShared(sid){
  if (!sid || !sharedOnline()) return;
  try { await Store.sharedLeave(sid); } catch(e){ /* sem conexão: a linha fica, sem prejuízo */ }
}

// Confirmar (ou recusar) um aviso de pagamento. Confirmar registra o recebimento aqui também.
export async function decidePaid(r, row, e, ok, accountId){
  var res = await sendSharedEvent(row.id, ok ? 'confirm' : 'reject', null, null, e.id);
  if (!res || res.failed){ toast((res && res.message) || 'Sem conexão: tente de novo.'); return false; }
  e.status = ok ? 'confirmed' : 'rejected';
  if (ok) await recordReceipt(r, {amount: Number(e.amount), date: e.date || todayKey(), accountId: accountId || null,
    asIncome: !recvDefaultRefund(r), extra: {sharedEvent: e.id, fromShared: first(r.person)}});
  row.received = ok ? money(Math.min(Number(row.total), Number(row.received) + Number(e.amount))) : row.received;
  return true;
}

// Ajusta a dívida de quem deve ao que está no servidor: total, parcela, Pix e "já pago"
// (= confirmado por quem cobra + os meus avisos ainda pendentes). Recebimentos registrados por quem
// cobra entram no histórico; meus avisos recusados ficam marcados.
async function reconcileDebt(d, row, newEvents){
  var mine = sumMoney(pendingPaidEvents(row), function(e){ return e.amount; });
  var paid = money(Math.min(Number(row.total), Number(row.received) + mine));
  var pays = (d.payments || []).slice();
  newEvents.forEach(function(e){
    if (e.by === 'creditor' && e.kind === 'received') pays.push({id: uid(), date: e.date || todayKey(), amount: Number(e.amount), fromShared: first(d.shared.from), sharedEvent: e.id});
    if (e.by === 'creditor' && e.kind === 'unreceived') pays.push({id: uid(), date: e.date || todayKey(), amount: -Number(e.amount), fromShared: first(d.shared.from), sharedEvent: e.id});
    if (e.kind === 'paid' && e.status === 'rejected'){
      pays = pays.map(function(p){ return p.sharedEvent === e.id && !p.undone ? Object.assign({}, p, {undone: todayKey(), rejected: true}) : p; });
    }
  });
  var patch = {totalAmount: Number(row.total), paidAmount: paid, monthlyPayment: Number(row.installment_amount) || 0, payments: pays,
    shared: Object.assign({}, d.shared, {pix: row.pix || '', due: row.due_date || null, from: row.creditor_name || d.shared.from})};
  if (row.description) patch.name = row.description;
  await Store.update(k(), 'debts', d.id, patch);
  Object.assign(d, patch);
}

// Novidades para quem chamou (eventos do outro lado depois da última vez que viu).
function newsFor(row, side){
  var since = (side === 'creditor' ? row.creditor_seen_at : row.debtor_seen_at) || '1970-01-01';
  return (row.events || []).filter(function(e){
    var when = e.decided_at || e.at;
    if (!(when > since)) return false;
    if (side === 'creditor') return e.by === 'debtor' && e.kind !== 'paid' || (e.kind === 'paid' && e.status === 'cancelled');
    return e.by === 'creditor' || (e.kind === 'paid' && (e.status === 'confirmed' || e.status === 'rejected'));
  });
}
function noticeText(e, side, who){
  var v = e.amount != null ? fmtMoney(Math.abs(Number(e.amount))) : '';
  if (side === 'creditor'){
    if (e.kind === 'accepted') return who + ' aceitou a cobrança: agora vocês acompanham juntos.';
    if (e.kind === 'left') return who + ' saiu da cobrança (não acompanha mais).';
    if (e.kind === 'paid' && e.status === 'cancelled') return who + ' desfez o aviso de pagamento de ' + v + '.';
    return '';
  }
  if (e.kind === 'received') return who + ' registrou que recebeu ' + v + ' (' + formatDateBr(e.date || todayKey()) + ').';
  if (e.kind === 'unreceived') return who + ' desfez um recebimento de ' + v + '.';
  if (e.kind === 'update') return who + ' atualizou a cobrança: total de ' + v + '.';
  if (e.kind === 'paid' && e.status === 'confirmed') return who + ' confirmou o seu pagamento de ' + v + '.';
  if (e.kind === 'paid' && e.status === 'rejected') return who + ' disse que não recebeu o pagamento de ' + v + ' (' + formatDateBr(e.date || todayKey()) + '). O valor voltou para “falta”; se o pagamento virou lançamento em Ganhos e gastos, confira lá.';
  return '';
}

// No login (e quando a pessoa pede): busca as cobranças, ajusta os dois lados e mostra as novidades.
export async function syncShared(opts){
  if (!sharedOnline()) return false;
  var rows;
  try { rows = await Store.sharedList(); } catch(e){ return false; }
  var me = k(), map = {}, notices = [], confirms = [], seen = [];
  rows.forEach(function(row){ map[row.id] = row; });
  State.sharedRows = map;
  for (var i = 0; i < rows.length; i++){
    var row = rows[i];
    if (row.creditor_id === me){
      var r = State.receivables.filter(function(x){ return x.sharedId === row.id; })[0];
      if (!r) continue;
      var who = first(r.person);
      newsFor(row, 'creditor').forEach(function(e){ var t = noticeText(e, 'creditor', who); if (t) notices.push({text: t, title: r.description || r.person}); });
      pendingPaidEvents(row).forEach(function(e){ confirms.push({r: r, row: row, e: e}); });
      var accepted = !!row.debtor_id;
      if (!!r.sharedWith !== accepted){ r.sharedWith = accepted; await Store.update(k(), 'receivables', r.id, {sharedWith: accepted}); }
      // O que está aqui manda: se o servidor ficou para trás (ex.: sem conexão), atualiza.
      if (Number(row.received) !== Number(r.receivedAmount || 0) || Number(row.total) !== Number(r.totalAmount)){
        try { await saveSharedRow(r, row.pix); } catch(e){ /* tenta no próximo login */ }
      }
      seen.push(row.id);
    } else if (row.debtor_id === me){
      var d = State.debts.filter(function(x){ return x.shared && x.shared.sid === row.id; })[0];
      if (!d) continue;
      // Avisos que não saíram (sem conexão na hora): envia agora.
      for (var j = 0; j < (d.payments || []).length; j++){
        var p = d.payments[j];
        if (p.sharedPending && !p.undone){
          var ev = await sendSharedEvent(row.id, 'paid', p.amount, p.date);
          if (ev && ev.id){ d.payments[j] = Object.assign({}, p, {sharedPending: false, sharedEvent: ev.id}); row.events = (row.events || []).concat([ev]); }
        }
      }
      var news = newsFor(row, 'debtor'), whoC = first(row.creditor_name || d.shared.from);
      news.forEach(function(e){ var t = noticeText(e, 'debtor', whoC); if (t) notices.push({text: t, title: d.name}); });
      await reconcileDebt(d, row, news);
      seen.push(row.id);
    }
  }
  renderAll();
  if (notices.length || (confirms.length && !(opts && opts.quiet))) await newsModal(notices, confirms);
  seen.forEach(function(id){ Store.sharedSeen(id).catch(function(){}); });
  return true;
}

function confirmRowHtml(c, i){
  return '<div class="shared-confirm" data-i="' + i + '"><div><strong>' + escapeHtml(first(c.r.person)) + '</strong> avisou que pagou <strong class="tabular">' + fmtMoney(c.e.amount) + '</strong>' +
    ' em ' + formatDateBr(c.e.date || todayKey()) + (c.r.description ? ' · ' + escapeHtml(c.r.description) : '') + '</div>' +
    (State.accounts.length ? '<label class="sr-only" for="scAcc' + i + '">Entrou na conta</label><select id="scAcc' + i + '" data-sc-acc>' +
      optionsHtml([{id: '', label: 'Não entrou em conta'}].concat(State.accounts.map(function(a){ return {id: a.id, label: 'Entrou na conta ' + a.name}; })), '') + '</select>' : '') +
    '<span class="sc-actions"><button type="button" class="btn btn-primary btn-sm" data-sc="ok">Confirmar recebimento</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-sc="no">Não recebi</button></span></div>';
}
async function newsModal(notices, confirms){
  await openModal({
    title: 'Novidades das cobranças compartilhadas', submitLabel: null, cancelLabel: 'Fechar',
    body: (notices.length ? '<ul class="shared-news">' + notices.map(function(n){ return '<li><span class="tx-meta">' + escapeHtml(n.title) + ':</span> ' + escapeHtml(n.text) + '</li>'; }).join('') + '</ul>' : '') +
      (confirms.length ? '<h4>Para você confirmar</h4>' + confirms.map(confirmRowHtml).join('') +
        '<p class="field-hint">Confirmar registra o recebimento aqui e avisa a outra pessoa. Dá para decidir depois: o aviso fica no cartão da cobrança.</p>' : ''),
    onOpen: function(modal){ wireConfirms(modal, confirms); }
  });
}
// Botões Confirmar / Não recebi (na janela do login e no cartão de "Me devem").
export function wireConfirms(root, confirms){
  root.addEventListener('click', async function(ev){
    var b = ev.target.closest('[data-sc]');
    if (!b) return;
    var box = b.closest('.shared-confirm'), c = confirms[Number(box.getAttribute('data-i'))];
    var acc = qs('[data-sc-acc]', box);
    box.querySelectorAll('button').forEach(function(x){ x.disabled = true; });
    var ok = await decidePaid(c.r, c.row, c.e, b.getAttribute('data-sc') === 'ok', acc ? acc.value : null);
    if (!ok){ box.querySelectorAll('button').forEach(function(x){ x.disabled = false; }); return; }
    box.innerHTML = '<span class="status-pill ' + (c.e.status === 'confirmed' ? 'good' : 'warning') + '">' +
      (c.e.status === 'confirmed' ? 'Confirmado: ' + fmtMoney(c.e.amount) + ' registrado' : 'Marcado como não recebido') + '</span>';
    renderAll();
  });
}
// Avisos pendentes de uma cobrança (para o cartão de "Me devem"); a janela abre ao clicar.
export async function openPendingFor(rId){
  var r = findById(State.receivables, rId), row = sharedRowOf(r && r.sharedId);
  var confirms = pendingPaidEvents(row).map(function(e){ return {r: r, row: row, e: e}; });
  if (confirms.length) await newsModal([], confirms);
}

// Cria ou atualiza a linha no servidor a partir do "Me devem" (quem cobra).
export async function saveSharedRow(r, pix){
  var info = Number(r.installments) > 1 ? {n: Number(r.installments), per: Number(r.installmentAmount) || money(Number(r.totalAmount) / Number(r.installments))} : null;
  var id = await Store.sharedSave(r.sharedId || null, {token: r.shareRef, creditorName: State.session.name, debtorLabel: r.person, description: r.description || '',
    total: Number(r.totalAmount), received: Number(r.receivedAmount || 0), installments: info ? info.n : null, installmentAmount: info ? info.per : null,
    dueDate: r.dueDate || null, pix: pix || ''});
  if (id && id !== r.sharedId){ r.sharedId = id; await Store.update(k(), 'receivables', r.id, {sharedId: id}); }
  return r.sharedId;
}
