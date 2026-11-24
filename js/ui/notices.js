/*
 * Central de avisos (o sininho no topo): os próximos avisos (calculados aqui, com as regras de Perfil), os que já chegaram (o servidor
 * guarda os enviados por 30 dias, inclusive os de salário) e as novidades do app (domain/changelog.js), para ver por lá quando o app for
 * atualizado. Tocar num aviso leva para a tela dele. O número no sino conta os avisos que chegaram e as novidades que a pessoa ainda
 * não viu, desde a última vez que abriu a central neste aparelho.
 */
import {todayKey} from '../domain/dates.js';
import {whenLabel, sentHistory, unseenCount} from '../domain/reminders.js';
import {CHANGELOG, latestId, unseenReleases} from '../domain/changelog.js';
import {formatDateFull} from '../domain/dates.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {escapeHtml, icon} from './dom.js';
import {openModal} from './modal.js';
import {upcomingReminders, pushIsOn} from './push.js';
import {State} from './state.js';
import {showTab} from './shell.js';

var KIND_LABEL = {salary: 'Salário', invoice: 'Fatura', bill: 'Conta fixa', custom: 'Lembrete', statement: 'Extrato'};
var history = [];

// Novidades do app que a pessoa ainda não viu. Quem já viu o aviso de novidades (popup) não é avisado de novo; conta nova e vazia não tem o que “atualizar”.
function newsSeen(){
  var p = getPrefs();
  if (p.noticesNewsSeen) return p.noticesNewsSeen;
  if (p.whatsNewSeen) return p.whatsNewSeen;
  return State.transactions.length || State.accounts.length || State.cards.length || State.goals.length || State.forecasts.length ? '' : latestId(CHANGELOG);
}
function unseenNews(){ return unseenReleases(CHANGELOG, newsSeen(), 99); }
function releaseHtml(r, open){
  return '<details class="notice-rel"' + (open ? ' open' : '') + '><summary><strong>' + escapeHtml(r.title) + '</strong><small>' + escapeHtml(formatDateFull(r.id)) + '</small></summary><ul class="wn-list">' +
    r.items.map(function(it){
      return '<li><strong>' + escapeHtml(it.title) + '</strong><p>' + escapeHtml(it.text) + '</p>' + (it.go ? '<button type="button" class="btn btn-ghost btn-sm" data-notice-screen="' + escapeHtml(it.go) + '">Ver</button>' : '') + '</li>';
    }).join('') + '</ul></details>';
}

export function noticesBtnHtml(){
  return '<button type="button" class="icon-btn bell-btn" id="noticesBtn" aria-label="Avisos" title="Avisos">' + icon('bell') + '<span class="bell-badge" id="noticesBadge" hidden></span></button>';
}
function paintBadge(){
  var badge = document.getElementById('noticesBadge'), btn = document.getElementById('noticesBtn');
  if (!badge) return;
  var n = unseenCount(history, getPrefs().noticesSeenAt) + unseenNews().length;
  badge.hidden = n === 0; badge.textContent = n > 9 ? '9+' : String(n);
  if (btn) btn.setAttribute('aria-label', n ? 'Avisos: ' + n + (n === 1 ? ' novo' : ' novos') : 'Avisos');
}
async function loadHistory(){
  if (Store.mode !== 'supabase' || !Store.pushListSent || !State.session) { history = []; return; }
  try { history = sentHistory(await Store.pushListSent(), 30); } catch(e){ /* sem internet: fica com o que já tinha */ }
}
// Atualiza o número no sino (ao entrar e ao voltar ao app).
export async function refreshNoticeBadge(){ await loadHistory(); paintBadge(); }

function item(url, kind, title, body, when){
  return '<a class="notice-item" href="' + escapeHtml(url) + '" data-notice-go><span class="notice-kind">' + escapeHtml(KIND_LABEL[kind] || 'Aviso') + '</span>' +
    '<strong>' + escapeHtml(title) + '</strong><span class="notice-body">' + escapeHtml(body) + '</span><small>' + escapeHtml(when) + '</small></a>';
}
export async function openNotices(){
  var today = todayKey();
  await loadHistory();
  var up = upcomingReminders(14).slice(0, 15);
  var upHtml = up.length ? '<div class="notice-list">' + up.map(function(r){ return item(r.url, r.kind, r.title, r.body, whenLabel(r.date, r.hour, today)); }).join('') + '</div>'
    : '<p class="field-hint">Nenhum aviso previsto para os próximos 14 dias.</p>';
  var gotHtml;
  if (Store.mode !== 'supabase') gotHtml = '<p class="field-hint">O histórico dos avisos que chegaram aparece com conta online e os avisos ligados neste aparelho.</p>';
  else if (!history.length) gotHtml = '<p class="field-hint">Ainda não chegou nenhum aviso.' + (pushIsOn() ? '' : ' Ligue os avisos em Perfil para receber no celular.') + '</p>';
  else gotHtml = '<div class="notice-list">' + history.map(function(h){
    var d = new Date(h.sentAt), key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return item(h.url, h.kind, h.title, h.body, whenLabel(key, d.getHours(), today).replace(/ às (\d+)h$/, function(m, hh){ return ' às ' + hh + ':' + String(d.getMinutes()).padStart(2, '0'); }));
  }).join('') + '</div>';
  var fresh = unseenNews().map(function(r){ return r.id; });
  setPref('noticesSeenAt', Date.now()); setPref('noticesNewsSeen', latestId(CHANGELOG));
  paintBadge();
  var r = await openModal({
    title: 'Avisos', submitLabel: null, cancelLabel: 'Fechar',
    body: '<section class="notice-sec"><h4>Chegaram</h4>' + gotHtml + '</section><section class="notice-sec"><h4>Próximos avisos</h4>' + upHtml + '</section>' +
      '<section class="notice-sec"><h4>Novidades do app</h4>' + CHANGELOG.slice(0, 5).map(function(r, i){ return releaseHtml(r, fresh.indexOf(r.id) >= 0 || (i === 0 && !fresh.length)); }).join('') + '</section>' +
      '<p class="field-hint">Os avisos não mostram valores. <button type="button" class="linklike" data-notice-rules>Escolher o que avisar</button></p>',
    onOpen: function(modal, close){
      modal.addEventListener('click', function(e){
        var sc = e.target.closest('[data-notice-screen]');
        if (sc){ close({screen: sc.getAttribute('data-notice-screen')}); return; }
        var a = e.target.closest('[data-notice-go]');
        if (a){ e.preventDefault(); close({go: a.getAttribute('href')}); return; }
        if (e.target.closest('[data-notice-rules]')) close({go: './#/perfil'});
      });
    }
  });
  if (r && r.go) location.hash = r.go.replace(/^\.\//, '');
  else if (r && r.screen) showTab(r.screen);
}
