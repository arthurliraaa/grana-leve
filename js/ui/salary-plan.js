/*
 * Meu salário: a previsão do salário que se repete todo mês, com a regra de quando cai (dia do mês ou enésimo dia útil),
 * a pergunta “já caiu?” quando a data chega (para confirmar os valores e acrescentar sobreaviso, extras e descontos do mês)
 * e o acompanhamento da evolução (reajustes e o que foi recebido mês a mês). As contas ficam em domain/salary-plan.js.
 * A previsão é uma entrada de “Previstas” (forecasts) com o campo salary; o líquido vem da calculadora (salary-calc.js).
 */
import {todayKey, monthBounds, monthKeyOf, formatDateFull, formatDateBr, monthLabelOf, shiftMonthKey, validDateStr, parseDate} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {payDate, ruleLabel, evolution, raises, withStep, monthName} from '../domain/salary-plan.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, escapeHtml, toast} from './dom.js';
import {openModal, confirmAction, askAmount} from './modal.js';
import {State, k, forecastOccurrences, sortTransactions} from './state.js';
import {accountSelectHtml, renderTransactionsTab} from './tx-list.js';
import {renderDashboard} from './home-tab.js';
import {openSalaryCalculator, savedSalary, activeSalary, getWorkProfile, setWorkProfile, getJobs, activeJobId, jobName, useJob} from './salary-calc.js';
import {DEFAULT_JOB_ID} from '../domain/jobs.js';
import {netSalary, monthBonuses} from '../domain/salary.js';
import {openTxModal} from './tx-edit.js';

// Cada emprego pode ter a sua previsão de salário (f.salary.jobId; as antigas, sem jobId, são do primeiro emprego).
export function salaryForecasts(){ return State.forecasts.filter(function(f){ return f.salary && f.salary.rule; }); }
function jobIdOf(f){ return f.salary.jobId || DEFAULT_JOB_ID; }
export function salaryForecast(jobId){ var id = jobId || activeJobId(); return salaryForecasts().filter(function(f){ return jobIdOf(f) === id; })[0] || null; }
function labelOf(f){ return salaryForecasts().length > 1 ? (f.salary.jobName || jobName(jobIdOf(f)) || f.description) : ''; }

// O perfil da calculadora vive no aparelho (preferências), mas a previsão do salário sincroniza com a conta: ela leva uma
// cópia do perfil (plan.profile). Em outro aparelho, ou depois de limpar o navegador, a cópia mais nova volta para as preferências.
export function hydrateSalaryProfile(){
  salaryForecasts().forEach(function(f){
    var remote = f.salary.profile;
    if (!remote || !(Number(remote.gross) > 0)) return;
    var id = jobIdOf(f), local = getWorkProfile(id);
    if (!(Number(local.gross) > 0) || (Number(remote.updatedAt) || 0) > (Number(local.updatedAt) || 0)) setWorkProfile(remote, id, f.salary.jobName);
  });
}
function withProfile(plan, jobId){ return Object.assign({}, plan, {jobId: jobId, jobName: jobName(jobId), profile: getWorkProfile(jobId)}); }

// Próximo salário a confirmar (de qualquer emprego): o mês mais antigo (anterior ou atual) cuja data já chegou e que ainda não foi recebido.
// autoOnly: só os que a pessoa deixou perguntar sozinho (a caixa em “Meu salário”).
export function salaryDue(autoOnly){
  var cur = monthBounds(0).key, today = todayKey(), found = null;
  salaryForecasts().filter(function(f){ return !autoOnly || f.salary.ask !== false; }).forEach(function(f){
    [shiftMonthKey(cur, -1), cur].forEach(function(key){
      if (key < monthKeyOf(f.date)) return;
      var occ = forecastOccurrences(key).filter(function(o){ return o.f.id === f.id; })[0];
      if (occ && occ.received === undefined && occ.date <= today && (!found || occ.date < found.occ.date)) found = {f: f, occ: occ, key: key};
    });
  });
  return found;
}
// Próximo salário de uma previsão (já com a data): o do mês atual, se ainda não caiu, ou o do mês que vem.
function salaryNext(f){
  var cur = monthBounds(0).key, occ = forecastOccurrences(cur).filter(function(o){ return o.f.id === f.id; })[0];
  if (occ && occ.received === undefined) return {f: f, occ: occ};
  var nxt = forecastOccurrences(shiftMonthKey(cur, 1)).filter(function(o){ return o.f.id === f.id; })[0];
  return nxt ? {f: f, occ: nxt} : null;
}

