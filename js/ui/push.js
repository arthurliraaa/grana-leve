/*
 * Avisos no celular (Web Push), ligados em Perfil. Só com conta online (os lembretes ficam no servidor, que os dispara) e com a chave
 * VAPID configurada (js/config.js). O app agenda os próximos dias (js/domain/reminders.js) e o servidor envia na hora (docs/avisos-push.md).
 * Nada de valores em reais nos avisos. Ligar pede permissão ao navegador (só depois de um toque); desligar apaga o aparelho e os
 * lembretes pendentes. No iPhone só funciona com o app instalado na tela inicial.
 */
import {todayKey} from '../domain/dates.js';
import {findById} from '../domain/util.js';
import {buildReminders, REMINDER_KINDS, DEFAULT_HOUR, normalizeRules, cleanCustom, customWhen, MAX_CUSTOM, MAX_LEAD, WEEKDAYS, CUSTOM_DEFAULT_TITLE} from '../domain/reminders.js';
import {uid} from '../domain/util.js';
import {VAPID_PUBLIC_KEY} from '../config.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {escapeHtml, toast, optionsHtml} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {markSynced} from './synced-prefs.js';
import {State} from './state.js';

var KIND_LABEL = {salary: 'Salário: no dia em que deveria cair', invoice: 'Fatura do cartão: um dia antes de vencer', bill: 'Conta fixa: um dia antes de vencer'};

