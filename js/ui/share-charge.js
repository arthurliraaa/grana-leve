/*
 * Compartilhar uma cobrança ("Me devem") com quem deve: um link ou um arquivo que a pessoa abre no
 * Grana Leve dela e aceita. Ao aceitar, vira uma dívida em "Eu devo" (com quem cobrou, o valor, o que
 * já foi pago, as parcelas e a chave Pix). Os dados vão no próprio link, depois do # (não passam pelo
 * servidor); cada cobrança tem uma referência (shareRef): reenviar o link atualiza a mesma dívida
 * em vez de criar outra.
 * Com conta online, a cobrança também é criada no servidor (shared_charges) e o link leva o id (sid):
 * ao aceitar, as duas contas passam a acompanhar juntas (veja shared-sync.js). Sem servidor, o link
 * funciona do mesmo jeito, só sem o acompanhamento automático.
 */
import {whatsappNumber} from '../domain/contact.js';
import {todayKey, formatDateFull, validDateStr} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {recvInstallInfo} from '../domain/receivables.js';
import {DEFAULT_URGENCY} from '../domain/urgency.js';
import {Store} from '../data/store.js';
import {qs, escapeHtml, saveFile, toast} from './dom.js';
import {openModal} from './modal.js';
import {siteUrl} from './online.js';
import {renderAll} from './shell.js';
import {State, k} from './state.js';
import {saveSharedRow, sharedOnline, syncShared} from './shared-sync.js';

var TYPE = 'granaleve-cobranca', PENDING = 'granaleve_cobranca_pendente', ROUTE = '#/cobranca/';

