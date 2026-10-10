/*
 * Planejar gastos e metas.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {toDateKey, todayKey, parseDate, formatDateFull, validDateStr, monthBounds, monthLabelOf} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import {isPersonal, myShare} from '../domain/transactions.js';

import {statusForPct} from '../domain/budgets.js';
import {urgencyOf, byUrgency} from '../domain/urgency.js';

import {Store} from '../data/store.js';
import {qs, qsa, escapeHtml, optionsHtml, icon, toast} from './dom.js';
import {openModal} from './modal.js';
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
  list.innerHTML = expenseCats().map(function(c){
    var catTx = monthTx.filter(function(t){ return t.category === c.id; });
    var limit = budgetLimit(mb.key, c.id);
    var spent = sum(catTx, myShare);
    var pct = limit > 0 ? spent/limit : 0;
    var status = limit > 0 ? statusForPct(pct) : 'good';
    var barColor = status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)';
    return '<div class="budget-row">' +
      '<div class="budget-top">' +
        '<span class="budget-cat">' + catBadge(c.id, 'expense') + escapeHtml(c.label)+'</span>' +
        '<span class="money-input sm"><span>R$</span><input class="tabular" type="number" min="0" step="10" max="99999999" data-budget-cat="'+escapeHtml(c.id)+'" value="'+(limit||'')+'" placeholder="'+(locked ? '—' : 'Sem limite')+'"'+(locked ? ' disabled' : '')+' aria-label="Quanto quero gastar com '+escapeHtml(c.label)+'"></span>' +
      '</div>' +
      (limit > 0 ?
        '<div class="progress"><span style="width:'+Math.min(100,pct*100)+'%; background:'+barColor+'"></span></div>' +
        '<div class="budget-top"><span class="budget-figs tabular">'+fmtMoney(spent)+' de '+fmtMoney(limit)+(limit > spent ? ' · restam ' + fmtMoney(limit-spent) : '')+'</span><span class="status-pill '+status+'">'+statusLabel[status]+'</span></div>'
        : (spent > 0 ? '<span class="budget-figs tabular">Gasto no mês: '+fmtMoney(spent)+(locked ? '' : ' (digite ao lado quanto quer gastar)')+'</span>' : '')
      ) +
      (catTx.length ? '<details class="budget-details"><summary>Ver com o que gastou (' + catTx.length + ')</summary>' + catTx.map(txRowHtml).join('') + '</details>' : '') +
      '</div>';
  }).join('');

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
  grid.innerHTML = goals.map(function(g){
    var status = goalStatus(g);
    var pct = g.targetAmount > 0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0;
    var remindDate = g.reminderDate || g.targetDate;
    var actions;
    if (status === 'excluidas'){
      actions = '<button class="btn btn-ghost btn-sm" type="button" data-goal-restore="'+g.id+'">Restaurar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-goal-purge="'+g.id+'">Apagar de vez</button>';
    } else {
      actions = (status === 'concluidas' ? '<span class="status-pill good">Meta concluída</span>' :
          '<form class="deposit-form" data-goal-deposit="'+g.id+'"><span class="money-input sm"><span>R$</span><input type="number" step="0.01" min="0.01" max="99999999" name="amount" placeholder="Valor" aria-label="Valor para guardar"></span><button class="btn btn-primary btn-sm" type="submit">Guardar</button></form>') +
        '<button class="btn btn-ghost btn-sm" type="button" data-goal-edit="'+g.id+'">Editar</button>' +
        (remindDate ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(calendarUrl('Grana Leve: meta “' + g.name + '”', remindDate, 'Lembrete para guardar dinheiro na meta “' + g.name + '”. Faltam ' + fmtMoney(Math.max(0, g.targetAmount - (g.currentAmount||0))) + '.')) + '">' + icon('calendar') + 'Google Agenda</a>' : '') +
        '<button class="btn btn-ghost btn-sm" type="button" disabled title="Em breve: lembretes pelo WhatsApp">' + icon('chat') + 'WhatsApp (em breve)</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-goal-del="'+g.id+'">Excluir</button>';
    }
    return '<div class="goal-card">' +
      '<div class="budget-top"><h4>'+escapeHtml(g.name)+'</h4><span class="card-tags">' + (status === 'naobatidas' ? '<span class="status-pill critical">prazo vencido</span>' : '') +
        (status === 'excluidas' ? '' : urgencySelectHtml('goals', g, g.name)) + '</span></div>' +
      '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--brand)"></span></div>' +
      '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' de '+fmtMoney(g.targetAmount)+'</span><span>'+Math.round(pct*100)+'%</span></div>' +
      '<div class="meta-line">' +
        (g.targetDate ? '<span>Prazo: '+formatDateFull(g.targetDate)+'</span>' : '<span>Sem prazo</span>') +
        (g.reminderDate ? '<span>Me avise em: '+formatDateFull(g.reminderDate)+'</span>' : '') +
      '</div>' +
      (g.note ? '<div class="note">'+escapeHtml(g.note)+'</div>' : '') +
      '<div class="card-actions">' + actions + '</div></div>';
  }).join('');
}

export function goalFormBody(g){
  return '<div class="field"><label for="egName">Nome da meta</label><input id="egName" name="name" type="text" maxlength="50" value="' + escapeHtml(g.name) + '"></div>' +
    '<div class="field"><label for="egTarget">Valor alvo</label><span class="money-input"><span>R$</span><input id="egTarget" name="target" type="number" step="0.01" min="1" max="99999999" value="' + g.targetAmount + '"></span></div>' +
    '<div class="field"><label for="egCurrent">Já guardado</label><span class="money-input"><span>R$</span><input id="egCurrent" name="current" type="number" step="0.01" min="0" max="99999999" value="' + (g.currentAmount||0) + '"></span></div>' +
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
        targetDate: form.date.value || null, reminderDate: form.reminder.value || null, note: form.note.value.trim(), urgency: form.urgency.value
      };
      if (!v.name || !(v.targetAmount > 0)) return {error:'Informe o nome e um valor alvo maior que zero.'};
      if (!validDateStr(v.targetDate) || !validDateStr(v.reminderDate)) return {error:'Use datas entre os anos de 1900 e 3000.'};
      await Store.update(k(), 'goals', id, v);
      Object.assign(g, v);
      renderGoals(); renderDashboard();
      toast('Meta atualizada.');
    }
  });
}

// Eventos de Planejar gastos e Metas.
export function wirePlanning(){
  document.getElementById('budgetPrev').addEventListener('click', function(){ State.budgetMonthOffset--; renderBudgets(); });
  document.getElementById('budgetNext').addEventListener('click', function(){ if (State.budgetMonthOffset < 1){ State.budgetMonthOffset++; renderBudgets(); } });
  document.getElementById('budgetNewCat').addEventListener('click', async function(){
    var id = await createCategory('expense');
    if (id){ populateCategorySelect(document.getElementById('txCategory').value); renderBudgets(); var inp = qs('[data-budget-cat="' + id + '"]'); if (inp) inp.focus(); }
  });
  document.getElementById('budgetManageCats').addEventListener('click', manageCategories);

  document.getElementById('goalForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('goalName').value.trim();
    var target = money(document.getElementById('goalTarget').value);
    var date = document.getElementById('goalDate').value;
    var reminder = document.getElementById('goalReminder').value;
    var note = document.getElementById('goalNote').value.trim();
    if (!name || !(target > 0)){ toast('Informe nome e valor alvo da meta.'); return; }
    if (!validDateStr(date) || !validDateStr(reminder)){ toast('Use datas entre os anos de 1900 e 3000.'); return; }
    var goal = {name:name, targetAmount:target, currentAmount:0, targetDate:date||null, reminderDate:reminder||null, note:note, urgency: document.getElementById('goalUrgency').value, deletedAt:null, createdAt:Date.now()};
    var saved = await Store.add(k(), 'goals', goal);
    State.goals.push(saved);
    e.target.reset();
    State.goalFilter = 'andamento';
    renderGoals(); renderDashboard();
    toast('Meta “' + name + '” criada.');
  });
}