function isIos(){ return /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isInstalled(){ return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
// As regras (tipos, antecedência, hora e avisos próprios) acompanham a pessoa entre aparelhos; só “ligado neste aparelho” é de cada aparelho.
function rules(){ var p = getPrefs(); return normalizeRules(p.reminderRules, (p.push || {}).kinds); }
function saveRules(r){ setPref('reminderRules', r); markSynced('reminderRules'); }
function prefs(){ var p = getPrefs().push || {}; return {on: !!p.on, kinds: rules().kinds}; }
function savePrefs(p){ setPref('push', {on: !!p.on, kinds: p.kinds}); }

// Por que não dá (ou null se dá): texto para a pessoa.
export function pushBlocker(){
  if (!VAPID_PUBLIC_KEY) return 'Os avisos ainda não foram ligados neste app.';
  if (Store.mode !== 'supabase') return 'Os avisos precisam de uma conta online (os lembretes ficam no servidor).';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !isInstalled()
    ? 'No iPhone, instale o app antes: toque em Compartilhar e em “Adicionar à Tela de Início”, e abra por lá.' : 'Este navegador não oferece avisos no celular.';
  if (isIos() && !isInstalled()) return 'No iPhone, instale o app antes: toque em Compartilhar e em “Adicionar à Tela de Início”, e abra por lá.';
  return null;
}

function b64ToBytes(b64){
  var pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, function(c){ return c.charCodeAt(0); });
}
async function registration(){ return navigator.serviceWorker.ready; }

var LEAD_LABEL = function(n){ return n === 0 ? 'no dia' : n === 1 ? '1 dia antes' : n + ' dias antes'; };
function leadOptions(sel){ var o = []; for (var i = 0; i <= MAX_LEAD; i++) o.push({id: String(i), label: LEAD_LABEL(i)}); return optionsHtml(o, String(sel)); }
function hourOptions(sel){ var o = []; for (var h = 5; h <= 23; h++) o.push({id: String(h), label: h + 'h'}); return optionsHtml(o, String(sel)); }

// Texto e botões do cartão em Perfil (profile.js os coloca e repassa os cliques para pushAction).
export function pushCardHtml(){
  var block = pushBlocker(), p = prefs(), r = rules(), perm = block || !('Notification' in window) ? '' : Notification.permission;
  var denied = perm === 'denied';
  var kinds = REMINDER_KINDS.map(function(k){
    return '<div class="rem-row"><label class="check"><input type="checkbox" data-push-kind="' + k + '"' + (r.kinds[k] ? ' checked' : '') + '> ' + escapeHtml(KIND_LABEL[k]) + '</label>' +
      '<label class="rem-lead"><span class="sr-only">Quando avisar: ' + escapeHtml(KIND_LABEL[k]) + '</span><select data-push-lead="' + k + '"' + (r.kinds[k] ? '' : ' disabled') + '>' + leadOptions(r.lead[k]) + '</select></label></div>';
  }).join('');
  var mine = r.custom.length ? '<ul class="rem-list">' + r.custom.map(function(c){
    return '<li class="rem-item"><label class="check"><input type="checkbox" data-rem-toggle="' + escapeHtml(c.id) + '"' + (c.enabled ? ' checked' : '') + '><span><strong>' + escapeHtml(c.title || CUSTOM_DEFAULT_TITLE[c.type]) + '</strong><small>' + escapeHtml(customWhen(c)) + '</small></span></label>' +
      '<span class="rem-actions"><button type="button" class="btn btn-ghost btn-sm" data-rem-edit="' + escapeHtml(c.id) + '">Editar</button><button type="button" class="btn btn-ghost btn-sm" data-rem-del="' + escapeHtml(c.id) + '">Excluir</button></span></li>';
  }).join('') + '</ul>' : '<p class="field-hint">Você ainda não criou nenhum aviso. Dá para avisar, por exemplo, “lançar os gastos” todo dia 5 ou “importar o extrato” toda segunda-feira.</p>';
  return (block ? '<p class="card-sub">' + escapeHtml(block) + ' Mesmo assim, já dá para deixar os seus avisos programados: eles passam a valer quando os avisos forem ligados.</p>'
    : '<p class="card-sub">Receba um aviso no celular quando o salário deveria cair, antes de vencer a fatura do cartão ou uma conta fixa, e nos dias que você programar. ' +
      'Você escolhe o que avisar, com quantos dias de antecedência e a que horas. Os avisos não mostram valores. Você pode desligar quando quiser.</p>') +
    (denied ? '<p class="form-error" role="note">Os avisos estão bloqueados no navegador. Libere nas configurações do site para ligar.</p>' : '') +
    '<h4 class="rem-h">O que avisar</h4><div class="field-list rem-kinds">' + kinds + '</div>' +
    '<div class="rem-row"><label for="pfRemHour">Horário dos avisos</label><select id="pfRemHour" data-push-hour>' + hourOptions(r.hour) + '</select></div>' +
    '<h4 class="rem-h">Meus avisos</h4>' + mine +
    '<div class="card-actions"><button type="button" class="btn btn-soft btn-sm" data-rem-add' + (r.custom.length >= MAX_CUSTOM ? ' disabled' : '') + '>+ Programar um aviso</button></div>' +
    (block ? '' : '<div class="card-actions">' + (p.on
      ? '<button type="button" class="btn btn-ghost" id="pfPushOff">Desligar os avisos</button>'
      : '<button type="button" class="btn btn-primary" id="pfPushOn"' + (denied ? ' disabled' : '') + '>Ligar os avisos neste aparelho</button>') + '</div>' +
    '<p class="tx-meta">Para isso o Grana Leve guarda o endereço de avisos deste aparelho e os próximos lembretes, só na sua conta. O texto de um aviso seu também vai para o servidor: não coloque valores nem dados sensíveis nele. Os seus avisos programados acompanham a sua conta entre aparelhos.</p>');
}

function reminderRows(){
  var p = prefs(), today = todayKey();
  var r = rules();
  var list = buildReminders({today: today, horizon: 10, kinds: p.kinds, lead: r.lead, hour: r.hour, custom: r.custom, forecasts: State.forecasts, cards: State.cards, transactions: State.transactions, bills: State.bills,
    paidOk: function(b, paid){ return !!findById(State.transactions, paid.txId); }});
  return list.map(function(r){
    var d = r.date.split('-');
    return {dedupe_key: r.key, kind: r.kind, fire_at: new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]), r.hour || DEFAULT_HOUR, 0, 0).toISOString(), title: r.title, body: r.body, url: r.url};
  });
}
// Agenda os próximos lembretes no servidor (e apaga os que não valem mais).
export async function syncReminders(){
  if (pushBlocker() || !prefs().on || Notification.permission !== 'granted') return;
  try { await Store.pushSyncReminders(reminderRows()); } catch(e){ /* sem internet agora: tenta de novo na próxima abertura */ }
}

