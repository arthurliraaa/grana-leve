/*
 * Novidades do app: na primeira abertura depois de uma atualização, quem já usa o app vê o que mudou (uma vez só). Quem acaba de
 * criar a conta não vê (para essa pessoa tudo é novo; o tutorial cuida dela). O que mostrar está em domain/changelog.js. A escolha
 * “já vi” fica nas preferências da conta neste aparelho (whatsNewSeen). Em Perfil dá para rever. localStorage granaleve_whatsnew = 'off' desliga (testes).
 */
import {CHANGELOG, latestId, unseenReleases} from '../domain/changelog.js';
import {formatDateFull} from '../domain/dates.js';
import {getPrefs, setPref} from '../data/session.js';
import {escapeHtml} from './dom.js';
import {openModal} from './modal.js';
import {State} from './state.js';
import {showTab} from './shell.js';

var OFF_KEY = 'granaleve_whatsnew';
function isOff(){ try { return localStorage.getItem(OFF_KEY) === 'off'; } catch(e){ return false; } }
function hasData(){ return !!(State.transactions.length || State.accounts.length || State.cards.length || State.goals.length || State.bills.length || State.forecasts.length || State.debts.length); }

// Cartão de novidades no Início: a última novidade, até a pessoa fechar. Conta nova e vazia não vê (para ela tudo é novo).
export function newsCardRelease(){
  var latest = latestId(CHANGELOG), prefs = getPrefs();
  if (!latest || prefs.whatsNewCard === latest) return null;
  if (!prefs.whatsNewCard && !prefs.whatsNewSeen && !hasData()) return null;
  return CHANGELOG[0];
}
export function dismissNewsCard(){ setPref('whatsNewCard', latestId(CHANGELOG)); }

function releaseHtml(r){
  return '<section class="wn-rel"><h4>' + escapeHtml(r.title) + ' <small class="tx-meta">' + formatDateFull(r.id) + '</small></h4><ul class="wn-list">' +
    r.items.map(function(it){
      return '<li><strong>' + escapeHtml(it.title) + '</strong><p>' + escapeHtml(it.text) + '</p>' +
        (it.go ? '<button type="button" class="btn btn-ghost btn-sm" data-wn-go="' + escapeHtml(it.go) + '">Ver</button>' : '') + '</li>';
    }).join('') + '</ul></section>';
}
async function show(list){
  var r = await openModal({
    title: 'Novidades do Grana Leve', submitLabel: 'Entendi', cancelLabel: '', body: '<div class="wn-body">' + list.map(releaseHtml).join('') + '</div>',
    onOpen: function(modal, close){
      modal.addEventListener('click', function(e){ var b = e.target.closest('[data-wn-go]'); if (b) close({go: b.getAttribute('data-wn-go')}); });
    },
    onSubmit: function(){ return true; }
  });
  dismissNewsCard();   // quem leu aqui não precisa do cartão no Início
  if (r && r.go) showTab(r.go);
}
// Espera a janela livre (tutorial, “já caiu?”, avisos do planejamento vêm antes) e mostra.
function whenFree(run, tries){
  var root = document.getElementById('modalRoot');
  if ((root && !root.hidden) || document.querySelector('.tut-root')){
    if ((tries || 0) < 30) setTimeout(function(){ whenFree(run, (tries || 0) + 1); }, 700);
    return;
  }
  run();
}

// Ao abrir o app (depois dos dados carregados).
export function maybeWhatsNew(){
  var latest = latestId(CHANGELOG);
  if (!latest || isOff()) return;
  var seen = getPrefs().whatsNewSeen;
  if (!seen && !hasData()){ setPref('whatsNewSeen', latest); setPref('whatsNewCard', latest); return; }   // conta nova: nada a “atualizar”
  var list = unseenReleases(CHANGELOG, seen || '', 3);
  if (!list.length) return;
  setPref('whatsNewSeen', latest);   // marca já: aparece uma vez só, mesmo se a janela for fechada sem tocar em nada
  setTimeout(function(){ whenFree(function(){ show(list); }); }, 1500);
}
// Em Perfil: rever as últimas novidades.
export function openWhatsNew(){ show(CHANGELOG.slice(0, 3)); }