// A primeira vez ainda não recebida, a partir do mês atual (olha até 3 meses): {f, occ, key} ou null. Serve para registrar à mão, antes da data.
function nextPending(f){
  var cur = monthBounds(0).key;
  for (var i = 0; i < 3; i++){
    var key = shiftMonthKey(cur, i), occ = forecastOccurrences(key).filter(function(o){ return o.f.id === f.id; })[0];
    if (occ && occ.received === undefined) return {f: f, occ: occ, key: key};
  }
  return null;
}
// No cartão do Início o botão do mês que vem só aparece perto da data (até 10 dias antes, quando um pagamento adiantado faz sentido), para ninguém
// registrar por engano; em “Meu salário” ele está sempre disponível.
var EARLY_DAYS = 10;
function cardPending(f){
  var p = nextPending(f);
  if (!p || p.key === monthBounds(0).key) return p;
  return (parseDate(p.occ.date).getTime() - parseDate(todayKey()).getTime()) / 86400000 <= EARLY_DAYS ? p : null;
}
// Nome do mês no botão quando a vez pendente não é a deste mês: “Já caiu (dezembro)”.
function monthSuffix(key){ return key === monthBounds(0).key ? '' : ' (' + monthLabelOf(key).split(' ')[0] + ')'; }

// Registra o salário recebido: ganho nos lançamentos, previsão marcada como recebida e o mês guardado na evolução.
async function registerSalary(due, res){
  var f = due.f, key = due.key || monthKeyOf(due.occ.date), today = todayKey();
  var date = res.date && validDateStr(res.date) ? res.date : (due.occ.date > today ? today : due.occ.date);
  var tx = {type: 'income', amount: res.net, category: 'salario', date: date, description: f.description || 'Salário', paymentMethod: null, accountId: res.accountId, createdAt: Date.now()};
  var saved = await Store.add(k(), 'transactions', tx);
  State.transactions.unshift(saved); sortTransactions();
  var r = res.res, received = Object.assign({}, f.received || {}); received[key] = res.net;
  var plan = Object.assign({}, f.salary, {months: Object.assign({}, f.salary.months || {})});
  plan.months[key] = {gross: r.gross, net: res.net, extras: money(Math.max(0, r.extras + r.bonuses - (r.separateTotal || 0) - (r.paidBeforeTotal || 0))), discounts: r.discounts, fgts: r.fgts || 0, date: date};
  var before = f.salary.steps || [], next = withProfile(withStep(plan, key, r.gross, r.fixedNet), jobIdOf(f));
  await Store.update(k(), 'forecasts', f.id, {received: received, salary: next});
  f.received = received; f.salary = next;
  await syncBenefits(jobIdOf(f));
  renderDashboard(); renderTransactionsTab();
  var rs = raises(next).filter(function(x){ return x.from === key; })[0];
  toast('Salário de ' + fmtMoney(res.net) + ' registrado.' + (rs && next.steps.length > before.length ? ' Reajuste anotado: de ' + fmtMoney(rs.before) + ' para ' + fmtMoney(rs.after) + ' brutos (' + (rs.pct > 0 ? '+' : '') + String(rs.pct).replace('.', ',') + '%).' : ''));
}

