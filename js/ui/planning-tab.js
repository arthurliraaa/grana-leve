/*
 * Planejar gastos e metas.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {toDateKey, todayKey, parseDate, formatDateBr, formatDateFull, validDateStr, monthBounds, monthLabelOf} from '../domain/dates.js';
import * as Goals from '../domain/goals.js';
import {money, fmtMoney} from '../domain/money.js';
import {findById, sum, uid} from '../domain/util.js';
import {isPersonal, myShare} from '../domain/transactions.js';

import {statusForPct} from '../domain/budgets.js';
import {urgencyOf, byUrgency} from '../domain/urgency.js';

import {Store} from '../data/store.js';
import {qs, qsa, escapeHtml, optionsHtml, icon, toast} from './dom.js';
import {askAmount, openModal} from './modal.js';
import {moreMenu} from './commitments-tab.js';
import {renderDashboard, txRowHtml} from './home-tab.js';
import {State, budgetLimit, budgetLocked, catBadge, catLabel, expenseCats, k, setBudget, txForMonth, urgencyOptions, urgencySelectHtml} from './state.js';
import {manageCategories} from './tx-edit.js';
import {createCategory, populateCategorySelect} from './tx-list.js';

/* ---------- Planejar gastos (aba "limites") ---------- */
export var statusLabel = {good:'sob controle', warning:'quase no limite', critical:'estourou'};

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
  // Mostra as categorias com limite, gasto no mês ou uso nos últimos 3 meses; as outras ficam
  // recolhidas em “Outras categorias” (sem histórico nenhum, mostra todas para começar o plano).
  var since = monthBounds(State.budgetMonthOffset - 2).key + '-01';
  var recent = {};
  State.transactions.forEach(function(t){ if (t.type === 'expense' && t.date >= since) recent[t.category] = true; });
  var cats = expenseCats();
  var shown = cats.filter(function(c){ return recent[c.id] || budgetLimit(mb.key, c.id) > 0 || State.budgetNewCats.indexOf(c.id) >= 0; });
  if (!shown.length) shown = cats;
  var hidden = cats.filter(function(c){ return shown.indexOf(c) < 0; });
  list.innerHTML = shown.map(budgetRowHtml).join('') +
    (hidden.length ? '<details class="budget-more"><summary>Outras categorias (' + hidden.length + '): ' + escapeHtml(hidden.map(function(c){ return c.label; }).join(', ')) + '</summary>' +
      hidden.map(budgetRowHtml).join('') + '</details>' : '');
  function budgetRowHtml(c){
    var catTx = monthTx.filter(function(t){ return t.category === c.id; });
    var limit = budgetLimit(mb.key, c.id);
    var spent = sum(catTx, myShare);
    var pct = limit > 0 ? spent/limit : 0;
    var status = limit > 0 ? statusForPct(pct) : 'good';
    var barColor = status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)';
    return '<div class="budget-row">' +
      '<div class="budget-top">' +
        '<span class="budget-cat">' + catBadge(c.id, 'expense') + escapeHtml(c.label)+'</span>' +
        '<span class="money-input sm"><span>R$</span><input class="tabular" type="text" data-money autocomplete="off" inputmode="decimal" data-budget-cat="'+escapeHtml(c.id)+'" value="'+(limit||'')+'" placeholder="'+(locked ? '—' : 'Sem limite')+'"'+(locked ? ' disabled' : '')+' aria-label="Quanto quero gastar com '+escapeHtml(c.label)+'"></span>' +
      '</div>' +
      (limit > 0 ?
        '<div class="progress"><span style="width:'+Math.min(100,pct*100)+'%; background:'+barColor+'"></span></div>' +
        '<div class="budget-top"><span class="budget-figs tabular">'+fmtMoney(spent)+' de '+fmtMoney(limit)+(limit > spent ? ' · restam ' + fmtMoney(limit-spent) : '')+'</span><span class="status-pill '+status+'">'+statusLabel[status]+'</span></div>'
        : (spent > 0 ? '<span class="budget-figs tabular">Gasto no mês: '+fmtMoney(spent)+(locked ? '' : ' (digite ao lado quanto quer gastar)')+'</span>' : '')
      ) +
      (catTx.length ? '<details class="budget-details"><summary>Ver com o que gastou (' + catTx.length + ')</summary>' + catTx.map(txRowHtml).join('') + '</details>' : '') +
      '</div>';
  }

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
function goalCardHtml(g){
  var status = goalStatus(g);
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
    '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--brand)"></span></div>' +
    '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' de '+fmtMoney(g.targetAmount)+'</span><span>'+Math.round(pct*100)+'%</span></div>' +
    (s.earned || g.yieldRate ? '<div class="goal-yield">' + icon('trend-up') + '<span>' + (s.earned ? 'Rendeu <strong class="tabular">' + fmtMoney(s.earned) + '</strong>' + (s.deposited > 0 ? ' (' + pctText(s.earned / s.deposited * 100) + '% sobre o que você guardou)' : '') : 'Ainda sem rendimento registrado') +
      (g.yieldRate ? ' · taxa de ' + pctText(Number(g.yieldRate)) + '% ao ano' : '') + '</span></div>' : '') +
    '<div class="meta-line">' +
      (g.targetDate ? '<span>Prazo: '+formatDateFull(g.targetDate)+'</span>' : '<span>Sem prazo</span>') +
      (g.reminderDate ? '<span>Me avise em: '+formatDateFull(g.reminderDate)+'</span>' : '') +
    '</div>' +
    (status === 'andamento' || status === 'naobatidas' ? goalForecastHtml(g) : '') +
    (g.note ? '<div class="note">'+escapeHtml(g.note)+'</div>' : '') +
    (hasMoves ? '<details class="budget-details pay-log"><summary>Movimentações (' + s.moves.length + ')</summary>' + s.moves.slice().reverse().map(function(m){
      return '<div class="list-row"><div class="tx-main"><div class="tx-desc tabular">' + (m.kind === 'withdraw' ? '− ' : '+ ') + fmtMoney(m.amount) + '</div>' +
        '<div class="tx-meta">' + (m.date ? formatDateBr(m.date) + ' · ' : '') + (m.legacy ? 'já guardado antes' : m.adjust ? 'ajuste na edição' : MOVE_LABEL[m.kind]) + '</div></div></div>';
    }).join('') + '</details>' : '') +
    '<div class="card-actions">' + actions + '</div></div>';
}