async function subscribe(){
  var reg = await registration(), sub = await reg.pushManager.getSubscription(), key = b64ToBytes(VAPID_PUBLIC_KEY);
  // Se a chave VAPID do app mudou, o aparelho precisa se inscrever de novo com a nova.
  if (sub && sub.options && sub.options.applicationServerKey){
    var have = new Uint8Array(sub.options.applicationServerKey);
    if (have.length !== key.length || have.some(function(b, i){ return b !== key[i]; })){ await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key});
  await Store.pushSaveSubscription(sub.toJSON());
  return sub;
}
export async function enablePush(){
  var block = pushBlocker();
  if (block){ toast(block); return false; }
  var perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted'){ toast('Sem a permissão do navegador não dá para ligar os avisos.'); return false; }
  try { await subscribe(); }
  catch(e){ toast('Não foi possível ligar os avisos agora. Verifique a internet e tente de novo.'); return false; }
  savePrefs({on: true, kinds: prefs().kinds});
  await syncReminders();
  toast('Avisos ligados neste aparelho.');
  return true;
}
// quiet: sem aviso na tela. keepPref: ao sair da conta o aparelho deixa de receber, mas a escolha fica (volta a valer quando a pessoa entrar de novo).
export async function disablePush(quiet, keepPref){
  try {
    var reg = await registration(), sub = await reg.pushManager.getSubscription();
    if (sub){ var endpoint = sub.endpoint; await sub.unsubscribe(); await Store.pushRemoveSubscription(endpoint); }
    await Store.pushSyncReminders([]);
  } catch(e){ /* melhor esforço: o servidor também apaga aparelhos que deixam de responder */ }
  if (!keepPref) savePrefs({on: false, kinds: prefs().kinds});
  if (!quiet) toast('Avisos desligados.');
}
// Ao abrir o app: se estavam ligados, garante o aparelho cadastrado (o navegador pode ter trocado o endereço) e agenda os próximos dias.
export async function maybeSyncPush(){
  lastSync = Date.now();
  if (pushBlocker() || !prefs().on || Notification.permission !== 'granted') return;
  try { await subscribe(); } catch(e){ return; }
  await syncReminders();
}
// Ao sair da conta: o aparelho deixa de receber os avisos dela.
export function pushActive(){ return !pushBlocker() && prefs().on; }

// Programar (ou editar) um aviso próprio.
async function editCustom(c){
  var isNew = !c; c = c || {id: uid(), type: 'expense', repeat: 'monthly', day: 5, weekday: 1, hour: DEFAULT_HOUR, enabled: true, title: ''};
  var today = todayKey();
  var res = await openModal({
    title: isNew ? 'Programar um aviso' : 'Editar o aviso', submitLabel: 'Salvar aviso',
    body: '<div class="field"><label for="rmType">O que avisar</label><select id="rmType" name="type">' + optionsHtml([{id: 'expense', label: 'Lançar os gastos'}, {id: 'statement', label: 'Importar o extrato do banco'}, {id: 'custom', label: 'Um lembrete com o meu texto'}], c.type) + '</select></div>' +
      '<div class="field"><label for="rmTitle">Texto do aviso <span class="opt" id="rmTitleOpt">(opcional)</span></label><input id="rmTitle" name="title" type="text" maxlength="60" autocomplete="off" value="' + escapeHtml(c.title || '') + '" placeholder="Ex: Anotar os gastos da semana">' +
        '<span class="field-hint">Este texto vai para o servidor para o aviso chegar: não coloque valores nem dados sensíveis.</span></div>' +
      '<div class="field"><label for="rmRepeat">Quando repetir</label><select id="rmRepeat" name="repeat">' + optionsHtml([{id: 'monthly', label: 'Todo mês, em um dia'}, {id: 'weekly', label: 'Toda semana, em um dia da semana'}, {id: 'once', label: 'Uma vez só, em uma data'}], c.repeat) + '</select></div>' +
      '<div class="field" data-rm="monthly"><label for="rmDay">Dia do mês (1 a 31)</label><input id="rmDay" name="day" type="number" min="1" max="31" step="1" value="' + (c.day || 5) + '"><span class="field-hint">Em meses mais curtos o aviso vem no último dia.</span></div>' +
      '<div class="field" data-rm="weekly"><label for="rmWeekday">Dia da semana</label><select id="rmWeekday" name="weekday">' + optionsHtml(WEEKDAYS.map(function(n, i){ return {id: String(i), label: n}; }), String(c.weekday === undefined ? 1 : c.weekday)) + '</select></div>' +
      '<div class="field" data-rm="once"><label for="rmDate">Data</label><input id="rmDate" name="date" type="date" min="' + today + '" max="3000-12-31" value="' + escapeHtml(c.date || today) + '"></div>' +
      '<div class="field"><label for="rmHour">Horário</label><select id="rmHour" name="hour">' + hourOptions(c.hour) + '</select></div>',
    onOpen: function(modal){
      var form = modal.querySelector('form'), repeat = form.elements.repeat, type = form.elements.type;
      function sync(){
        modal.querySelectorAll('[data-rm]').forEach(function(el){ el.hidden = el.getAttribute('data-rm') !== repeat.value; });
        modal.querySelector('#rmTitleOpt').textContent = type.value === 'custom' ? '(obrigatório)' : '(opcional)';
      }
      repeat.addEventListener('change', sync); type.addEventListener('change', sync); sync();
    },
    onSubmit: function(form){
      var next = cleanCustom({id: c.id, type: form.type.value, title: form.title.value, repeat: form.repeat.value, day: form.day.value, weekday: form.weekday.value, date: form.date.value, hour: form.hour.value, enabled: c.enabled});
      if (!next) return {error: form.type.value === 'custom' && !form.title.value.trim() ? 'Escreva o texto do aviso.' : 'Confira a data e o horário do aviso.'};
      if (next.repeat === 'once' && next.date < today) return {error: 'Escolha uma data de hoje em diante.'};
      return next;
    }
  });
  if (!res || res === true) return false;
  var r = rules(), idx = r.custom.map(function(x){ return x.id; }).indexOf(res.id);
  if (idx >= 0) r.custom[idx] = res; else r.custom.push(res);
  saveRules(r);
  await syncReminders();
  toast(isNew ? 'Aviso programado.' : 'Aviso atualizado.');
  return true;
}

