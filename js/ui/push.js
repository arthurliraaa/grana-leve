/*
 * Avisos no celular (Web Push), ligados em Perfil. Só com conta online (os lembretes ficam no servidor, que os dispara) e com a chave
 * VAPID configurada (js/config.js). O app agenda os próximos dias (js/domain/reminders.js) e o servidor envia na hora (docs/avisos-push.md).
 * Nada de valores em reais nos avisos. Ligar pede permissão ao navegador (só depois de um toque); desligar apaga o aparelho e os
 * lembretes pendentes. No iPhone só funciona com o app instalado na tela inicial.
 */
import {todayKey} from '../domain/dates.js';
import {findById} from '../domain/util.js';
import {buildReminders, REMINDER_KINDS, DEFAULT_HOUR} from '../domain/reminders.js';
import {VAPID_PUBLIC_KEY} from '../config.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {escapeHtml, toast} from './dom.js';
import {State} from './state.js';

var KIND_LABEL = {salary: 'Salário: no dia em que deveria cair', invoice: 'Fatura do cartão: um dia antes de vencer', bill: 'Conta fixa: um dia antes de vencer'};

function isIos(){ return /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isInstalled(){ return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function prefs(){ var p = getPrefs().push || {}; return {on: !!p.on, kinds: Object.assign({salary: true, invoice: true, bill: true}, p.kinds || {})}; }
function savePrefs(p){ setPref('push', p); }

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

// Texto e botões do cartão em Perfil (profile.js os coloca e repassa os cliques para pushAction).
export function pushCardHtml(){
  var block = pushBlocker(), p = prefs(), perm = block ? '' : Notification.permission;
  if (block) return '<p class="card-sub">' + escapeHtml(block) + '</p>';
  var denied = perm === 'denied';
  var kinds = REMINDER_KINDS.map(function(k){
    return '<label class="check"><input type="checkbox" data-push-kind="' + k + '"' + (p.kinds[k] ? ' checked' : '') + (p.on ? '' : ' disabled') + '> ' + escapeHtml(KIND_LABEL[k]) + '</label>';
  }).join('');
  return '<p class="card-sub">Receba um aviso no celular quando o salário deveria cair e um dia antes de vencer a fatura do cartão ou uma conta fixa. ' +
    'Os avisos não mostram valores. Você pode desligar quando quiser.</p>' +
    (denied ? '<p class="form-error" role="note">Os avisos estão bloqueados no navegador. Libere nas configurações do site para ligar.</p>' : '') +
    '<div class="field-list">' + kinds + '</div>' +
    '<div class="card-actions">' + (p.on
      ? '<button type="button" class="btn btn-ghost" id="pfPushOff">Desligar os avisos</button>'
      : '<button type="button" class="btn btn-primary" id="pfPushOn"' + (denied ? ' disabled' : '') + '>Ligar os avisos neste aparelho</button>') + '</div>' +
    '<p class="tx-meta">Para isso o Grana Leve guarda o endereço de avisos deste aparelho e os próximos lembretes (sem valores), só na sua conta.</p>';
}

function reminderRows(){
  var p = prefs(), today = todayKey();
  var list = buildReminders({today: today, horizon: 10, kinds: p.kinds, forecasts: State.forecasts, cards: State.cards, transactions: State.transactions, bills: State.bills,
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

// Cliques e escolhas do cartão em Perfil. Devolve true se tratou (profile.js redesenha o cartão depois).
export async function pushAction(target){
  var kind = target.getAttribute && target.getAttribute('data-push-kind');
  if (kind){
    var p = prefs(); p.kinds[kind] = target.checked; savePrefs(p);
    await syncReminders();
    return true;
  }
  var id = target.closest && target.closest('button') && target.closest('button').id;
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