export function goalFormBody(g){
  return '<div class="field"><label for="egName">Nome da meta</label><input id="egName" name="name" type="text" maxlength="50" value="' + escapeHtml(g.name) + '"></div>' +
    '<div class="field"><label for="egTarget">Valor alvo</label><span class="money-input"><span>R$</span><input id="egTarget" name="target" type="text" data-money autocomplete="off" inputmode="decimal" value="' + g.targetAmount + '"></span></div>' +
    '<div class="field"><label for="egCurrent">Já guardado</label><span class="money-input"><span>R$</span><input id="egCurrent" name="current" type="text" data-money autocomplete="off" inputmode="decimal" value="' + (g.currentAmount||0) + '"></span>' +
      '<span class="field-hint">Para registrar o que guardou ou rendeu, prefira “Guardar” e “Registrar rendimento”: com as datas, a previsão fica certa.</span></div>' +
    '<div class="field"><label for="egYield">Rendimento ao ano (opcional)</label><span class="money-input"><input id="egYield" name="yield" type="text" inputmode="decimal" autocomplete="off" maxlength="6" value="' + (g.yieldRate ? pctText(g.yieldRate) : '') + '" placeholder="Ex: 10"><span>%</span></span>' +
      '<span class="field-hint">Onde o dinheiro fica guardado. Ex.: poupança, cerca de 6%; CDB que paga 100% do CDI, cerca de 10%. Vazio: não rende.</span></div>' +
    '<div class="field"><label for="egDate">Prazo</label><input id="egDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.targetDate||'') + '"></div>' +
    '<div class="field"><label for="egReminder">Me avise em</label><input id="egReminder" name="reminder" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.reminderDate||'') + '"></div>' +
    '<div class="field"><label for="egUrgency">Urgência</label><select id="egUrgency" name="urgency">' + optionsHtml(urgencyOptions(), urgencyOf(g)) + '</select></div>' +
    '<div class="field"><label for="egNote">Observação</label><textarea id="egNote" name="note" rows="3" maxlength="300">' + escapeHtml(g.note||'') + '</textarea></div>';
}