// Pergunta se o salário já caiu: abre a calculadora com os valores guardados, para a pessoa acrescentar o que mudou no mês.
export async function confirmSalary(due){
  hydrateSalaryProfile();
  due = due || salaryDue();
  if (!due) return false;
  var today = todayKey(), f = due.f, key = due.key || monthKeyOf(due.occ.date);
  useJob(jobIdOf(f));   // a calculadora abre com o perfil do emprego desta previsão
  var res = await openSalaryCalculator({
    confirm: true, paid: paidOf(f, key), title: 'O salário de ' + monthLabelOf(key) + (labelOf(f) ? ' (' + labelOf(f) + ')' : '') + ' caiu?', submitLabel: 'Caiu: registrar', cancelLabel: 'Ainda não caiu',
    introHtml: '<p class="field-hint sc-confirm-intro">Previsto ' + ruleLabel(f.salary.rule) + ' (' + formatDateFull(due.occ.date) + '). Confira os valores deste mês: acrescente sobreaviso, horas extras ou ganhos, e ajuste descontos que mudaram, como a parte usada do plano de saúde.</p>',
    extraHtml: '<div class="sc-confirm">' + accountSelectHtml('scAcc', 'acc', 'Entrou em') +
      '<div class="field"><label for="scCaiu">Dia em que caiu</label><input id="scCaiu" name="caiuDate" type="date" min="1900-01-01" max="3000-12-31" value="' + (due.occ.date > today ? today : due.occ.date) + '"></div></div>'
  });
  if (!res){ setPref('salaryAskedOn', today); renderDashboard(); return false; }
  await registerSalary(due, res);
  return true;
}
// Do botão “Já caiu” do cartão (cada previsão tem o seu).
export function confirmSalaryById(forecastId){
  var due = null, d = salaryDue();
  if (d && (!forecastId || d.f.id === forecastId)) due = d;
  else if (forecastId){
    var f = State.forecasts.filter(function(x){ return x.id === forecastId; })[0];
    due = f ? nextPending(f) : null;   // caiu antes da data (ou não é automático): a vez ainda não recebida
    if (!due){ toast('Este salário já está registrado nos próximos meses.'); return Promise.resolve(false); }
  }
  return confirmSalary(due || undefined);
}
// Ao abrir o app: se o salário deveria ter caído e ainda não foi confirmado, pergunta (uma vez por dia).
export function askSalaryIfDue(){
  if (getPrefs().salaryAskedOn === todayKey()) return;
  var due = salaryDue(true);
  if (due) setTimeout(function(){ if (!document.querySelector('#modalRoot .modal')) confirmSalary(due); }, 400);
}

// “Já recebi este mês, não conta”: marca o salário do mês como recebido sem lançar nada nos ganhos (a pessoa já lançou, ou nem quer lançar).
// Ele deixa de ser perguntado e de entrar nas contas do mês; vale a partir do mês seguinte.
async function skipMonth(f, key, amount){
  var received = Object.assign({}, f.received || {}); received[key] = money(amount);
  await Store.update(k(), 'forecasts', f.id, {received: received});
  f.received = received;
}
export async function skipSalaryById(forecastId){
  var f = State.forecasts.filter(function(x){ return x.id === forecastId; })[0], due = salaryDue(), key = due && due.f.id === forecastId ? due.key : monthBounds(0).key;
  if (!f) return;
  var occ = forecastOccurrences(key).filter(function(o){ return o.f.id === f.id; })[0];
  if (!occ || occ.received !== undefined) return;
  if (!(await confirmAction({title: 'Pular o salário de ' + monthLabelOf(key) + '?', message: 'Ele não será perguntado nem contado neste mês (por exemplo, porque você já o lançou ou recebeu antes de usar o app). A previsão continua valendo a partir do mês que vem.', confirmLabel: 'Pular este mês', danger: false}))) return;
  await skipMonth(f, key, occ.f.amount);
  renderDashboard(); renderTransactionsTab();
  toast('Salário de ' + monthLabelOf(key) + ' pulado. A previsão volta no mês que vem.');
}

// 13º salário: a pessoa escolhe a parcela na calculadora (que já abre na parte do 13º) e confirma valor, dia e conta. Não depende do salário do mês:
// pode ser registrado antes dele (a 1ª parcela costuma cair até 30/11 e a 2ª até 20/12). Vai para “Outros” e não para “Salário”, para não
// aumentar o “salário de costume” usado no simulador.
export async function registerThirteenth(){
  hydrateSalaryProfile();
  var res = await openSalaryCalculator({
    title: 'Registrar o 13º salário', open13: true, noSubmit: true, cancelLabel: 'Fechar',
    introHtml: '<p class="field-hint">Confira os meses trabalhados e toque na parcela que você recebeu ou vai receber (a 1ª vem até 30/11; a 2ª, até 20/12). Dá para registrar antes do salário do mês.</p>'
  });
  if (!res || (res.kind !== 'third1' && res.kind !== 'third2')) return false;
  var parcel = res.kind === 'third1' ? '1ª parcela' : '2ª parcela', today = todayKey(), year = today.slice(0, 4), desc = '13º salário · ' + parcel;
  var exists = State.transactions.some(function(t){ return t.type === 'income' && !t.reversal && t.description === desc && String(t.date).slice(0, 4) === year; });
  if (exists && !(await confirmAction({title: 'Já está registrado?', message: 'Você já tem “' + desc + '” em ' + year + '. Registrar de novo?', confirmLabel: 'Registrar de novo', danger: false}))) return false;
  var a = await askAmount({title: desc, message: 'Confirme quanto caiu (ou vai cair). O valor vai para os seus ganhos.', value: res.net, submitLabel: 'Registrar',
    extraHtml: accountSelectHtml('thAcc', 'acc', 'Entrou em') + '<div class="field"><label for="thDate">Dia em que caiu</label><input id="thDate" name="askdate" type="date" min="1900-01-01" max="3000-12-31" value="' + today + '"></div>'});
  if (!a) return false;
  var date = a.date && validDateStr(a.date) ? a.date : today;
  var tx = {type: 'income', amount: a.amount, category: 'outros_receita', date: date > today ? today : date, description: desc, paymentMethod: null, accountId: a.accountId, createdAt: Date.now()};
  var saved = await Store.add(k(), 'transactions', tx);
  State.transactions.unshift(saved); sortTransactions();
  renderDashboard(); renderTransactionsTab();
  toast('13º salário (' + parcel + ') de ' + fmtMoney(a.amount) + ' registrado.');
  return true;
}