// Cliques e escolhas do cartão em Perfil. Devolve true se tratou (profile.js redesenha o cartão depois).
export async function pushAction(target){
  var g = function(a){ return target.getAttribute && target.getAttribute(a); };
  var kind = g('data-push-kind');
  if (kind){
    var r0 = rules(); r0.kinds[kind] = target.checked; saveRules(r0);
    savePrefs({on: prefs().on, kinds: r0.kinds});
    await syncReminders();
    return true;
  }
  var lead = g('data-push-lead');
  if (lead){ var r1 = rules(); r1.lead[lead] = Number(target.value); saveRules(r1); await syncReminders(); return true; }
  if (g('data-push-hour') !== null && g('data-push-hour') !== undefined){ var r2 = rules(); r2.hour = Number(target.value); saveRules(r2); await syncReminders(); return true; }
  var tog = g('data-rem-toggle');
  if (tog){ var r3 = rules(); r3.custom.forEach(function(c){ if (c.id === tog) c.enabled = target.checked; }); saveRules(r3); await syncReminders(); return true; }
  var btn = target.closest && target.closest('button');
  if (btn && btn.hasAttribute('data-rem-add')){ await editCustom(null); return true; }
  if (btn && btn.getAttribute('data-rem-edit')){ var cur = rules().custom.filter(function(c){ return c.id === btn.getAttribute('data-rem-edit'); })[0]; if (cur) await editCustom(cur); return true; }
  if (btn && btn.getAttribute('data-rem-del')){
    var delId = btn.getAttribute('data-rem-del'), r4 = rules(), item = r4.custom.filter(function(c){ return c.id === delId; })[0];
    if (item && await confirmAction({title: 'Excluir este aviso?', message: 'O aviso “' + (item.title || CUSTOM_DEFAULT_TITLE[item.type]) + '” (' + customWhen(item) + ') deixa de existir.', confirmLabel: 'Excluir'})){
      r4.custom = r4.custom.filter(function(c){ return c.id !== delId; }); saveRules(r4); await syncReminders(); toast('Aviso excluído.');
    }
    return true;
  }
  var id = btn && btn.id;
  if (id === 'pfPushOn'){ await enablePush(); return true; }
  if (id === 'pfPushOff'){ await disablePush(false); return true; }
  return false;
}

// Quem deixa o app aberto ou volta a ele depois de um tempo: reagenda os lembretes (uma conta paga, por exemplo, tira o aviso dela).
var lastSync = 0;
export function wirePushResync(){
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible' || !State.session || Date.now() - lastSync < 20 * 60000) return;
    lastSync = Date.now();
    maybeSyncPush();
  });
}
