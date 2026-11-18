/*
 * Conselhos: card no Início (os 3 que mais pesam) e aba com todos. As regras ficam em domain/advice.js.
 * Cada conselho pode ser dispensado no mês (guarda em preferências, no aparelho).
 */
import {monthBounds, todayKey} from '../domain/dates.js';
import {fmtMoney} from '../domain/money.js';
import {budgetsFor} from '../domain/budgets.js';
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
    catName: function(id){ return catLabel(id, 'expense'); }, receivables: State.receivables, goals: State.goals, nextCommitted: next.mine + next.fixedTotal});
  var hide = dismissedNow();
  return all ? advice : advice.filter(function(a){ return !hide[a.id]; });
}
function itemHtml(a, compact){
  var act = a.action ? (a.action.type === 'limit' ?
    '<button type="button" class="btn btn-primary btn-sm" data-advice-limit="' + escapeHtml(a.action.cat + ':' + a.action.amount) + '">' + escapeHtml(a.action.label) + '</button>' :
    '<button type="button" class="btn btn-ghost btn-sm" data-advice-go="' + escapeHtml(a.action.tab) + '">' + escapeHtml(a.action.label) + '</button>') : '';
  return '<article class="advice-item ' + a.tone + '">' + icon(a.tone === 'warn' ? 'gauge' : a.tone === 'good' ? 'check' : 'bolt') +
    '<div class="ai-body"><h4>' + escapeHtml(a.title) + '</h4><p>' + escapeHtml(a.text) + '</p>' +
    '<div class="ai-act">' + act + (a.kind === 'good' && a.id === 'good:calm' ? '' : '<button type="button" class="linklike" data-advice-dismiss="' + escapeHtml(a.id) + '">Dispensar</button>') + '</div></div></article>';
}
export function renderAdvice(){
  var card = document.getElementById('adviceCard'), list = document.getElementById('adviceList');
  if (!card || !list) return;
  var shown = currentAdvice(false);
  var wrapEvents = function(el){
    if (el._adviceWired) return;
    el._adviceWired = true;
    el.addEventListener('click', onClick);
  };
  wrapEvents(card); wrapEvents(list);
  // Início: no máximo 3, só se houver algo além do elogio vazio.
  card.hidden = !State.session || !State.transactions.length;
  card.innerHTML = card.hidden ? '' : '<div class="card-head"><h3>Conselhos do mês</h3><button type="button" class="btn btn-ghost btn-sm" data-advice-go="conselhos">Ver todos</button></div>' +
    '<p class="card-sub">Uma olhadinha nos seus gastos, com ideias para guardar mais. São só sugestões.</p>' +
    (shown.length ? shown.slice(0, 3).map(function(a){ return itemHtml(a, true); }).join('') : '<p class="tx-meta">Você dispensou os conselhos deste mês. Eles voltam no próximo.</p>');
  list.innerHTML = shown.length ? shown.map(function(a){ return itemHtml(a, false); }).join('') :
    '<p class="empty-state">Você dispensou todos os conselhos deste mês. Eles voltam no próximo. 🌿</p>';
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