// Do popup do + (único formulário no celular): a pessoa tocou em “É salário? Calcular o líquido”. Abre a calculadora e reabre o lançamento
// de ganho com o valor escolhido (salário do mês, ou uma parcela do 13º ou as férias, que não são “Salário”).
export async function salaryIntoPopup(draft){
  var res = await openSalaryCalculator(), d = Object.assign({}, draft, {type: 'income'});
  if (res){
    var kind = res.kind;
    d.amount = res.net;
    d.category = kind === 'fixed' || kind === 'month' ? 'salario' : 'outros_receita';
    d.description = d.description || (kind === 'third1' ? '13º salário · 1ª parcela' : kind === 'third2' ? '13º salário · 2ª parcela' : kind === 'vacation' ? 'Férias' : 'Salário');
  }
  openTxModal(d);
}

// Uma linha do cartão: nome (e um detalhe), valor à direita e a ação na ponta. Um grupo é um título com as linhas.
function row(title, detail, amount, action){
  return '<div class="sal-row"><div class="sal-main"><span>' + title + '</span>' + (detail ? '<small>' + detail + '</small>' : '') + '</div><strong class="sal-value tabular">' + fmtMoney(amount) + '</strong>' + (action ? '<div class="sal-act">' + action + '</div>' : '<div class="sal-act"></div>') + '</div>';
}
function group(title, rows){ return '<div class="sal-group"><p class="sal-group-title">' + title + '</p>' + rows + '</div>'; }

/* ---------- Benefícios que caem separado do salário ---------- */

function benefitsOf(jobId){ return State.forecasts.filter(function(f){ return f.benefit && f.benefit.jobId === jobId; }); }
// Cada ganho marcado como “cai separado do salário” vira uma previsão própria (Previstas), no dia dele: dá para registrar antes do salário com
// “Recebi”. Chamada ao salvar o salário e ao confirmar um mês: cria, atualiza ou apaga as previsões conforme a calculadora.
export async function syncBenefits(jobId, skipNow){
  var wanted = netSalary(getWorkProfile(jobId)).separate || [], have = benefitsOf(jobId), used = {}, cur = monthBounds(0).key, multi = getJobs().list.length > 1;
  for (var i = 0; i < wanted.length; i++){
    var w = wanted[i], desc = w.label + (multi ? ' · ' + jobName(jobId) : ''), meta = {jobId: jobId, type: w.type, label: w.label, day: w.day};
    var f = have.filter(function(x){ return !used[x.id] && x.benefit.type === w.type && x.benefit.label === w.label; })[0];
    if (f){
      used[f.id] = true;
      var date = payDate({type: 'day', day: w.day}, monthKeyOf(f.date));
      if (f.description !== desc || Number(f.amount) !== w.amount || f.date !== date || f.benefit.day !== w.day){
        await Store.update(k(), 'forecasts', f.id, {description: desc, amount: w.amount, date: date, benefit: meta});
        Object.assign(f, {description: desc, amount: w.amount, date: date, benefit: meta});
      }
    } else {
      var doc = {description: desc, amount: w.amount, date: payDate({type: 'day', day: w.day}, cur), recurring: true, category: 'outros_receita', received: {}, createdAt: Date.now(), benefit: meta};
      if (skipNow) doc.received[cur] = w.amount;
      State.forecasts.push(await Store.add(k(), 'forecasts', doc));
    }
  }
  for (var j = 0; j < have.length; j++){
    if (used[have[j].id]) continue;
    await Store.remove(k(), 'forecasts', have[j].id);
    State.forecasts = State.forecasts.filter(function(x){ return x.id !== have[j].id; });
  }
}
function benefitLines(){
  var cur = monthBounds(0).key;
  var list = State.forecasts.filter(function(f){ return f.benefit; }).map(function(f){
    var now = forecastOccurrences(cur).filter(function(o){ return o.f.id === f.id; })[0];
    return now ? {o: now, pend: cardPending(f)} : null;
  }).filter(Boolean).sort(function(a, b){ return a.o.date.localeCompare(b.o.date); });
  if (!list.length) return '';
  return group('Cai separado', list.map(function(item){
    var o = item.o, done = o.received !== undefined, pend = item.pend;
    return row(escapeHtml(o.f.description), (done ? 'recebido neste mês' : 'previsto para ' + formatDateBr(o.date)), done ? o.received : o.f.amount,
      (pend ? '<button type="button" class="btn btn-ghost btn-sm" data-fc-receive="' + escapeHtml(o.f.id) + '" data-fc-date="' + escapeHtml(pend.occ.date) + '">Recebi' + monthSuffix(pend.key) + '</button>' : '<span class="status-pill good">recebido</span>'));
  }).join(''));
}

