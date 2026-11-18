/*
 * Conselhos: card no Início (os 3 que mais pesam) e aba com todos. As regras ficam em domain/advice.js.
 * Cada conselho pode ser dispensado no mês (guarda em preferências, no aparelho).
 */
import {monthBounds, todayKey} from '../domain/dates.js';
import {fmtMoney} from '../domain/money.js';
import {budgetsFor, alertPercent} from '../domain/budgets.js';
import {buildAdvice} from '../domain/advice.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, escapeHtml, icon, toast} from './dom.js';
import {State, catLabel, setBudget, budgetLocked} from './state.js';
import {nextMonthInvoices} from './home-tab.js';
import {renderBudgets} from './planning-tab.js';
import {showTab} from './shell.js';

var wired = false;
function dismissedNow(){ return (getPrefs().adviceDismissed || {})[monthBounds(0).key] || {}; }
// Conselhos do mês atual, sem os dispensados.
export function currentAdvice(all){
  if (!State.session) return [];
  var key = monthBounds(0).key;
  var next = nextMonthInvoices();
  var advice = buildAdvice({today: todayKey(), transactions: State.transactions, plan: budgetsFor(State.budgetBase, State.budgetMonths, key),
    catName: function(id){ return catLabel(id, 'expense'); }, receivables: State.receivables, goals: State.goals, nearPct: alertPercent(getPrefs().budgetAlertPct) / 100, nextCommitted: next.mine + next.fixedTotal});
  var hide = dismissedNow();
  return all ? advice : advice.filter(function(a){ return !hide[a.id]; });
}
var TONE = {warn: {label: 'Atenção', group: 'Pedem atenção'}, tip: {label: 'Ideia', group: 'Ideias para guardar mais'}, good: {label: 'Tudo certo', group: 'Boas notícias'}};
// Conselho completo (aba): rótulo do tipo, título, o que foi visto, “o que fazer” e o botão de ação.
function itemHtml(a){
  var act = a.action ? (a.action.type === 'limit' ?
    '<button type="button" class="btn btn-primary btn-sm" data-advice-limit="' + escapeHtml(a.action.cat + ':' + a.action.amount) + '">' + escapeHtml(a.action.label) + '</button>' :
    '<button type="button" class="btn btn-ghost btn-sm" data-advice-go="' + escapeHtml(a.action.tab) + '">' + escapeHtml(a.action.label) + '</button>') : '';
  return '<article class="advice-item ' + a.tone + '">' +
    '<header class="ai-head"><span class="advice-badge ' + a.tone + '">' + icon('bulb') + TONE[a.tone].label + '</span>' +
      (a.saving > 0 ? '<span class="advice-gain">pode liberar ~' + fmtMoney(a.saving) + '</span>' : '') + '</header>' +
    '<h4>' + escapeHtml(a.title) + '</h4><p class="ai-text">' + escapeHtml(a.text) + '</p>' +
    (a.todo ? '<div class="ai-todo"><strong>O que fazer</strong><span>' + escapeHtml(a.todo) + '</span></div>' : '') +
    '<div class="ai-act">' + act + (a.id === 'good:calm' ? '' : '<button type="button" class="linklike" data-advice-dismiss="' + escapeHtml(a.id) + '">Dispensar</button>') + '</div></article>';
}
// Linha curta do Início: rótulo + título; tocar leva aos conselhos.
function miniHtml(a){
  return '<button type="button" class="advice-mini ' + a.tone + '" data-advice-go="conselhos"><span class="advice-badge ' + a.tone + '">' + TONE[a.tone].label + '</span><span class="am-title">' + escapeHtml(a.title) + '</span><span class="am-go" aria-hidden="true">›</span></button>';
}
export function renderAdvice(){
  var card = document.getElementById('adviceCard'), list = document.getElementById('adviceList');
  if (!card || !list) return;
  var shown = currentAdvice(false);
  [card, list].forEach(function(el){ if (!el._adviceWired){ el._adviceWired = true; el.addEventListener('click', onClick); } });
  var attention = shown.filter(function(a){ return a.tone === 'warn'; }).length;
  // Início: só um resumo de 1 linha por conselho (os 3 que mais pesam).
  card.hidden = !State.session || !State.transactions.length || !shown.length;
  card.innerHTML = card.hidden ? '' : '<div class="card-head"><h3>' + icon('bulb') + 'Conselhos do mês</h3><button type="button" class="linklike" data-advice-go="conselhos">Ver todos (' + shown.length + ')</button></div>' +
    '<div class="advice-minis">' + shown.slice(0, 3).map(miniHtml).join('') + '</div>';
  // Aba: resumo no topo e os conselhos em grupos.
  if (!shown.length){ list.innerHTML = '<p class="empty-state">Você dispensou todos os conselhos deste mês. Eles voltam no próximo. 🌿</p>'; }
  else {
    var groups = ['warn', 'tip', 'good'].map(function(t){
      var items = shown.filter(function(a){ return a.tone === t; });
      return items.length ? '<section class="advice-group"><h3 class="ag-title ' + t + '">' + TONE[t].group + ' <span>' + items.length + '</span></h3><div class="advice-grid">' + items.map(itemHtml).join('') + '</div></section>' : '';
    }).join('');
    list.innerHTML = '<p class="advice-summary">' + (attention ? '<strong>' + attention + (attention === 1 ? ' ponto pede' : ' pontos pedem') + ' atenção</strong> neste mês. ' : '<strong>Nada urgente</strong> neste mês. ') +
      'Os conselhos mudam conforme você lança gastos.</p>' + groups;
  }
  var restore = qs('#adviceRestore');
  if (restore) restore.hidden = !Object.keys(dismissedNow()).length;
}
async function onClick(e){
  var b;
  if ((b = e.target.closest('[data-advice-go]'))){ showTab(b.getAttribute('data-advice-go')); return; }
  if ((b = e.target.closest('[data-advice-dismiss]'))){
    var all = getPrefs().adviceDismissed || {}, key = monthBounds(0).key;
    all[key] = Object.assign({}, all[key] || {}); all[key][b.getAttribute('data-advice-dismiss')] = true;
    var keep = {}; Object.keys(all).forEach(function(m){ if (m >= key) keep[m] = all[m]; });
    setPref('adviceDismissed', keep); renderAdvice(); return;
  }
  if ((b = e.target.closest('[data-advice-limit]'))){
    var parts = b.getAttribute('data-advice-limit').split(':'), key2 = monthBounds(0).key;
    if (budgetLocked(key2)) return;
    await setBudget(key2, parts[0], Number(parts[1]));
    renderBudgets(); renderAdvice();
    toast('Limite de ' + catLabel(parts[0], 'expense') + ' definido em ' + fmtMoney(Number(parts[1])) + ' para este mês. Dá para ajustar em Planejar gastos.');
  }
}
export function wireAdvice(){
  if (wired) return;
  wired = true;
  var r = document.getElementById('adviceRestore');
  if (r) r.addEventListener('click', function(){
    var all = getPrefs().adviceDismissed || {}; delete all[monthBounds(0).key]; setPref('adviceDismissed', all); renderAdvice();
  });
}
