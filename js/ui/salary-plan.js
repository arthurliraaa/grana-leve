/*
 * Meu salário: a previsão do salário que se repete todo mês, com a regra de quando cai (dia do mês ou enésimo dia útil),
 * a pergunta “já caiu?” quando a data chega (para confirmar os valores e acrescentar sobreaviso, extras e descontos do mês)
 * e o acompanhamento da evolução (reajustes e o que foi recebido mês a mês). As contas ficam em domain/salary-plan.js.
 * A previsão é uma entrada de “Previstas” (forecasts) com o campo salary; o líquido vem da calculadora (salary-calc.js).
 */
import {todayKey, monthBounds, monthKeyOf, formatDateFull, formatDateBr, monthLabelOf, shiftMonthKey, validDateStr} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {payDate, ruleLabel, evolution, raises, withStep, monthName} from '../domain/salary-plan.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, escapeHtml, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {State, k, forecastOccurrences, sortTransactions} from './state.js';
import {accountSelectHtml, renderTransactionsTab} from './tx-list.js';
import {renderDashboard} from './home-tab.js';
import {openSalaryCalculator, savedSalary} from './salary-calc.js';

export function salaryForecast(){ return State.forecasts.filter(function(f){ return f.salary && f.salary.rule; })[0] || null; }

// Próximo salário a confirmar: o mês mais antigo (anterior ou atual) cuja data já chegou e que ainda não foi recebido.
export function salaryDue(){
  var f = salaryForecast();
  if (!f) return null;
  var cur = monthBounds(0).key, today = todayKey(), found = null;
  [shiftMonthKey(cur, -1), cur].forEach(function(key){
    if (found || key < monthKeyOf(f.date)) return;
    var occ = forecastOccurrences(key).filter(function(o){ return o.f.id === f.id; })[0];
    if (occ && occ.received === undefined && occ.date <= today) found = {f: f, occ: occ, key: key};
  });
  return found;
}
// Próximo salário (já com a data): o do mês atual, se ainda não caiu, ou o do mês que vem.
function salaryNext(){
  var f = salaryForecast();
  if (!f) return null;
  var cur = monthBounds(0).key, occ = forecastOccurrences(cur).filter(function(o){ return o.f.id === f.id; })[0];
  if (occ && occ.received === undefined) return {f: f, occ: occ};
  var nxt = forecastOccurrences(shiftMonthKey(cur, 1)).filter(function(o){ return o.f.id === f.id; })[0];
  return nxt ? {f: f, occ: nxt} : null;
}

// Registra o salário recebido: ganho nos lançamentos, previsão marcada como recebida e o mês guardado na evolução.
async function registerSalary(due, res){
  var f = due.f, key = due.key || monthKeyOf(due.occ.date), today = todayKey();
  var date = res.date && validDateStr(res.date) ? res.date : (due.occ.date > today ? today : due.occ.date);
  var tx = {type: 'income', amount: res.net, category: 'salario', date: date, description: f.description || 'Salário', paymentMethod: null, accountId: res.accountId, createdAt: Date.now()};
  var saved = await Store.add(k(), 'transactions', tx);
  State.transactions.unshift(saved); sortTransactions();
  var r = res.res, received = Object.assign({}, f.received || {}); received[key] = res.net;
  var plan = Object.assign({}, f.salary, {months: Object.assign({}, f.salary.months || {})});
  plan.months[key] = {gross: r.gross, net: res.net, extras: money(r.extras + r.bonuses), discounts: r.discounts, fgts: r.fgts || 0, date: date};
  var before = f.salary.steps || [], next = withStep(plan, key, r.gross, r.fixedNet);
  await Store.update(k(), 'forecasts', f.id, {received: received, salary: next});
  f.received = received; f.salary = next;
  renderDashboard(); renderTransactionsTab();
  var rs = raises(next).filter(function(x){ return x.from === key; })[0];
  toast('Salário de ' + fmtMoney(res.net) + ' registrado.' + (rs && next.steps.length > before.length ? ' Reajuste anotado: de ' + fmtMoney(rs.before) + ' para ' + fmtMoney(rs.after) + ' brutos (' + (rs.pct > 0 ? '+' : '') + String(rs.pct).replace('.', ',') + '%).' : ''));
}