/* ---------- Ganhos que vêm junto do salário, recebidos antes ---------- */

// O que já foi recebido antes naquele mês (guardado na previsão), só o que ainda existe nos ganhos: se a pessoa apagar o lançamento, volta a somar.
function paidOf(f, key){
  var list = (f.salary.paid || {})[key] || [];
  return list.filter(function(p){ return !p.txId || State.transactions.some(function(t){ return t.id === p.txId; }); });
}
// Os ganhos extras que normalmente entram no salário do mês (os que não caem separado), com a situação no mês key.
function extraItems(f, key){
  var profile = getWorkProfile(jobIdOf(f)), paid = paidOf(f, key).slice();
  return monthBonuses(profile, Number(profile.gross) || 0).map(function(b){
    var i = paid.map(function(p){ return p.type + '|' + p.label; }).indexOf(b.type + '|' + b.label), got = i >= 0 ? paid.splice(i, 1)[0] : null;
    return {type: b.type, label: b.label, amount: b.amount, varies: b.varies, got: got};
  });
}
// “Recebi antes”: registra o ganho agora e ele deixa de somar no “já caiu?” daquele mês.
export async function receiveExtra(forecastId, type, label){
  var f = State.forecasts.filter(function(x){ return x.id === forecastId; })[0];
  if (!f || !f.salary) return;
  hydrateSalaryProfile();
  var pend = nextPending(f);
  if (!pend){ toast('O salário já está registrado nos próximos meses.'); return; }
  var item = extraItems(f, pend.key).filter(function(x){ return x.type === type && x.label === label && !x.got; })[0];
  if (!item){ toast('Este ganho já foi registrado.'); return; }
  var today = todayKey(), a = await askAmount({title: 'Recebi: ' + label, message: 'Confirme quanto entrou. Ele não será somado de novo no salário de ' + monthLabelOf(pend.key) + '.', value: item.amount, submitLabel: 'Registrar',
    extraHtml: accountSelectHtml('exAcc', 'acc', 'Entrou em') + '<div class="field"><label for="exDate">Dia em que caiu</label><input id="exDate" name="askdate" type="date" min="1900-01-01" max="3000-12-31" value="' + today + '"></div>'});
  if (!a) return;
  var date = a.date && validDateStr(a.date) && a.date <= today ? a.date : today, many = salaryForecasts().length > 1;
  var tx = {type: 'income', amount: a.amount, category: 'outros_receita', date: date, description: label + (many ? ' · ' + jobName(jobIdOf(f)) : ''), paymentMethod: null, accountId: a.accountId, createdAt: Date.now()};
  var saved = await Store.add(k(), 'transactions', tx);
  State.transactions.unshift(saved); sortTransactions();
  var paid = Object.assign({}, f.salary.paid || {});
  paid[pend.key] = paidOf(f, pend.key).concat([{type: type, label: label, amount: item.amount, varies: item.varies, received: a.amount, txId: saved.id, date: date}]);
  var plan = Object.assign({}, f.salary, {paid: paid});
  await Store.update(k(), 'forecasts', f.id, {salary: plan});
  f.salary = plan;
  renderDashboard(); renderTransactionsTab();
  toast(label + ' de ' + fmtMoney(a.amount) + ' registrado. O salário de ' + monthLabelOf(pend.key) + ' não vai contá-lo de novo.');
}
// No cartão do salário e em “Meu salário”: os ganhos do mês pendente que vêm junto do salário, com “Recebi antes”.
function extraLines(f){
  var pend = nextPending(f);
  if (!pend) return '';
  var items = extraItems(f, pend.key);
  if (!items.length) return '';
  var month = monthLabelOf(pend.key).split(' ')[0], many = salaryForecasts().length > 1;
  return group('Vem junto do salário de ' + month + (many ? ' · ' + escapeHtml(f.salary.jobName || jobName(jobIdOf(f))) : ''), items.map(function(x){
    return row(escapeHtml(x.label), x.got ? 'recebido antes: fora deste salário' : '', x.got ? x.got.received : x.amount,
      x.got ? '<span class="status-pill good">recebido</span>' : '<button type="button" class="btn btn-ghost btn-sm" data-extra-got="' + escapeHtml(f.id) + '" data-extra-type="' + escapeHtml(x.type) + '" data-extra-label="' + escapeHtml(x.label) + '">Recebi antes</button>');
  }).join(''));
}