export async function editGoal(id){
  var g = findById(State.goals, id);
  await openModal({
    title: 'Editar meta', body: goalFormBody(g),
    onSubmit: async function(form){
      var v = {
        name: form.name.value.trim(), targetAmount: money(form.target.value), currentAmount: Math.max(0, money(form.current.value)),
        targetDate: form.date.value || null, reminderDate: form.reminder.value || null, note: form.note.value.trim(), urgency: form.urgency.value,
        yieldRate: parsePercent(form.yield.value)
      };
      if (!v.name || !(v.targetAmount > 0)) return {error:'Informe o nome e um valor alvo maior que zero.'};
      if (!validDateStr(v.targetDate) || !validDateStr(v.reminderDate)) return {error:'Use datas entre os anos de 1900 e 3000.'};
      if (Number.isNaN(v.yieldRate)) return {error:'O rendimento ao ano vai de 0 a 100 (por exemplo, 10 ou 6,5).'};
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
export async function goalMove(id, kind, amount){
  var g = findById(State.goals, id);
  var cur = Number(g.currentAmount || 0);
  if (kind === 'withdraw' && amount > cur + 0.001){ toast('Você só pode retirar até ' + fmtMoney(cur) + '.'); return false; }
  var newAmount = money(kind === 'withdraw' ? cur - amount : cur + amount);
  var moves = Goals.goalMoves(g).concat([{id: uid(), date: todayKey(), amount: money(amount), kind: kind}]);
  await Store.update(k(), 'goals', g.id, {currentAmount: newAmount, moves: moves});
  g.currentAmount = newAmount; g.moves = moves;
  renderGoals(); renderDashboard();
  return true;
}
async function askGoalMove(id, kind){
  var g = findById(State.goals, id);
  var yieldKind = kind === 'yield';
  var r = await askAmount({title: yieldKind ? 'Registrar rendimento' : 'Retirar dinheiro da meta', max: yieldKind ? 0 : Number(g.currentAmount || 0),
    message: yieldKind ? 'Quanto “' + g.name + '” rendeu? Veja no extrato do banco ou da corretora quanto o dinheiro guardado rendeu desde a última vez.' :
      'Quanto você tirou de “' + g.name + '”? Hoje ela tem ' + fmtMoney(g.currentAmount || 0) + '.',
    label: yieldKind ? 'Valor do rendimento' : 'Valor retirado', submitLabel: yieldKind ? 'Registrar' : 'Retirar'});
  if (!r) return;
  var v = r.amount;
  if (await goalMove(id, kind, v)) toast(yieldKind ? 'Rendimento de ' + fmtMoney(v) + ' registrado em “' + g.name + '”.' : fmtMoney(v) + ' retirados de “' + g.name + '”.');
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

  document.getElementById('goalForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('goalName').value.trim();
    var target = money(document.getElementById('goalTarget').value);
    var date = document.getElementById('goalDate').value;
    var reminder = document.getElementById('goalReminder').value;
    var note = document.getElementById('goalNote').value.trim();
    if (!name || !(target > 0)){ toast('Informe nome e valor alvo da meta.'); return; }
    if (!validDateStr(date) || !validDateStr(reminder)){ toast('Use datas entre os anos de 1900 e 3000.'); return; }
    var rate = parsePercent(document.getElementById('goalYield').value);
    if (Number.isNaN(rate)){ toast('O rendimento ao ano vai de 0 a 100 (por exemplo, 10 ou 6,5).'); return; }
    var goal = {name:name, targetAmount:target, currentAmount:0, targetDate:date||null, reminderDate:reminder||null, note:note, urgency: document.getElementById('goalUrgency').value, yieldRate: rate, moves: [], deletedAt:null, createdAt:Date.now()};
    var saved = await Store.add(k(), 'goals', goal);
    State.goals.push(saved);
    e.target.reset();
    State.goalFilter = 'andamento';
    renderGoals(); renderDashboard();
    toast('Meta “' + name + '” criada.');
  });
}
