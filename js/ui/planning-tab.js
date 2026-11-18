/*
 * Planejar gastos e metas.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {toDateKey, todayKey, parseDate, formatDateBr, formatDateFull, validDateStr, monthBounds, monthLabelOf} from '../domain/dates.js';
import * as Goals from '../domain/goals.js';
import {goalUseImpact} from '../domain/simulate.js';
import * as Inv from '../domain/investments.js';
import {cachedIndexes, fetchIndexes} from '../data/rates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, sum, uid} from '../domain/util.js';
import {isPersonal, myShare} from '../domain/transactions.js';

import {statusForPct, monthBurn, alertPercent} from '../domain/budgets.js';
import {getPrefs, setPref} from '../data/session.js';
import {urgencyOf, byUrgency} from '../domain/urgency.js';

import {Store} from '../data/store.js';
import {qs, qsa, escapeHtml, optionsHtml, icon, toast} from './dom.js';
import {askAmount, openModal} from './modal.js';
import {moreMenu} from './commitments-tab.js';
import {renderDashboard, txRowHtml, compactMoney} from './home-tab.js';
import {State, budgetLimit, budgetLocked, catBadge, catLabel, expenseCats, k, setBudget, txForMonth, urgencyOptions, urgencySelectHtml} from './state.js';
import {manageCategories, showBudgetPopup} from './tx-edit.js';
import {renderAdvice} from './advice-tab.js';
import {createCategory, populateCategorySelect} from './tx-list.js';

/* ---------- Planejar gastos (aba "limites") ---------- */
export var statusLabel = {good:'sob controle', warning:'quase no limite', critical:'estourou'};

// Aviso de primeira vez na aba: como funcionam os alertas do planejamento (some quando a pessoa fecha).
// Em que porcentagem do limite o app avisa: botões rápidos e um campo para outro valor. Vale para todos os meses.
function alertSettingHtml(){
  var cur = alertPercent(getPrefs().budgetAlertPct), quick = [70, 80, 90, 95];
  return '<div class="budget-alert-set"><span class="bas-lbl">Avisar quando uma categoria chegar a</span>' +
    '<span class="bas-chips" role="group" aria-label="Porcentagem do aviso">' + quick.map(function(p){
      return '<button type="button" class="chip' + (cur === p ? ' on' : '') + '" data-alert-pct="' + p + '" aria-pressed="' + (cur === p) + '">' + p + '%</button>'; }).join('') + '</span>' +
    '<label class="bas-other">ou outro: <span class="money-input sm"><input type="number" min="50" max="99" step="1" inputmode="numeric" id="alertPctInput" value="' + (quick.indexOf(cur) < 0 ? cur : '') + '" placeholder="' + cur + '" aria-label="Outra porcentagem"><span>%</span></span></label>' +
    '<span class="field-hint">do limite do mês. Quando chegar, aparece um aviso na tela; passando do limite, avisa de novo.</span></div>';
}
// Aviso de primeira vez na aba: como funcionam os alertas do planejamento (some quando a pessoa fecha).
function budgetIntroHtml(){
  if (getPrefs().budgetIntroSeen) return '';
  return '<div class="budget-intro" role="note">' + icon('gauge') + '<div><strong>Como o planejamento avisa você</strong>' +
    '<p>Defina quanto quer gastar em cada categoria. Quando uma categoria chegar à porcentagem que você escolher (começa em <strong>90%</strong>) do limite, ou passar dele, aparece um aviso na tela. ' +
    'Aqui embaixo você acompanha a evolução do mês: se o gasto está acima ou abaixo do ritmo ideal.</p>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-budget-intro-ok>Entendi</button></div></div>';
}
// Gráfico da evolução do gasto no mês: acumulado dia a dia × ritmo ideal do limite, com a projeção do fim do mês.
function budgetChartHtml(mb, monthTx, cats){
  var withLimit = cats.filter(function(c){ return budgetLimit(mb.key, c.id) > 0; });
  if (!withLimit.length) return '';
  var sel = State.budgetChartCat && withLimit.some(function(c){ return c.id === State.budgetChartCat; }) ? State.budgetChartCat : 'all';
  var picked = sel === 'all' ? withLimit : withLimit.filter(function(c){ return c.id === sel; });
  var ids = picked.map(function(c){ return c.id; });
  var limit = sumMoney(picked, function(c){ return budgetLimit(mb.key, c.id); });
  var items = monthTx.filter(function(t){ return !t.reversal && ids.indexOf(t.category) >= 0 && myShare(t) > 0; }).map(function(t){ return {date: t.date, amount: myShare(t)}; });
  var b = monthBurn(items, mb.key, todayKey(), limit);
  var W = 600, H = 210, L = 58, R = 14, T = 12, B = 28, pw = W - L - R, ph = H - T - B;
  var top = Math.max(limit, b.spent, b.upto && b.upto < b.days ? b.projected : 0) * 1.08 || 1;
  function x(d){ return (L + pw * (d - 1) / Math.max(1, b.days - 1)).toFixed(1); }
  function y(v){ return (T + ph - ph * Math.min(v, top) / top).toFixed(1); }
  var over = b.spent > limit;
  var cum = b.cum.map(function(v, i){ return x(i + 1) + ',' + y(v); }).join(' ');
  var idealLine = '<line class="bch-ideal" x1="' + x(1) + '" y1="' + y(b.ideal[0] || 0) + '" x2="' + x(b.days) + '" y2="' + y(limit) + '"></line>';
  var proj = b.upto && b.upto < b.days && b.spent > 0 ? '<line class="bch-proj" x1="' + x(b.upto) + '" y1="' + y(b.spent) + '" x2="' + x(b.days) + '" y2="' + y(b.projected) + '"></line>' : '';
  var ticks = [1, Math.round(b.days / 3), Math.round(2 * b.days / 3), b.days].filter(function(d, i, a){ return a.indexOf(d) === i; });
  var svg = '<svg class="bch-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolução do gasto no mês comparada ao limite">' +
    '<line class="bch-limit" x1="' + L + '" y1="' + y(limit) + '" x2="' + (W - R) + '" y2="' + y(limit) + '"></line>' +
    '<text class="bch-lbl" x="' + (L - 6) + '" y="' + (Number(y(limit)) + 4) + '" text-anchor="end">R$ ' + compactMoney(limit) + '</text>' +
    '<text class="bch-lbl" x="' + (L - 6) + '" y="' + (T + ph + 4) + '" text-anchor="end">0</text>' +
    idealLine + proj + (b.cum.length > 1 ? '<polyline class="bch-line ' + (over ? 'over' : '') + '" points="' + cum + '"></polyline>' : '') +
    (b.cum.length ? '<circle class="bch-dot ' + (over ? 'over' : '') + '" cx="' + x(b.upto) + '" cy="' + y(b.spent) + '" r="4"></circle>' : '') +
    ticks.map(function(d){ return '<text class="bch-lbl" x="' + x(d) + '" y="' + (H - 8) + '" text-anchor="middle">dia ' + d + '</text>'; }).join('') + '</svg>';
  var cur = b.upto > 0 && b.upto < b.days, pctNow = limit > 0 ? Math.round(100 * b.spent / limit) : 0;
  var msg = !b.upto ? 'O mês ainda não começou.' :
    (b.ahead > 0.004 ? '<strong class="neg-text">' + fmtMoney(b.ahead) + ' acima</strong> do ritmo ideal' : '<strong class="pos-text">' + fmtMoney(Math.abs(b.ahead)) + ' abaixo</strong> do ritmo ideal') +
    ' (' + pctNow + '% do planejado usado' + (cur ? ' no dia ' + b.upto + ' de ' + b.days : '') + ').' +
    (cur && b.spent > 0 ? ' Mantendo esse ritmo, o mês termina em <strong class="tabular ' + (b.projected > limit ? 'neg-text' : '') + '">' + fmtMoney(b.projected) + '</strong> (' + Math.round(100 * b.projected / limit) + '% do planejado).' : '') +
    (b.scheduled > 0 ? ' Ainda há ' + fmtMoney(b.scheduled) + ' agendados para os próximos dias.' : '');
  return '<div class="budget-chart card-lite"><div class="bch-head"><h4>Evolução do mês</h4>' +
    '</div><div class="bch-chips" role="group" aria-label="Categoria do gráfico"><button type="button" class="chip' + (sel === 'all' ? ' on' : '') + '" data-chart-cat="all" aria-pressed="' + (sel === 'all') + '">Todas</button>' +
    withLimit.map(function(c){ return '<button type="button" class="chip' + (sel === c.id ? ' on' : '') + '" data-chart-cat="' + escapeHtml(c.id) + '" aria-pressed="' + (sel === c.id) + '">' + escapeHtml(c.label) + '</button>'; }).join('') + '</div>' +
    svg + '<div class="bch-legend"><span><i class="lg-line"></i>Gasto acumulado</span><span><i class="lg-ideal"></i>Ritmo ideal</span><span><i class="lg-limit"></i>Limite</span>' + (proj ? '<span><i class="lg-proj"></i>Projeção</span>' : '') + '</div>' +
    '<p class="bch-msg">' + msg + '</p></div>';
}

