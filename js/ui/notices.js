/*
 * Central de avisos (o sininho no topo): os próximos avisos (calculados aqui, com as regras de Perfil) e os que já chegaram (o servidor
 * guarda os enviados por 30 dias). Mostra também os de salário. Tocar num aviso leva para a tela dele. O número no sino conta os que
 * chegaram depois da última vez que a pessoa abriu a central neste aparelho.
 */
import {todayKey} from '../domain/dates.js';
import {whenLabel, sentHistory, unseenCount} from '../domain/reminders.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {escapeHtml, icon} from './dom.js';
import {openModal} from './modal.js';
import {upcomingReminders, pushIsOn} from './push.js';
import {State} from './state.js';

var KIND_LABEL = {salary: 'Salário', invoice: 'Fatura', bill: 'Conta fixa', custom: 'Lembrete', statement: 'Extrato'};
var history = [];

export function noticesBtnHtml(){
  return '<button type="button" class="icon-btn bell-btn" id="noticesBtn" aria-label="Avisos" title="Avisos">' + icon('bell') + '<span class="bell-badge" id="noticesBadge" hidden></span></button>';
}
function paintBadge(){
  var badge = document.getElementById('noticesBadge'), btn = document.getElementById('noticesBtn');
  if (!badge) return;
  var n = unseenCount(history, getPrefs().noticesSeenAt);
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
  setPref('noticesSeenAt', Date.now());
  paintBadge();
  var r = await openModal({
    title: 'Avisos', submitLabel: null, cancelLabel: 'Fechar',
    body: '<section class="notice-sec"><h4>Chegaram</h4>' + gotHtml + '</section><section class="notice-sec"><h4>Próximos avisos</h4>' + upHtml + '</section>' +
      '<p class="field-hint">Os avisos não mostram valores. <button type="button" class="linklike" data-notice-rules>Escolher o que avisar</button></p>',
    onOpen: function(modal, close){
      modal.addEventListener('click', function(e){
        var a = e.target.closest('[data-notice-go]');
        if (a){ e.preventDefault(); close({go: a.getAttribute('href')}); return; }
        if (e.target.closest('[data-notice-rules]')) close({go: './#/perfil'});
      });
    }
  });
  if (r && r.go) location.hash = r.go.replace(/^\.\//, '');
}