// Pergunta se o salário já caiu: abre a calculadora com os valores guardados, para a pessoa acrescentar o que mudou no mês.
export async function confirmSalary(due){
  due = due || salaryDue();
  if (!due) return false;
  var today = todayKey(), f = due.f, key = due.key || monthKeyOf(due.occ.date);
  var res = await openSalaryCalculator({
    confirm: true, title: 'O salário de ' + monthLabelOf(key) + ' caiu?', submitLabel: 'Caiu: registrar', cancelLabel: 'Ainda não caiu',
    introHtml: '<p class="field-hint sc-confirm-intro">Previsto ' + ruleLabel(f.salary.rule) + ' (' + formatDateFull(due.occ.date) + '). Confira os valores deste mês: acrescente sobreaviso, horas extras ou ganhos, e ajuste descontos que mudaram, como a parte usada do plano de saúde.</p>',
    extraHtml: '<div class="sc-confirm">' + accountSelectHtml('scAcc', 'acc', 'Entrou em') +
      '<div class="field"><label for="scCaiu">Dia em que caiu</label><input id="scCaiu" name="caiuDate" type="date" min="1900-01-01" max="3000-12-31" value="' + (due.occ.date > today ? today : due.occ.date) + '"></div></div>'
  });
  if (!res){ setPref('salaryAskedOn', today); renderDashboard(); return false; }
  await registerSalary(due, res);
  return true;
}
// Ao abrir o app: se o salário deveria ter caído e ainda não foi confirmado, pergunta (uma vez por dia).
export function askSalaryIfDue(){
  if (getPrefs().salaryAskedOn === todayKey()) return;
  var due = salaryDue();
  if (due) setTimeout(function(){ if (!document.querySelector('#modalRoot .modal')) confirmSalary(due); }, 400);
}

/* ---------- Cartão no Início ---------- */

export function renderSalaryCard(){
  var el = document.getElementById('salaryCard');
  if (!el) return;
  var plan = salaryForecast(), calc = savedSalary(), due = salaryDue(), html = '';
  if (due){
    html = '<div class="salary-card-text"><strong>Seu salário deveria ter caído ' + (due.occ.date === todayKey() ? 'hoje' : 'em ' + formatDateBr(due.occ.date)) + '.</strong> Previsto ' + fmtMoney(due.occ.f.amount) + '. Já caiu? Confirme os valores do mês, com o que variou.</div>' +
      '<div class="card-actions"><button type="button" class="btn btn-primary btn-sm" data-salary-confirm>Já caiu</button><button type="button" class="btn btn-ghost btn-sm" data-salary-open>Meu salário</button></div>';
  } else if (plan){
    var nx = salaryNext();
    html = '<div class="salary-card-text"><strong>Meu salário</strong>' + (nx ? ' · próximo ' + ruleLabel(plan.salary.rule) + ': ' + formatDateFull(nx.occ.date) + ', ' + fmtMoney(nx.occ.f.amount) : '') + '</div>' +
      '<div class="card-actions"><button type="button" class="btn btn-ghost btn-sm" data-salary-open>Ver evolução e ajustar</button></div>';
  } else if (calc){
    html = '<div class="salary-card-text"><strong>Você calculou o seu salário líquido: ' + fmtMoney(calc.fixedNet) + ' por mês.</strong> Quer que ele apareça como previsão todo mês, com o dia em que cai?</div>' +
      '<div class="card-actions"><button type="button" class="btn btn-primary btn-sm" data-salary-open>Prever meu salário</button></div>';
  }
  el.hidden = !html;
  el.innerHTML = html;
}

/* ---------- Meu salário (configuração e evolução) ---------- */