export function renderBudgets(){
  var mb = monthBounds(State.budgetMonthOffset);
  var locked = budgetLocked(mb.key);
  document.getElementById('budgetMonthLabel').textContent = mb.label;
  document.getElementById('budgetNext').disabled = State.budgetMonthOffset >= 1;
  document.getElementById('budgetNote').innerHTML = locked ?
    icon('lock') + ' Mês encerrado: o planejamento fica como estava e não pode ser alterado.' :
    (State.budgetMonthOffset > 0 ? 'Planejando o próximo mês. Ele começa com os valores do mês atual.' : 'Os valores valem a partir deste mês. Os meses anteriores continuam como estavam.');
  document.getElementById('budgetNote').classList.toggle('locked', locked);
  document.getElementById('budgetNewCat').hidden = locked;
  var monthTx = txForMonth(mb.key).filter(function(t){ return t.type==='expense' && isPersonal(t); });
  var list = document.getElementById('budgetList');
  // Categorias pelo uso real: o que você gastou (sua parte, sem estornos nem compras pagas por outras
  // pessoas) no mês e nos 2 anteriores, até o fim do mês mostrado — parcelas futuras não contam.
  // Ordem: maior gasto no mês, depois maior gasto nos 3 meses; as com limite mas sem gasto vêm em
  // seguida. As nunca usadas ficam recolhidas (sem histórico nenhum, mostra todas para começar).
  var since = monthBounds(State.budgetMonthOffset - 2).key + '-01', until = mb.key + '-31';
  var spent3 = {}, spentM = {};
  State.transactions.forEach(function(t){
    if (t.type !== 'expense' || !isPersonal(t) || t.reversal || t.date < since || t.date > until) return;
    var v = myShare(t);
    if (!(v > 0)) return;
    spent3[t.category] = (spent3[t.category] || 0) + v;
  });
  monthTx.forEach(function(t){ if (!t.reversal) spentM[t.category] = (spentM[t.category] || 0) + myShare(t); });
  var cats = expenseCats(), spent3Any = Object.keys(spent3).length > 0;
  var shown = cats.filter(function(c){ return spent3[c.id] > 0 || spentM[c.id] > 0 || budgetLimit(mb.key, c.id) > 0 || State.budgetNewCats.indexOf(c.id) >= 0; });
  shown.sort(function(a, b){ return (spentM[b.id] || 0) - (spentM[a.id] || 0) || (spent3[b.id] || 0) - (spent3[a.id] || 0); });
  // Sem histórico nenhum: começa com três categorias comuns; as outras ficam recolhidas.
  if (!shown.length) shown = cats.filter(function(c){ return ['alimentacao', 'transporte', 'moradia'].indexOf(c.id) >= 0; });
  if (!shown.length) shown = cats.slice(0, 3);
  var hidden = cats.filter(function(c){ return shown.indexOf(c) < 0; });
  // Resumo do mês: planejado × gasto nas categorias com limite, e o que ainda pode gastar.
  var planned = sumMoney(cats, function(c){ return budgetLimit(mb.key, c.id); });
  var spentPlanned = sumMoney(cats.filter(function(c){ return budgetLimit(mb.key, c.id) > 0; }), function(c){ return spentM[c.id] || 0; });
  var spentAll = sumMoney(cats, function(c){ return spentM[c.id] || 0; });
  var overs = cats.filter(function(c){ var l = budgetLimit(mb.key, c.id); return l > 0 && (spentM[c.id] || 0) > l; }).length;
  var sumPct = planned > 0 ? spentPlanned / planned : 0, sumStatus = planned > 0 ? statusForPct(sumPct) : 'good';
  var summary = '<div class="budget-summary">' +
    '<div class="bs-fig"><span class="bs-lbl">Planejado</span><strong class="tabular">' + (planned > 0 ? fmtMoney(planned) : '—') + '</strong></div>' +
    '<div class="bs-fig"><span class="bs-lbl">Gasto no mês</span><strong class="tabular">' + fmtMoney(spentAll) + '</strong></div>' +
    '<div class="bs-fig"><span class="bs-lbl">' + (planned > 0 && spentPlanned > planned ? 'Passou' : 'Ainda pode gastar') + '</span><strong class="tabular ' + (planned > 0 && spentPlanned > planned ? 'neg-text' : 'pos-text') + '">' + (planned > 0 ? fmtMoney(Math.abs(planned - spentPlanned)) : '—') + '</strong></div>' +
    (planned > 0 ? '<div class="bs-bar" role="img" aria-label="' + Math.round(sumPct * 100) + '% do planejado usado"><span class="' + sumStatus + '" style="width:' + Math.min(100, sumPct * 100) + '%"></span></div>' +
      '<p class="bs-note">' + Math.round(sumPct * 100) + '% do planejado usado' + (overs ? ' · ' + overs + (overs === 1 ? ' categoria passou' : ' categorias passaram') + ' do limite' : '') + '.</p>' :
      '<p class="bs-note">Digite quanto quer gastar em cada categoria para acompanhar o mês.</p>') +
    '</div>';
  // Atalho: usar a média dos últimos 3 meses nas categorias que ainda não têm limite.
  var fill = locked ? [] : cats.filter(function(c){ return !(budgetLimit(mb.key, c.id) > 0) && spent3[c.id] > 0; })
    .map(function(c){ return {id: c.id, amount: Math.ceil(spent3[c.id] / 3 / 10) * 10}; }).filter(function(x){ return x.amount > 0; });
  if (fill.length) summary = summary.replace(/<\/div>$/, '<button type="button" class="btn btn-ghost btn-sm bs-fill" data-budget-fill>Usar a média dos últimos 3 meses' +
    (fill.length > 1 ? ' (' + fill.length + ' categorias)' : '') + '</button></div>');
  list.innerHTML = summary + alertSettingHtml() + budgetIntroHtml() + budgetChartHtml(mb, monthTx, cats) + shown.map(budgetRowHtml).join('') +
    (hidden.length ? '<details class="budget-more"><summary>' + (spent3Any ? 'Sem gastos nos últimos 3 meses' : 'Outras categorias') + ' (' + hidden.length + '): ' + escapeHtml(hidden.map(function(c){ return c.label; }).join(', ')) + '</summary><div class="budget-cards">' +
      hidden.map(budgetRowHtml).join('') + '</div></details>' : '');
  function budgetRowHtml(c){
    var catTx = monthTx.filter(function(t){ return t.category === c.id; }).sort(function(a, b){ return b.date.localeCompare(a.date); });
    var limit = budgetLimit(mb.key, c.id);
    var spent = sum(catTx, myShare);
    var pct = limit > 0 ? spent/limit : 0;
    var status = limit > 0 ? statusForPct(pct) : 'none';
    var avg3 = spent3[c.id] > 0 ? spent3[c.id] / 3 : 0;
    var barClass = status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'good';
    var diff = limit > 0 ? limit - spent : 0;
    var stats = limit > 0 ?
      '<div class="bc-stats"><div><span>Gasto</span><strong class="tabular">' + fmtMoney(spent) + '</strong></div>' +
        '<div><span>' + (diff >= 0 ? 'Restam' : 'Passou') + '</span><strong class="tabular ' + (diff >= 0 ? 'pos-text' : 'neg-text') + '">' + fmtMoney(Math.abs(diff)) + '</strong></div>' +
        '<div><span>Média 3 meses</span><strong class="tabular">' + (avg3 > 0 ? fmtMoney(avg3) : '—') + '</strong></div></div>' :
      '<div class="bc-stats"><div><span>Gasto no mês</span><strong class="tabular">' + fmtMoney(spent) + '</strong></div>' +
        '<div><span>Média 3 meses</span><strong class="tabular">' + (avg3 > 0 ? fmtMoney(avg3) : '—') + '</strong></div>' +
        (avg3 > 0 && !locked ? '<div><button type="button" class="linklike" data-budget-suggest="' + escapeHtml(c.id) + '" data-amount="' + Math.ceil(avg3 / 10) * 10 + '">Sugerir ' + fmtMoney(Math.ceil(avg3 / 10) * 10) + '</button></div>' : '') + '</div>';
    return '<div class="budget-row bcard ' + status + '">' +
      '<div class="budget-top">' +
        '<span class="budget-cat">' + catBadge(c.id, 'expense') + escapeHtml(c.label) + (limit > 0 ? '<span class="status-pill ' + status + '">' + statusLabel[status] + '</span>' : '') + '</span>' +
        '<span class="money-input sm"><span>R$</span><input class="tabular" type="text" data-money autocomplete="off" inputmode="decimal" data-budget-cat="'+escapeHtml(c.id)+'" value="'+(limit||'')+'" placeholder="'+(locked ? '—' : 'Sem limite')+'"'+(locked ? ' disabled' : '')+' aria-label="Quanto quero gastar com '+escapeHtml(c.label)+'"></span>' +
      '</div>' +
      (limit > 0 ? '<div class="bc-bar" role="img" aria-label="' + Math.round(pct * 100) + '% do limite usado"><span class="' + barClass + '" style="width:' + Math.min(100, pct * 100) + '%"></span><em>' + Math.round(pct * 100) + '%</em></div>' : '') +
      stats +
      (catTx.length ? '<details class="budget-details bc-details"><summary><span>Ver os ' + catTx.length + (catTx.length === 1 ? ' lançamento' : ' lançamentos') + '</span><span class="bc-sum tabular">' + fmtMoney(spent) + '</span></summary><div class="bc-list">' + catTx.map(txRowHtml).join('') + '</div></details>' :
        '<p class="bc-empty">Nenhum lançamento neste mês.</p>') +
      '</div>';
  }

  qsa('[data-chart-cat]', list).forEach(function(b){
    b.addEventListener('click', function(){ State.budgetChartCat = b.getAttribute('data-chart-cat'); renderBudgets(); });
  });
  function setAlertPct(v){
    var n = alertPercent(v);
    setPref('budgetAlertPct', n);
    // Mudou a regra: o que já está nessa faixa pode avisar de novo neste mês.
    var seen = getPrefs().budgetAlertSeen || {}; delete seen[monthBounds(0).key]; setPref('budgetAlertSeen', seen);
    renderBudgets(); renderAdvice();
    toast('Vou avisar quando uma categoria chegar a ' + n + '% do limite.');
    showBudgetPopup(null);
  }
  qsa('[data-alert-pct]', list).forEach(function(b){ b.addEventListener('click', function(){ setAlertPct(b.getAttribute('data-alert-pct')); }); });
  var pctIn = qs('#alertPctInput', list);
  if (pctIn) pctIn.addEventListener('change', function(){
    var n = Math.round(Number(pctIn.value));
    if (!(n >= 50 && n <= 99)){ toast('Escolha uma porcentagem entre 50% e 99%.'); pctIn.value = ''; return; }
    setAlertPct(n);
  });
  var introOk = qs('[data-budget-intro-ok]', list);
  if (introOk) introOk.addEventListener('click', function(){ setPref('budgetIntroSeen', true); renderBudgets(); });
  var fillBtn = qs('[data-budget-fill]', list);
  if (fillBtn) fillBtn.addEventListener('click', async function(){
    var key = monthBounds(State.budgetMonthOffset).key;
    if (budgetLocked(key)) return;
    for (var i = 0; i < fill.length; i++) await setBudget(key, fill[i].id, fill[i].amount);
    renderBudgets();
    toast('Limites definidos pela média de 3 meses em ' + fill.length + (fill.length === 1 ? ' categoria' : ' categorias') + '. Ajuste se quiser.');
  });
  qsa('[data-budget-suggest]', list).forEach(function(btn){
    btn.addEventListener('click', async function(){
      var cat = btn.getAttribute('data-budget-suggest'), key = monthBounds(State.budgetMonthOffset).key;
      if (budgetLocked(key)) return;
      await setBudget(key, cat, Number(btn.getAttribute('data-amount')));
      renderBudgets();
      toast('Planejamento de ' + catLabel(cat, 'expense') + ' em ' + monthLabelOf(key) + ' atualizado.');
    });
  });
  qsa('[data-budget-cat]', list).forEach(function(input){
    input.addEventListener('change', async function(){
      var cat = input.getAttribute('data-budget-cat');
      var key = monthBounds(State.budgetMonthOffset).key;
      if (budgetLocked(key)) return;
      await setBudget(key, cat, Math.max(0, money(input.value || 0)));
      renderBudgets();
      toast('Planejamento de ' + catLabel(cat,'expense') + ' em ' + monthLabelOf(key) + ' atualizado.');
    });
  });
}