function b64urlEncode(obj){
  var bytes = new TextEncoder().encode(JSON.stringify(obj)), bin = '';
  bytes.forEach(function(b){ bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s){
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var bin = atob(s), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

// O que vai no link/arquivo. Só o necessário para a outra pessoa anotar a dívida.
export function chargePayload(r, pix){
  var info = recvInstallInfo(r);
  var p = {t: TYPE, v: 1, ref: r.shareRef, from: State.session ? State.session.name : '', person: r.person,
    desc: r.description || '', total: money(r.totalAmount), received: money(r.receivedAmount || 0), at: todayKey()};
  if (info){ p.n = info.n; p.per = info.per; }
  if (r.dueDate) p.due = r.dueDate;
  if (pix) p.pix = pix;
  return p;
}
export function chargeLink(payload){ return siteUrl() + ROUTE + b64urlEncode(payload); }
// Segredo do link (quem tem o link pode aceitar a cobrança): 128 bits aleatórios.
function secureToken(){
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
}
// Prepara o compartilhamento: referência secreta e, com conta online, a cobrança no servidor.
// Devolve o conteúdo do link ({..., sid} quando ficou no servidor).
export async function sharePayloadFor(r, pix){
  if (!r.shareRef || r.shareRef.length < 24){
    r.shareRef = secureToken();
    await Store.update(k(), 'receivables', r.id, {shareRef: r.shareRef});
  }
  var payload = chargePayload(r, pix);
  if (sharedOnline()){
    try { payload.sid = await saveSharedRow(r, pix); }
    catch(e){ payload.offlineReason = e.userMessage || 'sem conexão'; }
  }
  return payload;
}

// Dados que chegam de fora: só aceita o formato esperado, com textos curtos e valores válidos.
function str(v, max){ return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
export function parsePayload(raw){
  var p = typeof raw === 'string' ? (function(){ try { return JSON.parse(raw); } catch(e){ return null; } })() : raw;
  if (!p || p.t !== TYPE || p.v !== 1) return null;
  var total = money(p.total), received = money(p.received);
  if (!(total > 0) || total > 99999999 || !(received >= 0) || received > total) return null;
  var out = {ref: str(p.ref, 40), from: str(p.from, 60) || 'Alguém', person: str(p.person, 60), desc: str(p.desc, 80),
    total: total, received: received, at: validDateStr(p.at) ? p.at : todayKey()};
  if (!out.ref) return null;
  var n = Math.round(Number(p.n)), per = money(p.per);
  if (n >= 2 && n <= 120 && per > 0){ out.n = n; out.per = per; }
  if (p.due && validDateStr(p.due)) out.due = p.due;
  if (p.pix) out.pix = str(p.pix, 77);
  if (typeof p.sid === 'string' && /^[0-9a-f-]{36}$/i.test(p.sid)) out.sid = p.sid;
  return out;
}

// Ao abrir o app por um link de cobrança: guarda até a pessoa estar dentro da conta e limpa o endereço.
export function capturePendingCharge(){
  if (location.hash.indexOf(ROUTE) !== 0) return;
  var raw = null, data = null;
  try { raw = b64urlDecode(location.hash.slice(ROUTE.length)); data = parsePayload(raw); } catch(e){ data = null; }
  history.replaceState(null, '', siteUrl() + '#/compromissos/dividas');
  if (!data){ setTimeout(function(){ toast('Esse link de cobrança está incompleto ou foi alterado.'); }, 800); return; }
  // Guarda como veio (é conferido de novo ao usar). Sem armazenamento, só o link se perde.
  try { sessionStorage.setItem(PENDING, JSON.stringify(raw)); } catch(e){ /* sem armazenamento */ }
  setTimeout(function(){ if (!State.session) toast('Te enviaram uma cobrança. Entre na sua conta (ou crie uma) para ver e aceitar.'); }, 1200);
}
// Depois de entrar no app: mostra a cobrança guardada, se houver. Retorna true se mostrou.
export async function acceptPendingCharge(){
  var raw = null;
  try { raw = sessionStorage.getItem(PENDING); sessionStorage.removeItem(PENDING); } catch(e){ raw = null; }
  var data = raw && parsePayload(raw);
  if (!data) return false;
  await acceptCharge(data);
  return true;
}
// Arquivo .json recebido (Eu devo → "Importar cobrança").
export async function importChargeFile(file){
  var text = await file.text().catch(function(){ return ''; });
  var data = parsePayload(text);
  if (!data){ toast('Esse arquivo não é uma cobrança do Grana Leve.'); return; }
  await acceptCharge(data);
}

function summaryHtml(d){
  var left = money(d.total - d.received);
  return '<dl class="share-sum">' +
    '<dt>Quem cobra</dt><dd>' + escapeHtml(d.from) + '</dd>' +
    (d.desc ? '<dt>Do quê</dt><dd>' + escapeHtml(d.desc) + '</dd>' : '') +
    '<dt>Total</dt><dd class="tabular">' + fmtMoney(d.total) + (d.n ? ' em ' + d.n + 'x de ' + fmtMoney(d.per) : '') + '</dd>' +
    '<dt>Já pago</dt><dd class="tabular">' + fmtMoney(d.received) + '</dd>' +
    '<dt>Falta</dt><dd class="tabular"><strong>' + fmtMoney(left) + '</strong></dd>' +
    (d.due ? '<dt>' + (d.n ? '1ª parcela' : 'Combinado para') + '</dt><dd>' + formatDateFull(d.due) + '</dd>' : '') +
    (d.pix ? '<dt>Chave Pix</dt><dd>' + escapeHtml(d.pix) + '</dd>' : '') +
    '</dl>';
}
// Aceitar: cria a dívida em "Eu devo" ou, se já aceitou essa mesma cobrança antes, atualiza.
// Com o id do servidor (sid) e conta online, liga as duas contas: daí em diante os valores vêm do
// servidor e os pagamentos viram avisos para quem cobra confirmar.
export async function acceptCharge(d){
  var existing = State.debts.filter(function(x){ return x.shared && (x.shared.ref === d.ref || (d.sid && x.shared.sid === d.sid)); })[0];
  var synced = !!(d.sid && sharedOnline());
  var ok = await openModal({
    title: existing ? 'Atualizar cobrança de ' + d.from + '?' : d.from + ' te enviou uma cobrança',
    body: summaryHtml(d) +
      '<p class="field-hint">' + (existing ? 'Você já aceitou esta cobrança. Atualizar troca o total, as parcelas e o que já foi pago pelo que ' + escapeHtml(d.from) +
        ' enviou agora (o que você registrou de pagamento continua no histórico).' :
        'Aceitando, ela entra em “Eu devo” para você acompanhar quanto falta e registrar cada pagamento.') +
        (synced ? ' <strong>Vocês vão acompanhar juntos:</strong> quando você registrar um pagamento, ' + escapeHtml(d.from.split(' ')[0]) +
          ' recebe o aviso para confirmar; quando ' + escapeHtml(d.from.split(' ')[0]) + ' registrar um recebimento, aparece aqui no seu próximo login.' :
          d.sid ? ' Para acompanhar junto automaticamente, use uma conta online do Grana Leve.' : ' Nada muda na conta de quem enviou.') + '</p>',
    submitLabel: existing ? 'Atualizar dívida' : 'Aceitar e adicionar em “Eu devo”', cancelLabel: 'Agora não'
  });
  if (!ok) return;
  var row = null;
  if (synced){
    try { row = await Store.sharedAccept(d.sid, d.ref); }
    catch(e){
      if (/é sua|outra conta/.test(e.userMessage || '')){ toast(e.userMessage); return; }
      toast('Não deu para ligar as contas agora (' + (e.userMessage || 'sem conexão') + '). A dívida foi salva só aqui.');
    }
  }
  if (row){
    d = Object.assign({}, d, {from: row.creditor_name || d.from, desc: row.description || d.desc, total: Number(row.total), received: Number(row.received),
      n: row.installments || undefined, per: row.installment_amount ? Number(row.installment_amount) : undefined, due: row.due_date || d.due, pix: row.pix || d.pix});
  }
  var shared = {ref: d.ref, from: d.from, at: d.at};
  if (row) shared.sid = row.id;
  if (d.pix) shared.pix = d.pix;
  if (d.due) shared.due = d.due;
  var fields = {name: d.desc || 'Combinado com ' + d.from, creditor: d.from, totalAmount: d.total,
    paidAmount: row ? d.received : existing ? Math.max(d.received, Math.min(d.total, Number(existing.paidAmount || 0))) : d.received,
    monthlyPayment: d.n ? d.per : 0, shared: shared};
  if (existing){
    await Store.update(k(), 'debts', existing.id, fields);
    Object.assign(existing, fields);
  } else {
    var saved = await Store.add(k(), 'debts', Object.assign({kind: 'pessoal', urgency: DEFAULT_URGENCY, createdAt: Date.now()}, fields));
    State.debts.push(saved);
  }
  renderAll();
  toast(existing ? 'Dívida atualizada com o que ' + d.from + ' enviou.' : row ? 'Cobrança aceita: está em “Eu devo”, acompanhando junto com ' + d.from.split(' ')[0] + '.' : 'Cobrança aceita: está em “Eu devo”.');
  if (row) syncShared({quiet: true});
}

// Compartilhar a partir de "Me devem": link (copiar ou WhatsApp) e arquivo.
export async function shareReceivable(r, pix){
  var payload = await sharePayloadFor(r, pix), link = chargeLink(payload);
  if (payload.sid) renderAll();   // o cartão passa a mostrar "esperando aceitar"
  var who = escapeHtml(r.person.split(' ')[0]);
  await openModal({
    title: 'Compartilhar com ' + r.person,
    body: '<p>Se ' + who + ' usa o Grana Leve, pode adicionar esta cobrança na conta e acompanhar quanto falta em “Eu devo”.</p>' +
      summaryHtml(parsePayload(payload)) +
      '<div class="field"><label for="shareLink">Link da cobrança</label><input id="shareLink" type="text" readonly value="' + escapeHtml(link) + '"></div>' +
      (payload.sid ? '<p class="tip-box">' + (r.sharedWith ? who + ' já aceitou: vocês acompanham juntos. ' : '') + 'Quando ' + who + ' aceitar, os pagamentos que ' + who +
          ' registrar chegam aqui para você confirmar, e os recebimentos que você registrar aparecem para ' + who + ' no próximo login.</p>' :
        '<p class="field-hint">' + (payload.offlineReason ? 'Não deu para ligar ao servidor agora (' + escapeHtml(payload.offlineReason) + '): o link funciona, mas sem acompanhamento automático. ' : '') +
          'Quando ' + who + ' pagar uma parte, registre aqui e envie de novo: a dívida é atualizada, não duplicada.</p>') +
      '<p class="field-hint">Quem tiver o link vê o nome, o valor e a chave Pix, e pode aceitar a cobrança. Envie só para ' + who + '.</p>' +
      '<div class="pdf-actions share-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-share="copy">Copiar link</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-share="file">Baixar arquivo</button></div>',
    submitLabel: 'Enviar pelo WhatsApp', cancelLabel: 'Fechar',
    onOpen: function(root){
      qs('[data-share="copy"]', root).addEventListener('click', function(){
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(function(){ toast('Link copiado.'); }, function(){ toast('Não foi possível copiar.'); });
      });
      qs('[data-share="file"]', root).addEventListener('click', function(){
        var name = 'cobranca-' + r.person.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') + '.json';
        saveFile(name, new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}), 'application/json').then(function(){ toast('Arquivo baixado. Envie para ' + r.person.split(' ')[0] + ' importar em “Eu devo”.'); });
      });
    },
    onSubmit: function(){
      var phone = whatsappNumber(r.phone) || '';   // sem número válido, o WhatsApp pede o contato
      var msg = 'Oi, ' + r.person.split(' ')[0] + '! Anotei no Grana Leve o que ficou combinado entre a gente. Se quiser acompanhar na sua conta, é só abrir: ' + link;
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      return true;
    }
  });
}