function evolutionHtml(plan){
  var rows = evolution(plan), rs = raises(plan);
  if (!rows.length && !rs.length) return '<p class="field-hint">Quando você confirmar o primeiro salário, a evolução aparece aqui: quanto caiu em cada mês e os reajustes.</p>';
  var pct = function(v){ return v ? (v > 0 ? '+' : '') + String(v).replace('.', ',') + '%' : '–'; };
  return (rs.length ? '<ul class="sp-raises">' + rs.map(function(r){ return '<li><strong>Reajuste em ' + monthName(r.from) + ':</strong> bruto de ' + fmtMoney(r.before) + ' para ' + fmtMoney(r.after) + ' (' + pct(r.pct) + ')</li>'; }).join('') + '</ul>' : '') +
    (rows.length ? '<div class="table-scroll"><table class="data-table sp-evo"><thead><tr><th>Mês</th><th>Bruto</th><th>Líquido recebido</th><th>Variação</th></tr></thead><tbody>' +
      rows.slice().reverse().map(function(r){ return '<tr><td>' + escapeHtml(monthName(r.key)) + (r.raise ? ' <span class="pill">reajuste</span>' : '') + '</td><td class="tabular">' + fmtMoney(r.gross) + '</td><td class="tabular">' + fmtMoney(r.net) + (r.extras > 0 ? '<br><small class="tx-meta">com ' + fmtMoney(r.extras) + ' de extras</small>' : '') + '</td><td class="tabular">' + pct(r.netChange) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '');
}
function ruleHtml(rule){
  rule = rule || {type: 'workday', n: 5, saturday: true};
  var wd = rule.type === 'workday';
  return '<fieldset class="sc-disc sp-rule"><legend>Quando o salário cai</legend>' +
    '<label class="check"><input type="radio" name="rtype" value="workday"' + (wd ? ' checked' : '') + '> No <input class="sp-n" name="n" type="number" min="1" max="23" step="1" value="' + (rule.n || 5) + '" aria-label="Número do dia útil">º dia útil do mês</label>' +
    '<label class="check sp-sat"><input type="checkbox" name="sat"' + (rule.saturday !== false ? ' checked' : '') + '> Contar o sábado como dia útil (regra do pagamento de salário na CLT)</label>' +
    '<label class="check"><input type="radio" name="rtype" value="day"' + (!wd ? ' checked' : '') + '> Todo dia <input class="sp-n" name="day" type="number" min="1" max="31" step="1" value="' + (rule.day || 5) + '" aria-label="Dia do mês"></label>' +
    '<p class="field-hint">Feriados não entram na conta do dia útil: se cair num feriado, corrija o dia quando confirmar que o dinheiro entrou.</p></fieldset>';
}
function readRule(form){
  if (form.rtype.value === 'day') return {type: 'day', day: Math.min(31, Math.max(1, Math.floor(Number(form.day.value) || 1)))};
  return {type: 'workday', n: Math.min(23, Math.max(1, Math.floor(Number(form.n.value) || 1))), saturday: !!form.sat.checked};
}

export async function openSalaryPlan(presetRule){
  var f = salaryForecast(), calc = savedSalary();
  var calcHtml = function(c){ return c ? '<p><strong>Salário bruto ' + fmtMoney(c.gross) + '</strong> · líquido fixo estimado <strong>' + fmtMoney(c.fixedNet) + '</strong> por mês.</p>' : '<p class="field-hint">Antes, calcule o seu líquido: ele é o valor que vai aparecer como previsão todo mês.</p>'; };
  var r = await openModal({
    title: 'Meu salário', wide: true, submitLabel: f ? 'Salvar alterações' : 'Prever meu salário todo mês', cancelLabel: 'Fechar',
    body: '<div class="sc-body"><div id="spCalc">' + calcHtml(calc) + '<button type="button" class="btn btn-ghost btn-sm" data-sp-calc>' + (calc ? 'Recalcular o líquido' : 'Calcular o líquido do salário') + '</button></div>' +
      ruleHtml(presetRule || (f && f.salary.rule)) +
      (f ? '<section><h4>Evolução do salário</h4>' + evolutionHtml(f.salary) + '</section><button type="button" class="linklike sp-remove" data-sp-remove>Parar de prever o salário</button>' : '') + '</div>',
    onOpen: function(modal, close){
      var form = qs('form', modal);
      modal.addEventListener('click', function(e){
        // Só um popup por vez: fecha este, abre a calculadora e depois reabre este com a mesma regra.
        if (e.target.closest('[data-sp-calc]')) close({again: true, rule: readRule(form)});
        if (e.target.closest('[data-sp-remove]')) close({remove: true});
      });
    },
    onSubmit: function(form){
      if (!savedSalary()) return {error: 'Calcule o líquido do salário primeiro.'};
      return {rule: readRule(form)};
    }
  });
  if (!r || r === true) return;
  if (r.again){ await openSalaryCalculator({title: 'Calcular o salário líquido', submitLabel: 'Usar o líquido fixo (todo mês)'}); return openSalaryPlan(r.rule); }
  if (r.remove){
    if (!(await confirmAction({title: 'Parar de prever o salário?', message: 'A previsão do salário some dos próximos meses. Os salários já registrados continuam nos seus ganhos, mas a evolução guardada nesta previsão deixa de aparecer.', confirmLabel: 'Parar'}))) return openSalaryPlan();
    await Store.remove(k(), 'forecasts', f.id);
    State.forecasts = State.forecasts.filter(function(x){ return x.id !== f.id; });
    renderDashboard(); toast('Previsão do salário removida.');
    return;
  }
  var c = savedSalary(), cur = monthBounds(0).key;
  if (f){
    // Mudou o salário ou o líquido: vale a partir deste mês, ou do próximo se o deste mês já foi recebido (o recebido não muda).
    var from = f.received && f.received[cur] !== undefined ? shiftMonthKey(cur, 1) : cur;
    var plan = withStep(Object.assign({}, f.salary, {rule: r.rule}), from, c.gross, c.fixedNet);
    await Store.update(k(), 'forecasts', f.id, {salary: plan, date: payDate(r.rule, monthKeyOf(f.date))});
    f.salary = plan; f.date = payDate(r.rule, monthKeyOf(f.date));
  } else {
    var doc = {description: 'Salário', amount: c.fixedNet, date: payDate(r.rule, cur), recurring: true, category: 'salario', received: {}, createdAt: Date.now(),
      salary: {rule: r.rule, steps: [{from: cur, gross: c.gross, net: c.fixedNet}], months: {}}};
    var saved = await Store.add(k(), 'forecasts', doc);
    State.forecasts.push(saved);
  }
  renderDashboard();
  toast('Salário previsto ' + ruleLabel(r.rule) + '.');
  askSalaryIfDue();
}

export function wireSalaryPlan(){
  document.addEventListener('click', function(e){
    if (e.target.closest('[data-salary-open]')) openSalaryPlan();
    else if (e.target.closest('[data-salary-confirm]')) confirmSalary();
  });
}