/* ---------- Metas ---------- */
export var GOAL_FILTERS = [
  {id:'andamento', label:'Em andamento'},
  {id:'concluidas', label:'Concluídas'},
  {id:'naobatidas', label:'Não batidas'},
  {id:'excluidas', label:'Excluídas'}
];
export function goalStatus(g){
  if (g.deletedAt) return 'excluidas';
  if (!Goals.hasTarget(g)) return 'andamento';
  if (Number(g.currentAmount||0) >= Number(g.targetAmount||0)) return 'concluidas';
  if (g.targetDate && g.targetDate < todayKey()) return 'naobatidas';
  return 'andamento';
}

export function calendarUrl(title, dateIso, details){
  var d = dateIso.replace(/-/g,'');
  var next = toDateKey(new Date(parseDate(dateIso).getTime() + 86400000)).replace(/-/g,'');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
    '&dates=' + d + '/' + next + '&details=' + encodeURIComponent(details);
}

export function renderGoals(){
  refreshGoalRates();
  var counts = {};
  GOAL_FILTERS.forEach(function(f){ counts[f.id] = 0; });
  State.goals.forEach(function(g){ counts[goalStatus(g)]++; });
  document.getElementById('goalFilter').innerHTML = GOAL_FILTERS.map(function(f){
    return '<button type="button" role="tab" aria-selected="' + (State.goalFilter === f.id) + '" class="' + (State.goalFilter === f.id ? 'active' : '') + '" data-goal-filter="' + f.id + '">' + f.label + '<span class="count">' + counts[f.id] + '</span></button>';
  }).join('');

  var grid = document.getElementById('goalGrid');
  var goals = byUrgency(State.goals.filter(function(g){ return goalStatus(g) === State.goalFilter; }), function(a, b){ return String(a.targetDate || '9999').localeCompare(String(b.targetDate || '9999')); });
  if (!goals.length){
    var empty = {andamento:'Nenhuma meta em andamento. Que tal criar a primeira acima?', concluidas:'Nenhuma meta concluída ainda. Você chega lá!', naobatidas:'Nenhuma meta com prazo vencido.', excluidas:'Nenhuma meta excluída.'};
    grid.innerHTML = '<p class="empty-state">' + empty[State.goalFilter] + '</p>';
    return;
  }
  grid.innerHTML = goals.map(goalCardHtml).join('');
}