/* ---------- Cartão no Início ---------- */

// O botão do 13º aparece de outubro a dezembro, quando ele costuma cair.
function thirteenBtn(){ var m = Number(monthBounds(0).key.slice(5, 7)); return m >= 10 ? '<button type="button" class="btn btn-soft btn-sm" data-salary-13>Registrar o 13º</button>' : ''; }
export function renderSalaryCard(){
  var el = document.getElementById('salaryCard');
  if (!el) return;
  hydrateSalaryProfile();
  var plans = salaryForecasts(), calc = savedSalary(), due = salaryDue(), html = '';
  if (due){
    var who = labelOf(due.f);
    html = '<div class="salary-card-text"><strong>Seu salário' + (who ? ' (' + escapeHtml(who) + ')' : '') + ' deveria ter caído ' + (due.occ.date === todayKey() ? 'hoje' : 'em ' + formatDateBr(due.occ.date)) + '.</strong> Previsto ' + fmtMoney(due.occ.f.amount) + '. Já caiu? Confirme os valores do mês, com o que variou.</div>' +
      '<div class="card-actions"><button type="button" class="btn btn-primary btn-sm" data-salary-confirm="' + escapeHtml(due.f.id) + '">Já caiu</button><button type="button" class="btn btn-ghost btn-sm" data-salary-skip="' + escapeHtml(due.f.id) + '">Pular este mês</button><button type="button" class="btn btn-ghost btn-sm" data-salary-open="' + escapeHtml(jobIdOf(due.f)) + '">Meu salário</button>' + thirteenBtn() + '</div>';
  } else if (plans.length){
    html = '<h3 class="sal-title">' + (plans.length > 1 ? 'Meus salários' : 'Meu salário') + '</h3><div class="sal-group">' + plans.map(function(f){
      var nx = salaryNext(f), who = labelOf(f), pend = cardPending(f), name = who ? escapeHtml(who) : 'Salário';
      var action = pend ? '<button type="button" class="btn btn-primary btn-sm" data-salary-confirm="' + escapeHtml(f.id) + '">Já caiu' + monthSuffix(pend.key) + '</button>' : '';
      return nx ? row(name, 'próximo ' + ruleLabel(f.salary.rule) + ' · ' + formatDateFull(nx.occ.date), nx.occ.f.amount, action) : '<div class="sal-row"><div class="sal-main"><span>' + name + '</span><small>sem próximo salário previsto</small></div></div>';
    }).join('') + '</div>' +
      '<div class="card-actions"><button type="button" class="btn btn-ghost btn-sm" data-salary-open="' + escapeHtml(jobIdOf(plans[0])) + '">Ver evolução e ajustar</button>' + thirteenBtn() + '</div>';
  } else if (calc){
    html = '<div class="salary-card-text"><strong>Você calculou o seu salário líquido: ' + fmtMoney(calc.fixedNet) + ' por mês' + (calc.count > 1 ? ' (' + calc.count + ' empregos somados)' : '') + '.</strong> Quer que ele apareça como previsão todo mês, com o dia em que cai?</div>' +
      '<div class="card-actions"><button type="button" class="btn btn-primary btn-sm" data-salary-open>Prever meu salário</button></div>';
  }
  if (html) html = html.replace('<div class="card-actions">', plans.map(extraLines).join('') + benefitLines() + '<div class="card-actions">');
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

// jobId: de qual emprego (padrão: o ativo da calculadora). Com mais de um emprego, o seletor troca o emprego e reabre a tela.
export async function openSalaryPlan(presetRule, jobId){
  hydrateSalaryProfile();
  if (jobId && jobId !== activeJobId()) useJob(jobId);
  var f = salaryForecast(), calc = activeSalary(), jobs = getJobs(), multi = jobs.list.length > 1, myJob = activeJobId();
  var sep = netSalary(getWorkProfile(myJob)).separate || [];
  var calcHtml = function(c){ return c ? '<p><strong>Salário bruto ' + fmtMoney(c.gross) + '</strong> · líquido fixo estimado <strong>' + fmtMoney(c.fixedNet) + '</strong> por mês.</p>' +
    (sep.length ? '<p class="field-hint">Cai separado (vira previsão própria, no dia dele, para registrar antes do salário): ' + sep.map(function(x){ return escapeHtml(x.label) + ' ' + fmtMoney(x.amount) + ' (dia ' + x.day + ')'; }).join(', ') + '.</p>' : '') : '<p class="field-hint">Antes, calcule o líquido: ele é o valor que vai aparecer como previsão todo mês.</p>'; };
  var jobSel = multi ? '<div class="field"><label for="spJob">Emprego</label><select id="spJob">' + jobs.list.map(function(j){ return '<option value="' + escapeHtml(j.id) + '"' + (j.id === myJob ? ' selected' : '') + '>' + escapeHtml(j.name) + '</option>'; }).join('') + '</select></div>' : '';
  // O salário deste mês ainda não foi recebido (ou ainda não há previsão): dá para dizer que já foi recebido e que só vale do mês que vem em diante.
  var curKey0 = monthBounds(0).key, occNow = f ? forecastOccurrences(curKey0).filter(function(o){ return o.f.id === f.id; })[0] : null;
  var skipHtml = (!f || (occNow && occNow.received === undefined)) ? '<label class="check sp-skip"><input type="checkbox" name="skipNow"> O salário deste mês eu já recebi: não perguntar nem contar, só a partir do mês que vem</label>' : '';
  var r = await openModal({
    title: multi ? 'Meu salário · ' + jobName(myJob) : 'Meu salário', wide: true, submitLabel: f ? 'Salvar alterações' : 'Prever meu salário todo mês', cancelLabel: 'Fechar',
    body: '<div class="sc-body">' + jobSel + '<div id="spCalc">' + calcHtml(calc) + '<button type="button" class="btn btn-ghost btn-sm" data-sp-calc>' + (calc ? 'Recalcular o líquido' : 'Calcular o líquido do salário') + '</button></div>' +
      ruleHtml(presetRule || (f && f.salary.rule)) +
      '<label class="check sp-ask"><input type="checkbox" name="autoask"' + (!f || f.salary.ask !== false ? ' checked' : '') + '> Perguntar “já caiu?” sozinho quando a data chegar</label>' +
      '<p class="field-hint sp-ask-hint">Desmarcado, o app não abre a pergunta: você registra pelo botão “Já caiu” quando o dinheiro entrar.</p>' + skipHtml +
      (f && extraLines(f) ? '<section class="sp-13"><h4>Recebeu algum ganho antes?</h4><p class="field-hint">O que você registrar aqui não é somado de novo quando o salário cair.</p>' + extraLines(f) + '</section>' : '') +
      (f && nextPending(f) ? '<section class="sp-13"><h4>Caiu antes da data?</h4><p class="field-hint">Registre quando o dinheiro entrar, sem esperar o app perguntar.</p><button type="button" class="btn btn-soft btn-sm" data-sp-got>Registrar que caiu' + monthSuffix(nextPending(f).key) + '</button></section>' : '') +
      '<section class="sp-13"><h4>13º salário</h4><p class="field-hint">Pode ser registrado antes do salário do mês: a 1ª parcela costuma cair até 30/11 e a 2ª até 20/12.</p>' +
        '<button type="button" class="btn btn-soft btn-sm" data-sp-13>Registrar o 13º salário</button></section>' +
      (f ? '<section><h4>Evolução do salário</h4>' + evolutionHtml(f.salary) + '</section><button type="button" class="linklike sp-remove" data-sp-remove>Parar de prever este salário</button>' : '') + '</div>',
    onOpen: function(modal, close){
      var form = qs('form', modal);
      modal.addEventListener('click', function(e){
        // Só um popup por vez: fecha este, abre a calculadora e depois reabre este com a mesma regra.
        if (e.target.closest('[data-sp-calc]')) close({again: true, rule: readRule(form)});
        if (e.target.closest('[data-sp-remove]')) close({remove: true});
        if (e.target.closest('[data-sp-13]')) close({thirteenth: true});
        if (e.target.closest('[data-sp-got]')) close({got: true});
        var ex = e.target.closest('[data-extra-got]');
        if (ex) close({extra: {id: ex.getAttribute('data-extra-got'), type: ex.getAttribute('data-extra-type'), label: ex.getAttribute('data-extra-label')}});
      });
      modal.addEventListener('change', function(e){ if (e.target.id === 'spJob') close({job: e.target.value, rule: readRule(form)}); });
    },
    onSubmit: function(form){
      if (!activeSalary()) return {error: 'Calcule o líquido do salário primeiro.'};
      return {rule: readRule(form), skipNow: !!(form.skipNow && form.skipNow.checked), ask: !!(form.autoask && form.autoask.checked)};
    }
  });
  if (!r || r === true) return;
  if (r.thirteenth){ await registerThirteenth(); return; }
  if (r.got){ await confirmSalaryById(f.id); return; }
  if (r.extra){ await receiveExtra(r.extra.id, r.extra.type, r.extra.label); return; }
  if (r.job){ useJob(r.job); return openSalaryPlan(); }
  if (r.again){ await openSalaryCalculator({title: 'Calcular o salário líquido', submitLabel: 'Usar o líquido fixo (todo mês)'}); return openSalaryPlan(r.rule, activeJobId()); }
  if (r.remove){
    if (!(await confirmAction({title: 'Parar de prever este salário?', message: 'A previsão do salário some dos próximos meses. Os salários já registrados continuam nos seus ganhos, mas a evolução guardada nesta previsão deixa de aparecer.', confirmLabel: 'Parar'}))) return openSalaryPlan();
    await Store.remove(k(), 'forecasts', f.id);
    State.forecasts = State.forecasts.filter(function(x){ return x.id !== f.id; });
    var extra = benefitsOf(jobIdOf(f));
    for (var bi = 0; bi < extra.length; bi++){ await Store.remove(k(), 'forecasts', extra[bi].id); }
    State.forecasts = State.forecasts.filter(function(x){ return extra.indexOf(x) < 0; });
    renderDashboard(); toast('Previsão do salário removida.');
    return;
  }
  var c = activeSalary(), cur = monthBounds(0).key, jid = activeJobId();
  if (f){
    // Mudou o salário ou o líquido: vale a partir deste mês, ou do próximo se o deste mês já foi recebido (o recebido não muda).
    if (r.skipNow && !(f.received && f.received[cur] !== undefined)) await skipMonth(f, cur, c.fixedNet);
    var from = f.received && f.received[cur] !== undefined ? shiftMonthKey(cur, 1) : cur;
    var plan = withProfile(withStep(Object.assign({}, f.salary, {rule: r.rule, ask: r.ask}), from, c.gross, c.fixedNet), jid);
    await Store.update(k(), 'forecasts', f.id, {salary: plan, date: payDate(r.rule, monthKeyOf(f.date))});
    f.salary = plan; f.date = payDate(r.rule, monthKeyOf(f.date));
    await syncBenefits(jid, r.skipNow);
  } else {
    var many = getJobs().list.length > 1;
    var doc = {description: many ? 'Salário · ' + jobName(jid) : 'Salário', amount: c.fixedNet, date: payDate(r.rule, cur), recurring: true, category: 'salario', received: {}, createdAt: Date.now(),
      salary: {rule: r.rule, ask: r.ask, steps: [{from: cur, gross: c.gross, net: c.fixedNet}], months: {}, jobId: jid, jobName: jobName(jid), profile: getWorkProfile(jid)}};
    var saved = await Store.add(k(), 'forecasts', doc);
    State.forecasts.push(saved);
    if (r.skipNow) await skipMonth(saved, cur, c.fixedNet);
    await syncBenefits(jid, r.skipNow);
  }
  renderDashboard(); renderTransactionsTab();
  toast('Salário previsto ' + ruleLabel(r.rule) + '.' + (r.skipNow ? ' O deste mês não conta: vale a partir do mês que vem.' : '') + (r.ask ? '' : ' O app não vai perguntar sozinho: use “Já caiu”.'));
  askSalaryIfDue();
}