var MOVE_LABEL = {deposit: 'Guardado', yield: 'Rendimento', withdraw: 'Retirada'};
// Retirada para outra coisa fica marcada no histórico, para lembrar de repor.
function moveLabel(m){ return m.kind === 'withdraw' && m.purpose === 'outro' ? 'Retirada para outra coisa (fora do objetivo)' : MOVE_LABEL[m.kind]; }
// Percentual digitado ("10,5" ou "10.5"): número, ou null se vazio/ inválido.
export function parsePercent(v){
  var s = String(v == null ? '' : v).trim().replace('%', '').replace(',', '.');
  if (!s) return null;
  var n = Number(s);
  return isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}
function pctText(n){ return String(Math.round(n * 100) / 100).replace('.', ','); }
function monthsText(n){
  if (n < 1) return 'menos de 1 mês';
  var m = Math.round(n);
  return m + (m === 1 ? ' mês' : ' meses');
}
function shortMonth(dateKey){ var l = monthLabelOf(dateKey.slice(0, 7)); return l.slice(0, 3).toLowerCase() + '/' + dateKey.slice(0, 4); }

// Previsão em frases: quanto guardar por mês, quando acaba no ritmo atual e quanto terá no prazo.
export function goalForecastHtml(g){
  var today = todayKey(), f = Goals.goalForecast(g, today), s = f.summary, parts = [];
  if (f.done) return '';
  if (f.openEnded){
    if (f.atDeadline !== undefined && s.pace > 0) parts.push('<p>Guardando no ritmo de <span class="tabular">' + fmtMoney(s.pace) + '/mês</span>, até ' + formatDateFull(g.targetDate) + ' você terá cerca de <strong class="tabular">' + fmtMoney(f.atDeadline) + '</strong>.</p>');
    else if (!(s.pace > 0)) parts.push('<p class="tx-meta">Registre o que guardar pelo botão “Guardar”: com as datas, calculamos o seu ritmo.</p>');
    return parts.length ? '<div class="goal-forecast">' + parts.join('') + '</div>' : '';
  }
  if (f.needed !== undefined){
    parts.push('<p><strong>Para chegar até ' + formatDateFull(g.targetDate) + '</strong> (' + monthsText(f.deadlineMonths) + '), guarde cerca de <strong class="tabular">' + fmtMoney(f.needed) + ' por mês</strong>' +
      (f.yieldUntilDeadline > 0 ? '. O rendimento ajuda com uns ' + fmtMoney(f.yieldUntilDeadline) + '.' : '.') + '</p>');
  }
  if (s.pace > 0){
    var pace = 'No seu ritmo (<span class="tabular">' + fmtMoney(s.pace) + '/mês</span> ' + (s.paceMonths > 1 ? 'nos últimos ' + s.paceMonths + ' meses' : 'neste mês') + ')';
    if (f.needed !== undefined){
      parts.push('<p class="' + (f.onTrack ? 'fc-good' : 'fc-warn') + '">' + pace + (f.onTrack ?
        ', você chega lá ' + (f.finishDate ? 'por volta de ' + shortMonth(f.finishDate) + ', ' : '') + 'antes do prazo.' :
        ', no prazo terá <span class="tabular">' + fmtMoney(f.atDeadline) + '</span> (' + Math.round(f.atDeadline / f.target * 100) + '% da meta). Faltariam ' + fmtMoney(f.target - f.atDeadline) + '.') + '</p>');
    } else if (f.finishDate){
      parts.push('<p>' + pace + ', você chega lá por volta de <strong>' + shortMonth(f.finishDate) + '</strong> (em ' + monthsText(f.monthsToGo) + ').</p>');
    }
  } else if (f.finishDate && f.rate){
    parts.push('<p>Sem guardar mais nada, só com o rendimento, a meta fica pronta por volta de ' + shortMonth(f.finishDate) + '.</p>');
  } else {
    parts.push('<p class="tx-meta">Registre o que guardar pelo botão “Guardar”: com as datas, calculamos o seu ritmo e quando a meta fica pronta.</p>');
  }
  return '<div class="goal-forecast">' + parts.join('') +
    '<details class="budget-details"><summary>Como calculamos</summary><p class="tx-meta">' +
      'O ritmo é a média do que você guardou por mês nos últimos 3 meses (o mês atual entra quando já tem depósito). ' +
      (f.rate ? 'Com ' + pctText(Number(g.yieldRate)) + '% ao ano, o dinheiro rende cerca de ' + pctText(f.rate * 100) + '% ao mês, sobre o que já está guardado e sobre cada depósito (juros compostos). ' :
        'Sem rendimento informado, a conta é só o que falta dividido pelos meses. ') +
      'É uma estimativa: se o ritmo ou a taxa mudarem, a previsão muda junto.</p></details></div>';
}
// Uma frase que resume a meta: quanto falta e quando fica pronta (ou quanto guardar por mês).
function goalHeadline(g){
  var f = Goals.goalForecast(g, todayKey()), s = f.summary;
  if (f.done) return '';
  if (f.openEnded){
    var o = 'Sem valor alvo: <strong class="tabular">' + fmtMoney(s.current) + '</strong> juntados até agora.';
    if (s.pace > 0) o += ' No seu ritmo, cerca de <strong class="tabular">' + fmtMoney(s.pace) + ' por mês</strong>.';
    else o += ' Use “Guardar” sempre que separar um dinheiro.';
    return '<p class="goal-headline">' + o + '</p>';
  }
  var missing = Math.max(0, Number(g.targetAmount || 0) - Number(g.currentAmount || 0));
  var txt = 'Faltam <strong class="tabular">' + fmtMoney(missing) + '</strong>.', cls = '';
  if (s.pace > 0 && f.finishDate){
    txt += ' No seu ritmo, fica pronta em <strong>' + shortMonth(f.finishDate) + '</strong>' + (f.needed !== undefined ? (f.onTrack ? ', antes do prazo.' : ', depois do prazo.') : '.');
    cls = f.needed !== undefined && !f.onTrack ? 'fc-warn' : 'fc-good';
  } else if (f.needed !== undefined){
    txt += ' Guarde cerca de <strong class="tabular">' + fmtMoney(f.needed) + ' por mês</strong> para chegar no prazo.';
  } else if (!(s.pace > 0)){
    txt += ' Use “Guardar” sempre que separar um dinheiro para ela.';
  }
  return '<p class="goal-headline ' + cls + '">' + txt + '</p>';
}
function goalCardHtml(g){
  var status = goalStatus(g);
  var open = !Goals.hasTarget(g);
  var pct = g.targetAmount > 0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0;
  var remindDate = g.reminderDate || g.targetDate;
  var s = Goals.goalSummary(g, todayKey());
  var actions;
  if (status === 'excluidas'){
    actions = '<button class="btn btn-ghost btn-sm" type="button" data-goal-restore="'+g.id+'">Restaurar</button>' +
      '<button class="btn btn-danger btn-sm" type="button" data-goal-purge="'+g.id+'">Apagar de vez</button>';
  } else {
    var menu = ['<button type="button" data-goal-edit="'+g.id+'">' + icon('edit') + 'Editar</button>'];
    if (Number(g.currentAmount) > 0) menu.push('<button type="button" data-goal-yield="'+g.id+'">' + icon('trend-up') + 'Registrar rendimento</button>',
      '<button type="button" data-goal-withdraw="'+g.id+'">' + icon('swap') + 'Retirar dinheiro</button>');
    if (remindDate) menu.push('<button type="button" data-goal-calendar="'+g.id+'">' + icon('calendar') + 'Lembrete no Google Agenda</button>');
    menu.push('<button type="button" class="danger" data-goal-del="'+g.id+'">' + icon('trash') + 'Excluir</button>');
    actions = (status === 'concluidas' ? '<span class="status-pill good">Meta concluída</span>' :
        '<form class="deposit-form" data-goal-deposit="'+g.id+'"><span class="money-input sm"><span>R$</span><input type="text" data-money autocomplete="off" inputmode="decimal" name="amount" placeholder="Valor" aria-label="Valor para guardar"></span><button class="btn btn-primary btn-sm" type="submit">Guardar</button></form>') +
      moreMenu(menu);
  }
  var hasMoves = Array.isArray(g.moves) && g.moves.length;
  return '<div class="goal-card">' +
    '<div class="budget-top"><h4>'+escapeHtml(g.name)+'</h4><span class="card-tags">' + (status === 'naobatidas' ? '<span class="status-pill critical">prazo vencido</span>' : '') +
      (status === 'excluidas' ? '' : urgencySelectHtml('goals', g, g.name)) + '</span></div>' +
    (open ? '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' guardados</span><span>sem valor alvo</span></div>' :
      '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--brand)"></span></div>' +
      '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' de '+fmtMoney(g.targetAmount)+'</span><span>'+Math.round(pct*100)+'%</span></div>') +
    (status === 'andamento' || status === 'naobatidas' ? goalHeadline(g) : '') +
    (g.note ? '<div class="note">'+escapeHtml(g.note)+'</div>' : '') +
    (status === 'excluidas' ? '' : '<details class="goal-more"><summary>Detalhes da meta</summary>' +
    (s.earned || g.yieldRate || g.investment ? '<div class="goal-yield">' + icon('trend-up') + '<span>' +
      (g.investment ? '<strong>' + escapeHtml(Inv.investmentLabel(g.investment)) + '</strong>' + (g.investment.type !== 'nenhum' ? ' · cerca de ' + pctText(Number(g.yieldRate) || 0) + '% ao ano' : '') +
        (g.investment.auto && g.rateDate ? ' · taxa do Banco Central de ' + formatDateFull(g.rateDate) : '') + '<br>' : '') +
      (s.earned ? 'Rendeu <strong class="tabular">' + fmtMoney(s.earned) + '</strong>' + (s.deposited > 0 ? ' (' + pctText(s.earned / s.deposited * 100) + '% sobre o que você guardou)' : '') : 'Ainda sem rendimento registrado') +
      (g.yieldRate && !g.investment ? ' · taxa de ' + pctText(Number(g.yieldRate)) + '% ao ano' : '') + '</span></div>' : '') +
    '<div class="meta-line">' +
      (g.targetDate ? '<span>Prazo: '+formatDateFull(g.targetDate)+'</span>' : '<span>Sem prazo</span>') +
      (g.reminderDate ? '<span>Me avise em: '+formatDateFull(g.reminderDate)+'</span>' : '') +
    '</div>' +
    (status === 'andamento' || status === 'naobatidas' ? goalForecastHtml(g) : '') +
    (hasMoves ? '<details class="budget-details pay-log"><summary>Movimentações (' + s.moves.length + ')</summary>' + s.moves.slice().reverse().map(function(m){
      return '<div class="list-row"><div class="tx-main"><div class="tx-desc tabular">' + (m.kind === 'withdraw' ? '− ' : '+ ') + fmtMoney(m.amount) + '</div>' +
        '<div class="tx-meta">' + (m.date ? formatDateBr(m.date) + ' · ' : '') + (m.legacy ? 'já guardado antes' : m.adjust ? 'ajuste na edição' : moveLabel(m)) + '</div></div></div>';
    }).join('') + '</details>' : '') +
    '</details>') +
    '<div class="card-actions">' + actions + '</div></div>';
}

// Onde o dinheiro da meta está guardado: tipo de aplicação (opcional), % do CDI, IPCA + taxa ou
// taxa fixa, e se a taxa acompanha o Banco Central. ids com o prefixo p: pInvType, pInvPct,
// pInvSpread, pYield (taxa digitada) e pInvAuto.
export function investmentFieldsHtml(p, g){
  var inv = g.investment || {}, t = Inv.investmentType(inv.type);
  return '<div class="inv-block" data-inv="' + p + '">' +
    '<div class="field"><label for="' + p + 'InvType">Onde o dinheiro está guardado <span class="opt">(opcional)</span></label><select id="' + p + 'InvType" name="invType">' +
      optionsHtml(Inv.INVESTMENT_TYPES.map(function(x){ return {id: x.id, label: x.label}; }), inv.type || '') + '</select>' +
      '<span class="field-hint" data-inv-hint>' + escapeHtml(t.hint) + '</span></div>' +
    '<div class="field" data-inv-part="pct"><label for="' + p + 'InvPct">Quanto do CDI paga</label><span class="money-input"><input id="' + p + 'InvPct" name="invPct" type="text" inputmode="decimal" autocomplete="off" maxlength="6" value="' + escapeHtml(inv.pct ? pctText(inv.pct) : '') + '" placeholder="100"><span>%</span></span></div>' +
    '<div class="field" data-inv-part="spread"><label for="' + p + 'InvSpread">Taxa além do IPCA</label><span class="money-input"><span>IPCA +</span><input id="' + p + 'InvSpread" name="invSpread" type="text" inputmode="decimal" autocomplete="off" maxlength="6" value="' + escapeHtml(inv.spread ? pctText(inv.spread) : '') + '" placeholder="6"><span>%</span></span></div>' +
    '<div class="field" data-inv-part="rate"><label for="' + p + 'Yield">Rendimento ao ano <span class="opt">(opcional)</span></label><span class="money-input"><input id="' + p + 'Yield" name="yield" type="text" inputmode="decimal" autocomplete="off" maxlength="6" value="' + (g.yieldRate && (!inv.type || inv.type === 'fixa') ? pctText(g.yieldRate) : '') + '" placeholder="Ex: 10"><span>%</span></span></div>' +
    '<label class="check" data-inv-part="auto"><input type="checkbox" id="' + p + 'InvAuto" name="invAuto"' + (inv.type ? (inv.auto ? ' checked' : '') : ' checked') + '> Atualizar a taxa sozinho pelo Banco Central (CDI, Selic e IPCA)</label>' +
    '<p class="field-hint inv-preview" data-inv-preview aria-live="polite"></p>' +
  '</div>';
}
function invFields(root, p){
  return {type: qs('#' + p + 'InvType', root), pct: qs('#' + p + 'InvPct', root), spread: qs('#' + p + 'InvSpread', root), rate: qs('#' + p + 'Yield', root), auto: qs('#' + p + 'InvAuto', root)};
}
// Lê o bloco: {investment, yieldRate, rateDate} ou {error}.
export function readInvestment(root, p, idx){
  var f = invFields(root, p), type = f.type.value;
  if (!type || type === 'fixa'){
    var r = parsePercent(f.rate.value);
    if (Number.isNaN(r)) return {error: 'O rendimento ao ano vai de 0 a 100 (por exemplo, 10 ou 6,5).'};
    if (!type) return {investment: null, yieldRate: r};
    return {investment: {type: 'fixa', rate: r || 0}, yieldRate: r || 0};
  }
  var inv = {type: type};
  if (['caixinha', 'cdb', 'lci'].indexOf(type) >= 0){
    // % do CDI pode passar de 100 (CDB de 110%, 120%).
    var pct = f.pct.value.trim() === '' ? Inv.investmentType(type).pct : Number(f.pct.value.replace('%', '').replace(',', '.').trim());
    if (!(pct > 0) || pct > 300) return {error: 'Informe quanto do CDI a aplicação paga (por exemplo, 100 ou 110).'};
    inv.pct = pct;
  }
  if (type === 'ipca'){
    var sp = parsePercent(f.spread.value === '' ? '6' : f.spread.value);
    if (Number.isNaN(sp) || sp > 30) return {error: 'Informe a taxa além do IPCA (por exemplo, 6).'};
    inv.spread = sp;
  }
  if (Inv.investmentType(type).index) inv.auto = f.auto.checked;
  idx = idx || cachedIndexes() || Inv.REFERENCE_INDEXES;
  return {investment: inv, yieldRate: Inv.annualRate(inv, idx), rateDate: idx.date || null};
}
// Mostra só os campos do tipo escolhido e a taxa que vai valer, com a data dos índices.
export function wireInvestment(root, p){
  var f = invFields(root, p), block = qs('[data-inv="' + p + '"]', root);
  function sync(){
    var type = f.type.value, t = Inv.investmentType(type);
    qs('[data-inv-hint]', block).textContent = t.hint;
    qs('[data-inv-part="pct"]', block).hidden = ['caixinha', 'cdb', 'lci'].indexOf(type) < 0;
    qs('[data-inv-part="spread"]', block).hidden = type !== 'ipca';
    qs('[data-inv-part="rate"]', block).hidden = !!type && type !== 'fixa';
    qs('[data-inv-part="auto"]', block).hidden = !t.index;
    var idx = cachedIndexes() || Inv.REFERENCE_INDEXES, r = readInvestment(root, p, idx);
    qs('[data-inv-preview]', block).textContent = !type || r.error ? '' : type === 'nenhum' ? 'A previsão considera que o dinheiro não rende.' :
      'Hoje isso dá cerca de ' + Inv.fmtPct(r.yieldRate) + ' ao ano (antes do IR)' + (t.index ? (idx.reference ? ', com valores de referência de ' : ', com índices do Banco Central de ') + formatDateFull(idx.date) : '') + '.';
  }
  // Busca os índices de hoje só quando o tipo escolhido depende deles (uma vez por dia).
  var asked = false;
  function maybeFetch(){
    if (asked || !Inv.investmentType(f.type.value).index) return;
    asked = true;
    fetchIndexes().then(function(){ if (document.body.contains(block)) sync(); });
  }
  block.addEventListener('input', sync);
  block.addEventListener('change', function(){ sync(); maybeFetch(); });
  sync(); maybeFetch();
}
// Metas com "atualizar sozinho": recalcula a taxa com os índices de hoje (uma vez por sessão).
var ratesChecked = false;
export async function refreshGoalRates(){
  var auto = State.goals.filter(function(g){ return g.investment && g.investment.auto && !g.deletedAt; });
  if (ratesChecked || !auto.length) return;
  ratesChecked = true;
  var idx = await fetchIndexes();
  var changed = auto.filter(function(g){ var r = Inv.annualRate(g.investment, idx); return r !== g.yieldRate || g.rateDate !== idx.date; });
  if (!changed.length) return;
  await Store.updateMany(k(), 'goals', changed.map(function(g){ return {id: g.id, partial: {yieldRate: Inv.annualRate(g.investment, idx), rateDate: idx.date}}; }));
  changed.forEach(function(g){ g.yieldRate = Inv.annualRate(g.investment, idx); g.rateDate = idx.date; });
  renderGoals();
}

// Caixa "Sem valor alvo": esconde o campo do valor alvo.
function wireNoTarget(box, field){
  if (!box || !field) return;
  var sync = function(){ field.hidden = box.checked; };
  box.addEventListener('change', sync); sync();
}

export function goalFormBody(g){
  return '<div class="field"><label for="egName">Nome da meta</label><input id="egName" name="name" type="text" maxlength="50" value="' + escapeHtml(g.name) + '"></div>' +
    '<label class="check"><input type="checkbox" id="egNoTarget" name="noTarget"' + (Goals.hasTarget(g) ? '' : ' checked') + '> Sem valor alvo (só ir juntando o que der)</label>' +
    '<div class="field" id="egTargetField"' + (Goals.hasTarget(g) ? '' : ' hidden') + '><label for="egTarget">Valor alvo</label><span class="money-input"><span>R$</span><input id="egTarget" name="target" type="text" data-money autocomplete="off" inputmode="decimal" value="' + (Goals.hasTarget(g) ? g.targetAmount : '') + '"></span></div>' +
    '<div class="field"><label for="egCurrent">Já guardado</label><span class="money-input"><span>R$</span><input id="egCurrent" name="current" type="text" data-money autocomplete="off" inputmode="decimal" value="' + (g.currentAmount||0) + '"></span>' +
      '<span class="field-hint">Para registrar o que guardou ou rendeu, prefira “Guardar” e “Registrar rendimento”: com as datas, a previsão fica certa.</span></div>' +
    investmentFieldsHtml('eg', g) +
    '<label class="check"><input type="checkbox" id="egNoDate" name="noDate"' + (g.targetDate ? '' : ' checked') + '> Sem prazo (sem data para chegar)</label>' +
    '<div class="field" id="egDateField"' + (g.targetDate ? '' : ' hidden') + '><label for="egDate">Prazo</label><input id="egDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.targetDate||'') + '"></div>' +
    '<div class="field"><label for="egReminder">Me avise em</label><input id="egReminder" name="reminder" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.reminderDate||'') + '"></div>' +
    '<div class="field"><label for="egUrgency">Urgência</label><select id="egUrgency" name="urgency">' + optionsHtml(urgencyOptions(), urgencyOf(g)) + '</select></div>' +
    '<div class="field"><label for="egNote">Observação</label><textarea id="egNote" name="note" rows="3" maxlength="300">' + escapeHtml(g.note||'') + '</textarea></div>';
}

export async function editGoal(id){
  var g = findById(State.goals, id);
  await openModal({
    title: 'Editar meta', body: goalFormBody(g),
    onOpen: function(modal){ wireInvestment(modal, 'eg'); wireNoTarget(modal.querySelector('#egNoTarget'), modal.querySelector('#egTargetField')); wireNoTarget(modal.querySelector('#egNoDate'), modal.querySelector('#egDateField')); },
    onSubmit: async function(form){
      var inv = readInvestment(form, 'eg');
      if (inv.error) return inv;
      var noTarget = form.noTarget.checked;
      var v = {
        name: form.name.value.trim(), targetAmount: noTarget ? 0 : money(form.target.value), currentAmount: Math.max(0, money(form.current.value)),
        targetDate: form.noDate.checked ? null : (form.date.value || null), reminderDate: form.reminder.value || null, note: form.note.value.trim(), urgency: form.urgency.value,
        yieldRate: inv.yieldRate, investment: inv.investment, rateDate: inv.rateDate || null
      };
      if (!v.name || (!noTarget && !(v.targetAmount > 0))) return {error:'Informe o nome e um valor alvo maior que zero, ou marque “Sem valor alvo”.'};
      if (!validDateStr(v.targetDate) || !validDateStr(v.reminderDate)) return {error:'Use datas entre os anos de 1900 e 3000.'};
      // Mudou o “Já guardado” na mão: fica no histórico como ajuste (fora do cálculo do ritmo).
      var diff = money(v.currentAmount - Number(g.currentAmount || 0));
      if (diff) v.moves = Goals.goalMoves(g).concat([{id: uid(), date: todayKey(), amount: Math.abs(diff), kind: diff > 0 ? 'deposit' : 'withdraw', adjust: true}]);
      await Store.update(k(), 'goals', id, v);
      Object.assign(g, v);
      renderGoals(); renderDashboard();
      toast('Meta atualizada.');
    }
  });
}

// Guardar, registrar rendimento ou retirar: muda o saldo da meta e entra no histórico com a data.
export async function goalMove(id, kind, amount, extra){
  var g = findById(State.goals, id);
  var cur = Number(g.currentAmount || 0);
  if (kind === 'withdraw' && amount > cur + 0.001){ toast('Você só pode retirar até ' + fmtMoney(cur) + '.'); return false; }
  var newAmount = money(kind === 'withdraw' ? cur - amount : cur + amount);
  var moves = Goals.goalMoves(g).concat([Object.assign({id: uid(), date: todayKey(), amount: money(amount), kind: kind}, extra || {})]);
  await Store.update(k(), 'goals', g.id, {currentAmount: newAmount, moves: moves});
  g.currentAmount = newAmount; g.moves = moves;
  renderGoals(); renderDashboard();
  return true;
}
// Aviso de cuidado ao usar o dinheiro guardado numa meta para outra coisa: quanto ela cai e quanto leva para repor.
export function offGoalWarningHtml(g, amount){
  var imp = goalUseImpact(g, amount, todayKey());
  return '<strong>Cuidado:</strong> você está usando ' + fmtMoney(amount) + ' do que guardou para “' + escapeHtml(g.name) + '” em outra coisa. ' +
    (imp.shortfall > 0 ? 'Isso é mais do que há guardado (' + fmtMoney(imp.current) + '). ' :
      'A meta fica com ' + fmtMoney(imp.after) + (imp.hasTarget ? ' (de ' + imp.pctBefore + '% para ' + imp.pctAfter + '% do alvo)' : '') + '. ') +
    (imp.monthsToRefill ? 'No seu ritmo (' + fmtMoney(imp.pace) + ' por mês), repor leva cerca de ' + imp.monthsToRefill + (imp.monthsToRefill === 1 ? ' mês' : ' meses') + '. ' : 'Planeje como vai repor. ') +
    (imp.targetDate ? 'O prazo da meta (' + formatDateFull(imp.targetDate) + ') pode ficar apertado.' : '');
}
async function askGoalMove(id, kind){
  var g = findById(State.goals, id);
  var yieldKind = kind === 'yield';
  if (yieldKind){
    var r = await askAmount({title: 'Registrar rendimento', max: 0,
      message: 'Quanto “' + g.name + '” rendeu? Veja no extrato do banco ou da corretora quanto o dinheiro guardado rendeu desde a última vez.', label: 'Valor do rendimento', submitLabel: 'Registrar'});
    if (!r) return;
    if (await goalMove(id, kind, r.amount)) toast('Rendimento de ' + fmtMoney(r.amount) + ' registrado em “' + g.name + '”.');
    return;
  }
  // Retirada: diz para que foi. Para o objetivo da meta não tem aviso; para outra coisa, mostra o cuidado.
  var a = await openModal({
    title: 'Retirar dinheiro da meta', submitLabel: 'Retirar',
    body: '<p>Quanto você tirou de “' + escapeHtml(g.name) + '”? Hoje ela tem ' + fmtMoney(g.currentAmount || 0) + '.</p>' +
      '<div class="field"><label for="gwAmount">Valor retirado</label><span class="money-input"><span>R$</span><input id="gwAmount" name="amount" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<fieldset class="radio-group"><legend>Para que foi?</legend>' +
        '<label class="check"><input type="radio" name="purpose" value="meta" checked> Para o objetivo da meta (por exemplo, pagar a viagem)</label>' +
        '<label class="check"><input type="radio" name="purpose" value="outro"> Para outra coisa (fora do objetivo)</label></fieldset>' +
      '<p class="tip-box warn" id="gwWarn" aria-live="polite" hidden></p>',
    onOpen: function(modal){
      function sync(){
        var other = qs('input[name=purpose]:checked', modal).value === 'outro', v = money(qs('#gwAmount', modal).value), w = qs('#gwWarn', modal);
        w.hidden = !(other && v > 0);
        if (!w.hidden) w.innerHTML = offGoalWarningHtml(g, v);
      }
      modal.addEventListener('input', sync); modal.addEventListener('change', sync);
    },
    onSubmit: function(form){
      var v = money(form.amount.value);
      if (!(v > 0)) return {error: 'Informe um valor maior que zero.'};
      if (v > Number(g.currentAmount || 0) + 0.001) return {error: 'O valor não pode passar de ' + fmtMoney(g.currentAmount || 0) + '.'};
      return {amount: v, purpose: form.purpose.value};
    }
  });
  if (!a) return;
  if (await goalMove(id, kind, a.amount, a.purpose === 'outro' ? {purpose: 'outro'} : null)) toast(fmtMoney(a.amount) + ' retirados de “' + g.name + '”' + (a.purpose === 'outro' ? ', para outra coisa. Lembre de repor.' : '.'));
}

// Eventos de Planejar gastos e Metas.
export function wirePlanning(){
  document.getElementById('budgetPrev').addEventListener('click', function(){ State.budgetMonthOffset--; renderBudgets(); });
  document.getElementById('budgetNext').addEventListener('click', function(){ if (State.budgetMonthOffset < 1){ State.budgetMonthOffset++; renderBudgets(); } });
  document.getElementById('budgetNewCat').addEventListener('click', async function(){
    var id = await createCategory('expense');
    if (id){ State.budgetNewCats.push(id); populateCategorySelect(document.getElementById('txCategory').value); renderBudgets(); var inp = qs('[data-budget-cat="' + id + '"]'); if (inp) inp.focus(); }
  });
  document.getElementById('budgetManageCats').addEventListener('click', manageCategories);
  document.getElementById('goalGrid').addEventListener('click', function(e){
    var el;
    if ((el = e.target.closest('[data-goal-yield]'))) askGoalMove(el.getAttribute('data-goal-yield'), 'yield');
    if ((el = e.target.closest('[data-goal-withdraw]'))) askGoalMove(el.getAttribute('data-goal-withdraw'), 'withdraw');
    if ((el = e.target.closest('[data-goal-calendar]'))){
      var g = findById(State.goals, el.getAttribute('data-goal-calendar')), when = g.reminderDate || g.targetDate;
      window.open(calendarUrl('Grana Leve: meta “' + g.name + '”', when, 'Lembrete para guardar dinheiro na meta “' + g.name + '”. Faltam ' + fmtMoney(Math.max(0, g.targetAmount - (g.currentAmount||0))) + '.'), '_blank', 'noopener');
    }
  });

  document.getElementById('goalInvWrap').innerHTML = investmentFieldsHtml('goal', {});
  wireInvestment(document.getElementById('goalForm'), 'goal');
  wireNoTarget(document.getElementById('goalNoTarget'), document.getElementById('goalTargetField'));
  wireNoTarget(document.getElementById('goalNoDate'), document.getElementById('goalDateField'));
  document.getElementById('goalForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('goalName').value.trim();
    var noTarget = document.getElementById('goalNoTarget').checked;
    var target = noTarget ? 0 : money(document.getElementById('goalTarget').value);
    var date = document.getElementById('goalNoDate').checked ? '' : document.getElementById('goalDate').value;
    var reminder = document.getElementById('goalReminder').value;
    var note = document.getElementById('goalNote').value.trim();
    if (!name || (!noTarget && !(target > 0))){ toast('Informe o nome e o valor alvo da meta, ou marque “Sem valor alvo”.'); return; }
    if (!validDateStr(date) || !validDateStr(reminder)){ toast('Use datas entre os anos de 1900 e 3000.'); return; }
    var inv = readInvestment(e.target, 'goal');
    if (inv.error){ toast(inv.error); return; }
    var goal = {name:name, targetAmount:target, currentAmount:0, targetDate:date||null, reminderDate:reminder||null, note:note, urgency: document.getElementById('goalUrgency').value,
      yieldRate: inv.yieldRate, investment: inv.investment, rateDate: inv.rateDate || null, moves: [], deletedAt:null, createdAt:Date.now()};
    var saved = await Store.add(k(), 'goals', goal);
    State.goals.push(saved);
    e.target.reset();
    document.getElementById('goalTargetField').hidden = false; document.getElementById('goalDateField').hidden = false;
    qs('#goalInvType').dispatchEvent(new Event('change', {bubbles: true}));
    State.goalFilter = 'andamento';
    renderGoals(); renderDashboard();
    toast('Meta “' + name + '” criada.');
  });
}
