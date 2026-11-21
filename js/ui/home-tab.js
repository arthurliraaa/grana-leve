/*
 * Início: previsões de entrada, números do mês, cartões de resumo e últimos lançamentos.
 * Os dados ficam em dash-data.js, os gráficos em dash-charts.js e os popups de detalhe em dash-details.js
 * (tudo reexportado aqui, para quem importa daqui continuar funcionando).
 */
import {todayKey, monthKeyOf, formatDateBr, formatDateFull, validDateStr, monthBounds} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import {isForOther, isRefund, isReversal, reversalsOf, myShare} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import {statusForPct} from '../domain/budgets.js';
import {recvDueByMonth, recvRemaining} from '../domain/receivables.js';
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, escapeHtml, icon, optionsHtml, toast} from './dom.js';
import {openModal, askAmount} from './modal.js';
import {generateMonthlyReport, invoicePdfButtonsHtml} from './reports.js';
import {renderGranaStrip, renderNewsCard} from './mascot.js';
import {deltaBadge, renderBackupBanner, routeOf, setForecastOpen, showTab, withPart} from './shell.js';
import {State, URGENCY_MARK, accountBalance, catBadge, catLabel, expenseCats, forecastOccurrences, k, sortTransactions, totalAccountsBalance, voucherOf} from './state.js';
import {accountSelectHtml, fold, renderTransactionsTab} from './tx-list.js';
import {DASH_MAX, DASH_MIN, dashMonth, dashboardFigures, installmentProgress, monthProjection, plannedTotal, projectCats, spendFigures, upcomingCommitments} from './dash-data.js';
import {openAllBanksDetail, openAllInvoicesDetail, openBankDetail, openCategoryDetail, openCompareDetail, openInvoiceDetail} from './dash-details.js';
import {renderBarChart, renderCreditDebit, renderDonut, renderInvoiceSplit} from './dash-charts.js';
export * from './dash-data.js';
export * from './dash-details.js';
export * from './dash-charts.js';

/* ---------- Previsões de entrada ---------- */

export function renderForecasts(){
  var cur = monthBounds(0);
  document.getElementById('forecastMonthLabel').textContent = cur.label;
  var occ = forecastOccurrences(cur.key);
  var list = document.getElementById('forecastList');
  var pending = occ.filter(function(o){ return o.received === undefined; });
  var receivedOcc = occ.filter(function(o){ return o.received !== undefined; });
  var badge = document.getElementById('forecastCount');
  badge.textContent = pending.length;
  badge.hidden = !pending.length;
  // O nome lido pelo leitor de tela começa pelo texto visível (“Previstas 1 a receber”).
  document.getElementById('forecastSr').textContent = pending.length ? ' a receber' : ' (nenhuma pendente)';
  if (!occ.length){ list.innerHTML = '<p class="empty-state" style="padding:14px">Nenhuma entrada prevista para este mês.</p>'; return; }
  list.innerHTML = pending.concat(receivedOcc).map(function(o){
    var done = o.received !== undefined;
    return '<div class="list-row">' +
      '<span class="tx-cat-dot" style="background:' + (done ? 'var(--good)' : 'var(--accent)') + '"></span>' +
      '<div class="tx-main"><div class="tx-desc">' + escapeHtml(o.f.description) + (o.f.recurring ? ' <span class="pill">todo mês</span>' : '') + '</div>' +
      '<div class="tx-meta">' + (done ? 'Recebido · ' : 'Previsto para ') + formatDateFull(o.date) + '</div></div>' +
      '<span class="tx-amount income tabular">' + fmtMoney(done ? o.received : o.f.amount) + '</span>' +
      '<div class="row-actions">' +
        (done ? '<span class="status-pill good">recebido</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-fc-receive="' + o.f.id + '" data-fc-date="' + o.date + '">Recebi</button>') +
        '<button class="tx-del" type="button" data-fc-del="' + o.f.id + '" aria-label="Excluir previsão" title="Excluir">' + icon('trash') + '</button>' +
      '</div></div>';
  }).join('');
}

// Cartão do salário no Início. A parte do salário (calculadora, plano, 13º…) só é baixada quando há algo a mostrar:
// um perfil calculado ou uma previsão de salário. Quem não usa isso nunca baixa.
export function hasSalaryData(){ return !!getPrefs().workProfile || State.forecasts.some(function(f){ return f.salary && f.salary.rule; }); }
export function renderSalaryNotice(){
  var el = document.getElementById('salaryCard');
  if (!el) return;
  if (!hasSalaryData()){ el.hidden = true; el.innerHTML = ''; return; }
  withPart('salary', function(m){ m.renderSalaryCard(); });
}

export async function receiveForecast(id, date){
  var f = findById(State.forecasts, id);
  if (!f) return;
  // O salário previsto com regra própria passa pela confirmação com os valores do mês (extras, descontos).
  if (f.salary && f.salary.rule){ var key0 = monthKeyOf(date), occ0 = forecastOccurrences(key0).filter(function(o){ return o.f.id === f.id; })[0]; if (occ0){ withPart('salary', function(m){ m.confirmSalary({f: f, occ: occ0, key: key0}); }); return; } }
  var r = await askAmount({title:'Registrar recebimento', message:'Confirme quanto entrou de “' + f.description + '”. O valor vai para os seus ganhos.', value: f.amount, submitLabel:'Registrar', extraHtml: accountSelectHtml('askAcc', 'acc', 'Entrou em')});
  if (!r) return;
  var key = monthKeyOf(date);
  var tx = {type:'income', amount:r.amount, category: f.category || 'salario', date: date > todayKey() ? todayKey() : date, description: f.description, paymentMethod:null, accountId: r.accountId, createdAt: Date.now()};
  var saved = await Store.add(k(), 'transactions', tx);
  State.transactions.unshift(saved); sortTransactions();
  var received = Object.assign({}, f.received || {}); received[key] = r.amount;
  await Store.update(k(), 'forecasts', id, {received: received});
  f.received = received;
  renderDashboard(); renderTransactionsTab();
  toast('Ganho de ' + fmtMoney(r.amount) + ' registrado.');
}
// Linha “rótulo ........ valor” dos quadros (big = valor em destaque, para os saldos).
export function two(label, value, cls, big){ return '<span class="tr' + (big ? ' big' : '') + '"><span class="tr-l">' + label + '</span><strong class="tr-v tabular ' + (cls || '') + '">' + (typeof value === 'string' ? value : fmtMoney(value)) + '</strong></span>'; }
export function renderStatTiles(){
  var sp = spendFigures(), f = sp.f, t = f.t;
  function tile(label, value, cls, sub){
    return '<div class="tile"><span class="tile-lbl">' + label + '</span><span class="tile-val tabular ' + (cls||'') + '">' + fmtMoney(value) + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';
  }
  // A receber: em destaque o que vence neste mês; o total fica menor.
  var cur = monthBounds(0).key, recvMonth = sumMoney(State.receivables, function(r){ return r.forgiven ? 0 : recvDueByMonth(r, cur); });
  // Dívidas (Eu devo): valor original, já pago e o que falta. Parcelas do cartão em quadro próprio.
  var debtsOpen = State.debts.filter(function(d){ return Number(d.totalAmount || 0) - Number(d.paidAmount || 0) > 0.004; });
  var debtOrig = sumMoney(debtsOpen, function(d){ return d.totalAmount; }), debtPaid = sumMoney(debtsOpen, function(d){ return d.paidAmount || 0; });
  // Neste mês: o que entrou (e o que há disponível nas contas), o que gastou, o que falta pagar e o saldo.
  // Saldo = o que está disponível nas contas menos o que ainda falta pagar (o que já foi pago, como uma
  // fatura quitada, já saiu do disponível e não é descontado de novo). Sem contas cadastradas, ganhos − gastos.
  var othersOn = sp.others > 0;
  var month = tile('Ganhos do mês', t.incomeDone, '', (sp.hasAcc ? two('Nas contas hoje', sp.avail) : '') + (f.expectedIncome > 0.004 ? two('Esperado ainda', f.expectedIncome) : '')) +
    tile('Gastos do mês', sp.total, '', two('Seus', sp.mine) + (othersOn ? two('Outras pessoas', sp.others) : '')) +
    tile('Falta pagar', sp.left, sp.left > 0 ? '' : 'pos', sp.left > 0 ? (sp.leftOthers > 0.004 || sp.others > 0.004 ? two('Desse total, seu', sp.leftMine) + two('Outras pessoas', sp.leftOthers) : '') : 'tudo pago neste mês') +
    (Math.abs(sp.saldoAll - sp.saldoMine) < 0.005 ? tile('Saldo do mês', sp.saldoMine, sp.saldoMine < 0 ? 'neg' : 'pos') :
      '<div class="tile"><span class="tile-lbl">Saldo do mês <button type="button" class="info-i" data-explain="devolver" aria-label="O que significam os dois saldos?">i</button></span><span class="tile-sub">' +
      two('Se ninguém devolver', sp.saldoAll, sp.saldoAll < 0 ? 'neg-text' : 'pos-text', true) +
      two('Se te devolverem', sp.saldoMine, sp.saldoMine < 0 ? 'neg-text' : 'pos-text', true) + '</span></div>');
  var goalsAlive = State.goals.filter(function(g){ return !g.deletedAt; });
  var goalsMissing = sumMoney(goalsAlive.filter(function(g){ return Number(g.targetAmount) > 0; }), function(g){ return Math.max(0, Number(g.targetAmount || 0) - Number(g.currentAmount || 0)); });
  var owing = State.receivables.filter(function(r){ return !r.forgiven && recvRemaining(r) > 0.004; });
  var people = {}; owing.forEach(function(r){ people[String(r.person || '').trim().toLowerCase()] = 1; });
  var nPeople = Object.keys(people).length;
  var now = tile('Guardado nas metas', f.savedInGoals, '', goalsAlive.length ? two(goalsAlive.length === 1 ? 'Meta' : 'Metas', String(goalsAlive.length)) + two('Falta para completar', goalsMissing) : 'nenhuma meta criada') +
    tile('Dívidas: falta pagar', f.debtRemaining, '', debtsOpen.length ? two(debtsOpen.length === 1 ? 'Dívida em “Eu devo”' : 'Dívidas em “Eu devo”', String(debtsOpen.length)) + two('Valor original', debtOrig) + two('Já pago', debtPaid) : 'nenhuma dívida em aberto') +
    tile('A receber neste mês', recvMonth, '', f.toReceive > 0 ? two('Total a receber', f.toReceive) + two(nPeople === 1 ? 'Pessoa' : 'Pessoas', String(nPeople)) : 'Ninguém te deve nada');
  document.getElementById('statTiles').innerHTML =
    '<p class="tiles-group">Neste mês <span>realizado até hoje</span></p><div class="stat-tiles stat-tiles-auto">' + month + '</div>' +
    '<p class="tiles-group">Agora</p><div class="stat-tiles stat-tiles-auto">' + now + '</div>';
}
function parcelRowHtml(p){
  var pct = p.total > 0 ? Math.round(100 * p.done / p.total) : 0;
  return '<a class="parcel-row" href="#/' + routeOf(p.go) + '" data-go="' + p.go + '">' +
    '<span class="parcel-top"><strong>' + escapeHtml(p.title) + '</strong><span class="tabular">' + (p.kind === 'receber' ? 'faltam receber ' : 'faltam ') + fmtMoney(p.leftAmount) + '</span></span>' +
    '<span class="progress" role="img" aria-label="' + p.done + ' de ' + p.total + ' parcelas ' + (p.kind === 'receber' ? 'recebidas' : 'pagas') + '"><span style="width:' + pct + '%; background:' + (p.kind === 'receber' ? 'var(--brand)' : 'var(--good)') + '"></span></span>' +
    '<span class="parcel-meta">' + escapeHtml(p.where) + ' · <strong>' + p.done + ' de ' + p.total + '</strong> ' + (p.kind === 'receber' ? 'recebidas' : 'pagas') + ' · faltam ' + p.left + ' de ' + fmtMoney(p.per) + '</span></a>';
}
// Filtros da janela de parcelas: quem (todas, só minhas, terceiros ou uma pessoa) e em que ponto
// estão (começando: até 1 paga; perto do fim: faltam até 2 ou 1/4; longe do fim: falta mais da metade
// e não está perto do fim).
export var PARCEL_STAGES = [
  {id: 'todas', label: 'Todas'},
  {id: 'inicio', label: 'Primeira parcela'},
  {id: 'perto', label: 'Perto do fim'},
  {id: 'longe', label: 'Longe do fim'}
];
export function filterParcels(list, who, stage){
  return list.filter(function(p){
    var people = (p.people || []).map(function(n){ return fold(n); });
    if (who === 'minhas' && people.length) return false;
    if (who === 'terceiros' && !people.length) return false;
    if (who && who.indexOf('p:') === 0 && people.indexOf(who.slice(2)) < 0) return false;
    var near = p.left <= Math.max(2, Math.ceil(p.total / 4));
    if (stage === 'inicio') return p.done <= 1;
    if (stage === 'perto') return near;
    if (stage === 'longe') return !near && p.left > p.total / 2;
    return true;
  });
}
// Quadro do Início (antes de “Últimos lançamentos”): resumo e as 3 primeiras; tocar abre a janela.
export function renderParcels(){
  var card = document.getElementById('parcelsCard'), parcels = installmentProgress();
  card.hidden = !parcels.length;
  if (!parcels.length){ card.innerHTML = ''; return; }
  var pay = parcels.filter(function(p){ return p.kind === 'pagar'; });
  card.innerHTML = '<div class="card-head"><h3><button type="button" class="linklike parcels-title" data-parcels-open>Parcelas em andamento</button></h3>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-parcels-open>Ver todas e filtrar</button></div>' +
    (pay.length ? '<p class="card-sub">Falta pagar <strong class="tabular">' + fmtMoney(sumMoney(pay, function(p){ return p.leftAmount; })) + '</strong> em ' + sum(pay, function(p){ return p.left; }) + ' parcelas (' + pay.length + (pay.length === 1 ? ' compra ou dívida' : ' compras e dívidas') + ').</p>' : '') +
    '<div class="parcel-grid">' + parcels.slice(0, 3).map(parcelRowHtml).join('') + '</div>';
}
export async function openParcels(){
  var all = installmentProgress(), names = {};
  all.forEach(function(p){ (p.people || []).forEach(function(n){ names[fold(n)] = n; }); });
  var whoOpts = [{id: '', label: 'Todas as pessoas'}, {id: 'minhas', label: 'Só minhas'}, {id: 'terceiros', label: 'De terceiros (todas)'}]
    .concat(Object.keys(names).sort().map(function(k){ return {id: 'p:' + k, label: names[k]}; }));
  await openModal({
    title: 'Parcelas em andamento', wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<div class="parcel-filters"><div class="field"><label for="pfWho">Pessoa ou terceiro</label><select id="pfWho">' + optionsHtml(whoOpts, '') + '</select></div>' +
        '<fieldset class="chip-group"><legend>Situação</legend>' + PARCEL_STAGES.map(function(st, i){
          return '<label class="chip-radio"><input type="radio" name="pfStage" value="' + st.id + '"' + (i ? '' : ' checked') + '><span>' + st.label + '</span></label>';
        }).join('') + '</fieldset></div>' +
      '<p class="tx-meta" id="pfCount" aria-live="polite"></p><div class="parcel-grid parcel-grid-modal" id="pfList"></div>',
    onOpen: function(modal){
      function draw(){
        var stage = (qs('input[name=pfStage]:checked', modal) || {}).value || 'todas';
        var list = filterParcels(all, qs('#pfWho', modal).value, stage);
        var pay = list.filter(function(p){ return p.kind === 'pagar'; });
        qs('#pfCount', modal).textContent = list.length + (list.length === 1 ? ' item' : ' itens') + (pay.length ? ' · falta pagar ' + fmtMoney(sumMoney(pay, function(p){ return p.leftAmount; })) : '');
        qs('#pfList', modal).innerHTML = list.length ? list.map(parcelRowHtml).join('') : '<p class="empty-state">Nada com esse filtro.</p>';
      }
      modal.addEventListener('change', draw);
      // Tocar numa parcela fecha a janela e abre a área dela.
      qs('#pfList', modal).addEventListener('click', function(e){
        var a = e.target.closest('[data-go]');
        if (!a) return;
        e.preventDefault();
        qs('.modal-x', modal).click();
        showTab(a.getAttribute('data-go'));
      });
      draw();
    }
  });
}
// Linha do topo do Início: a situação do mês numa frase.
export function monthStatusHtml(){
  var sp = spendFigures(), f = sp.f, t = f.t;
  function m(v){ return '<strong class="tabular">' + fmtMoney(v) + '</strong>'; }
  if (!t.incomeDone && !t.expenseDone && !sp.others && !f.expectedIncome && !f.billsPending && !t.expenseScheduled)
    return (sp.hasAcc ? 'Você tem ' + m(sp.avail) + ' nas contas. ' : '') + 'Comece anotando o que entra e o que sai neste mês: o resumo aparece aqui.';
  function sal(v){ return '<strong class="tabular ' + (v < 0 ? 'neg-text' : 'pos-text') + '">' + fmtMoney(v) + '</strong>'; }
  // Frase curta: o que entrou e saiu, quanto há nas contas e o saldo. O segundo saldo só aparece
  // quando há gasto de outras pessoas (“se te devolverem”).
  var two2 = Math.abs(sp.saldoAll - sp.saldoMine) >= 0.005;
  var out = 'Neste mês entraram ' + m(t.incomeDone) + ' e saíram ' + m(sp.total) + (sp.others > 0.004 ? ' (' + m(sp.mine) + ' seus)' : '') + '. ' +
    (sp.hasAcc ? 'Você tem ' + m(sp.avail) + ' nas contas' + (sp.left > 0.004 ? ' e ainda faltam ' + m(sp.left) + ' para pagar, então sobram ' : ' e não falta pagar nada, então sobram ') : 'Saldo do mês: ') +
    sal(sp.saldoAll) + (two2 ? ', ou ' + sal(sp.saldoMine) + ' se te devolverem' : '') + '.' +
    (two2 ? ' <button type="button" class="info-i" data-explain="devolver" aria-label="O que é “se te devolverem”?">i</button>' : '');
  if (sp.saldoMine < 0) out += ' <span class="neg-text">Atenção: o mês fecha no vermelho.</span>';
  else if (sp.saldoAll < 0) out += ' Fica negativo até te devolverem.';
  if (!sp.hasAcc && f.balanceEnd !== f.balanceDone) out += ' Previsão para o fim do mês: ' + sal(f.balanceEnd) + '.';
  else if (sp.hasAcc && Math.abs(sp.endAll - sp.saldoAll) >= 0.005) out += ' Com o que ainda vai entrar (' + m(f.expectedIncome) + '), termina o mês com ' + sal(sp.endAll) + '.';
  return out;
}
export function sumCard(n, iconName, title, value, valueCls, sub, extra, details){
  var open = !!State.sumOpen[n];
  return '<article class="sum-card" aria-labelledby="sumT' + n + '">' +
    '<div class="sum-head"><span class="sum-icon" aria-hidden="true">' + icon(iconName) + '</span><h3 id="sumT' + n + '">' + title + '</h3>' +
      '<button type="button" class="sum-more" data-sum-more="' + n + '" aria-expanded="' + open + '" aria-controls="sumD' + n + '" aria-label="' + (open ? 'Esconder' : 'Ver') + ' detalhes de ' + title + '" title="Detalhes">' + icon('plus') + '</button></div>' +
    '<p class="sum-value tabular ' + (valueCls || '') + '">' + value + '</p>' +
    (sub ? '<p class="sum-sub">' + sub + '</p>' : '') + (extra || '') +
    '<div class="sum-details" id="sumD' + n + '"' + (open ? '' : ' hidden') + '>' + details + '</div>' +
    '</article>';
}
export function detailRow(label, value, cls){ return '<div class="sum-row"><span>' + label + '</span><strong class="tabular ' + (cls || '') + '">' + value + '</strong></div>'; }
export function goLink(tab, text){ return '<a class="sum-link" href="#/' + routeOf(tab) + '" data-go="' + tab + '">' + text + ' →</a>'; }

// Primeiros passos (conta nova): banco, primeiro lançamento e limite por categoria. Some quando os três
// estão feitos ou quando a pessoa esconde.
export function renderFirstSteps(){
  var el = document.getElementById('firstSteps');
  var steps = [
    {done: State.accounts.length + State.cards.length > 0, title: 'Cadastre seu banco', text: 'O saldo da conta e, se tiver, o cartão de crédito.', label: 'Cadastrar banco', attr: 'data-go="cartoes"'},
    {done: State.transactions.length > 0, title: 'Lance o primeiro gasto ou ganho', text: 'Pelo botão +, ou escrevendo “gastei 30 no mercado”.', label: 'Lançar agora', attr: 'data-first-tx'},
    {done: plannedTotal(monthBounds(0).key) > 0, title: 'Defina quanto quer gastar', text: 'Um limite por categoria, para o app avisar antes de passar.', label: 'Planejar gastos', attr: 'data-go="limites"'}
  ];
  var done = steps.filter(function(x){ return x.done; }).length, next = steps.filter(function(x){ return !x.done; })[0];
  el.hidden = done === steps.length || !!getPrefs().firstStepsOff;
  if (el.hidden){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="fs-head"><h3>Primeiros passos</h3><span class="fs-count">' + done + ' de ' + steps.length + '</span>' +
      '<button type="button" class="linklike" data-first-hide>Esconder</button></div>' +
    '<span class="fs-bar" role="img" aria-label="' + done + ' de ' + steps.length + ' passos feitos"><span style="width:' + Math.round(100 * done / steps.length) + '%"></span></span>' +
    '<ol class="fs-list">' + steps.map(function(x, i){
      return '<li class="' + (x.done ? 'done' : x === next ? 'next' : '') + '"><span class="fs-dot" aria-hidden="true">' + (x.done ? icon('check') : i + 1) + '</span>' +
        '<span class="fs-txt"><strong>' + x.title + '</strong><small>' + (x.done ? 'Feito.' : x.text) + '</small></span>' +
        (x.done ? '<span class="sr-only">Feito</span>' : '<button type="button" class="btn ' + (x === next ? 'btn-primary' : 'btn-ghost') + ' btn-sm" ' + x.attr + '>' + x.label + '</button>') + '</li>';
    }).join('') + '</ol>';
}
export function renderSummary(){
  renderFirstSteps();
  var f = dashboardFigures(), t = f.t, cur = monthBounds(0).key, sp0 = spendFigures();
  // 1. Quanto tenho
  var hasAcc = State.accounts.length > 0;
  var have = hasAcc ? totalAccountsBalance() : f.balanceDone;
  var c1 = sumCard(1, 'wallet', 'Quanto tenho', fmtMoney(have), have < 0 ? 'neg-text' : '',
    hasAcc ? 'Disponível hoje em ' + State.accounts.length + (State.accounts.length > 1 ? ' contas' : ' conta') : 'Saldo do mês: ganhos menos gastos até hoje',
    // Saldos das primeiras contas, para o cartão ter o mesmo corpo dos vizinhos.
    hasAcc ? '<div class="sum-rows">' + State.accounts.slice(0, 3).map(function(a){ var b = accountBalance(a); return two(escapeHtml(a.name), b, b < 0 ? 'neg-text' : ''); }).join('') +
      (State.accounts.length > 3 ? '<span class="tx-meta">+ ' + (State.accounts.length - 3) + ' ' + (State.accounts.length - 3 === 1 ? 'conta' : 'contas') + '</span>' : '') + '</div>' : '',
    (hasAcc ? State.accounts.map(function(a){ var b = accountBalance(a); return detailRow(escapeHtml(a.name), fmtMoney(b), b < 0 ? 'neg-text' : ''); }).join('') : '') +
    detailRow('Ganhos do mês', fmtMoney(t.incomeDone) + (f.expectedIncome > 0 ? ' <small>+ ' + fmtMoney(f.expectedIncome) + ' esperado</small>' : '')) +
    (hasAcc ? detailRow('Ganhos − gastos do mês', fmtMoney(f.balanceDone), f.balanceDone < 0 ? 'neg-text' : '') + detailRow('Sobra depois de pagar o que falta', fmtMoney(sp0.saldoAll), sp0.saldoAll < 0 ? 'neg-text' : '') : '') +
    (hasAcc ? (Math.abs(sp0.endAll - sp0.saldoAll) >= 0.005 ? detailRow('Previsto no fim do mês', fmtMoney(sp0.endAll), sp0.endAll < 0 ? 'neg-text' : '') : '') : (f.balanceEnd !== f.balanceDone ? detailRow('Previsto no fim do mês', fmtMoney(f.balanceEnd), f.balanceEnd < 0 ? 'neg-text' : '') : '')) +
    detailRow('Guardado nas metas', fmtMoney(f.savedInGoals)) +
    detailRow('Me devem', fmtMoney(f.toReceive)) +
    goLink(hasAcc ? 'cartoes' : 'lancamentos', hasAcc ? 'Ver contas' : 'Ver ganhos e gastos'));
  // 2. Gastos do mês
  var planned = plannedTotal(cur), spent = t.expenseDone;
  var pct = planned > 0 ? spent / planned : 0;
  var status = statusForPct(pct);
  var bar = planned > 0 ? '<div class="progress" role="img" aria-label="' + Math.round(pct * 100) + '% do planejado"><span style="width:' + Math.min(100, pct * 100) + '%; background:' +
    (status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)') + '"></span></div>' : '';
  // Em destaque o total gasto (inclusive o que é de outras pessoas); embaixo, o que é realmente meu e quanto
  // ainda falta pagar. O + mostra, por banco, o que já foi pago, o que falta e a parte que é minha.
  var sp = spendFigures(), mp = sp.mp;
  var c2 = sumCard(2, 'pie', 'Gastos do mês', fmtMoney(sp.total), '',
    (sp.total > 0 || planned > 0 ? '<span class="sum-line">Realmente seus: <strong class="tabular">' + fmtMoney(sp.mine) + '</strong>' + (sp.others > 0.004 ? ' · de outras pessoas ' + fmtMoney(sp.others) : '') +
      (planned > 0 ? ' · ' + Math.round(pct * 100) + '% de ' + fmtMoney(planned) + ' planejado' + (spent > planned ? ' (passou ' + fmtMoney(spent - planned) + ')' : '') : '') + '</span>' : '') +
    '<span class="sum-line">' + (mp.left > 0 ? 'Falta pagar <strong class="tabular">' + fmtMoney(mp.left) + '</strong> neste mês' + (sp.leftOthers > 0.004 || sp.others > 0.004 ? ', dos quais ' + fmtMoney(mp.leftMine) + ' são seus' : '') : mp.paid > 0 ? 'Tudo pago neste mês por enquanto' : 'Nenhum pagamento pendente') + '</span>',
    bar,
    (mp.rows.length ? '<p class="sum-caption">Por banco: o que já foi pago, o que falta e quanto do que falta é seu</p>' +
      '<div class="bank-pay" role="table" aria-label="Pago, falta e parte sua, por banco"><div class="bp-row bp-head" role="row"><span role="columnheader">Banco</span><span role="columnheader">Pago</span><span role="columnheader">Falta</span><span role="columnheader">Seu</span></div>' +
      mp.rows.map(function(r){
        return '<a class="bp-row" role="row" href="#/' + routeOf(r.go) + '" data-go="' + r.go + '"><span role="cell">' + escapeHtml(r.name) + '</span>' +
          '<span role="cell" class="tabular">' + fmtMoney(r.paid) + '</span><strong role="cell" class="tabular' + (r.left > 0 ? '' : ' pos-text') + '">' + fmtMoney(r.left) + '</strong>' +
          '<span role="cell" class="tabular">' + fmtMoney(r.mine) + '</span></a>';
      }).join('') +
      '<div class="bp-row bp-total" role="row"><span role="cell">Total</span><span role="cell" class="tabular">' + fmtMoney(mp.paid) + '</span><strong role="cell" class="tabular">' + fmtMoney(mp.left) + '</strong><span role="cell" class="tabular">' + fmtMoney(mp.leftMine) + '</span></div></div>' +
      '<p class="sum-caption sum-explain">“Seu” é a parte do que falta que é realmente sua; o resto é de outras pessoas, que vão te devolver.</p>' :
      '<p class="sum-caption">Nenhum pagamento neste mês ainda.</p>') +
    goLink('limites', 'Planejar gastos'));
  // 3. Próximos pagamentos: faturas, contas fixas e dívidas (cada um leva para a sua área)
  var list = upcomingCommitments(), next = list[0];
  function when(c){ return c.date ? (c.late ? '<span class="neg-text">venceu ' + formatDateBr(c.date) + '</span>' : 'vence ' + formatDateBr(c.date)) + (c.note ? ' · ' + c.note : '') : c.note; }
  var c3 = next ?
    sumCard(3, 'clock', 'Próximos pagamentos', fmtMoney(next.amount), next.late ? 'neg-text' : '',
      escapeHtml(next.title) + ' · ' + when(next) + (next.urgency === 'alta' ? ' · ' + URGENCY_MARK.alta + ' urgente' : ''),
      list.length > 1 ? '<div class="sum-rows">' + list.slice(1, 4).map(function(c){ return two(escapeHtml(c.title), c.amount, c.late ? 'neg-text' : ''); }).join('') + (list.length > 4 ? '<span class="tx-meta">+ ' + (list.length - 4) + ' a pagar</span>' : '') + '</div>' : '',
      '<p class="sum-caption">Próximos ' + Math.min(5, list.length) + ' de ' + list.length + '</p>' +
      '<p class="sum-caption sum-explain">Faturas aparecem com o valor que falta pagar, inclusive a parte de outras pessoas (a nota “seu” diz quanto é realmente seu). Entram também as contas fixas que ainda vão cair e as dívidas.</p>' +
      list.slice(0, 5).map(function(c){ return '<a class="sum-row sum-row-link" href="#/' + routeOf(c.go) + '" data-go="' + c.go + '"><span>' + URGENCY_MARK[c.urgency] + ' ' + escapeHtml(c.title) + ' <small>' + when(c) + '</small></span><strong class="tabular">' + fmtMoney(c.amount) + '</strong></a>'; }).join('')) :
    sumCard(3, 'clock', 'Próximos pagamentos', 'Nada pendente', 'sum-value-text', 'Sem faturas, contas fixas nem dívidas para pagar. 🎉', '',
      '<p class="sum-caption">Cadastre cartões em “Contas e cartões”, contas de todo mês em “Ganhos e gastos → Contas fixas” e dívidas em “Compromissos” para ver aqui o que vem pela frente.</p>' + goLink('fixas', 'Ver contas fixas'));
  var pdfBar = document.getElementById('invPdfBar');
  if (pdfBar){
    pdfBar.hidden = !State.cards.length;
    pdfBar.innerHTML = State.cards.length ? '<p class="ipb-title">Faturas dos cartões</p><p class="ipb-sub">Todas as faturas num só PDF, com a sua parte e a de outras pessoas separadas.</p>' + invoicePdfButtonsHtml() : '';
  }
  document.getElementById('monthStatus').innerHTML = monthStatusHtml();
  document.getElementById('summaryCards').innerHTML = c1 + c2 + c3;
}

export var CALC_RULES = [
  ['Realizado e agendado', 'Ganhos e gastos do mês contam só o que tem data até hoje. O que tem data mais para frente no mês (uma parcela, um gasto agendado) aparece como “Agendado” e entra na previsão do fim do mês.'],
  ['Esperado', 'Soma as previsões de entrada ainda não recebidas e os ganhos com data futura no mês.'],
  ['Total × realmente meu', 'Quando você paga uma compra para outra pessoa ou divide uma compra, o dinheiro sai do seu cartão ou conta, mas só a sua parte é gasto seu. O app mostra sempre as duas versões: o total (o que sai de verdade) e o que é realmente seu.'],
  ['Cartão de crédito', 'Cada compra no cartão (ou parcela) conta como gasto no mês em que vence a fatura dela, como no app do banco: compra de 04/10 com fatura vencendo em novembro conta em novembro. No mês da compra ela aparece só como aviso. A compra feita no dia do fechamento (ou depois) já vai para a fatura seguinte.'],
  ['Pagar a fatura', 'Não é um gasto novo (as compras já contaram). Se você escolher uma conta ao marcar a fatura como paga, o valor sai do saldo dessa conta.'],
  ['Falta pagar', 'Tudo o que ainda vai sair neste mês, no valor total das faturas (com a parte de outras pessoas): o que falta das faturas que vencem no mês (já sem o que foi adiantado ou pago), as contas fixas ainda não lançadas e os gastos agendados. Embaixo, quanto desse total é realmente seu.'],
  ['Saldo do mês', 'Com contas cadastradas: o disponível nas contas menos o que ainda falta pagar. O que já foi pago (como uma fatura quitada) já saiu do disponível e não é descontado de novo. São dois saldos: “com a fatura total” desconta tudo o que falta (inclusive a parte de outras pessoas) e “só com os meus gastos” desconta apenas a parte que é sua. Sem contas: ganhos menos gastos.'],
  ['Gastos do mês', 'O número grande é tudo o que saiu no mês, inclusive o que é de outras pessoas e elas vão te devolver. Embaixo, quanto disso é realmente seu. “Falta pagar” soma o que ainda vai sair (faturas que vencem no mês, contas fixas ainda não lançadas e gastos agendados) e diz quanto é seu. No +, o mesmo por banco: pago, falta e a parte sua.'],
  ['Dívidas: falta pagar', 'Soma das dívidas em Compromissos → Eu devo: valor original menos o que já foi pago. Compras parceladas no cartão não entram aqui: ficam em “Parcelas no cartão”, porque já estão nas próximas faturas.'],
  ['A receber neste mês', 'O que vence neste mês (parcelas e combinados até o fim do mês, inclusive atrasados) em “Me devem”. Embaixo, o total que ainda falta receber.'],
  ['Parcelas', 'Cada parcela é um gasto no mês dela. Os centavos que sobram da divisão ficam na 1ª parcela. “Parcelas em andamento” mostra quantas já foram pagas e quantas faltam, com filtros.'],
  ['Próximos pagamentos', 'Junta o que vem para pagar: faturas fechadas e abertas, contas fixas do mês e dívidas (pela urgência e pela data). Cada item leva para a área dele.'],
  ['Disponível nas contas', 'Parte do saldo que você informou e soma o que veio depois: ganhos e gastos ligados à conta, transferências e faturas pagas com ela. Transferência não é ganho nem gasto. Aparece em “Ganhos do mês”.']
];
export function explainReturn(){
  openModal({title: 'Os dois saldos', submitLabel: null, cancelLabel: 'Entendi',
    body: '<p>Quando você paga algo para outra pessoa ou divide uma compra, o dinheiro sai da sua conta ou do seu cartão, mas só a sua parte é gasto seu.</p>' +
      '<p><strong>Se ninguém devolver</strong>: quanto sobra pagando tudo o que falta, inclusive a parte das outras pessoas.</p>' +
      '<p><strong>Se te devolverem</strong>: quanto sobra quando elas pagarem a parte delas. Só a sua parte sai do seu bolso.</p>'});
}
export async function calcHelp(){
  await openModal({
    title: 'Como o painel calcula', submitLabel: null, cancelLabel: 'Fechar',
    body: '<dl class="rules-list">' + CALC_RULES.map(function(r){ return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>'
  });
}

export function renderComparison(){
  var cur = dashMonth(), prev = monthBounds((State.dashOffset || 0) - 1);
  document.getElementById('comparisonMonthsLabel').textContent = cur.label + ' vs ' + prev.label;
  var curP = monthProjection(cur.key), prevP = monthProjection(prev.key);
  var curCats = projectCats(cur.key), prevCats = projectCats(prev.key), fc = curP.forecast ? ' <small>previsão</small>' : '';
  document.getElementById('comparisonSummary').innerHTML =
    '<div class="tile tile-sm clickable" role="button" tabindex="0" data-open-detail="cmp:inc"><span class="tile-lbl">Ganhos' + fc + '</span><span class="tile-val tabular">'+fmtMoney(curP.inc)+'</span>'+deltaBadge(curP.inc, prevP.inc, false)+'</div>' +
    '<div class="tile tile-sm clickable" role="button" tabindex="0" data-open-detail="cmp:exp"><span class="tile-lbl">Gastos' + fc + '</span><span class="tile-val tabular">'+fmtMoney(curP.exp)+'</span>'+deltaBadge(curP.exp, prevP.exp, true)+'</div>' +
    '<div class="tile tile-sm clickable" role="button" tabindex="0" data-open-detail="cmp:saldo"><span class="tile-lbl">Saldo' + fc + '</span><span class="tile-val tabular">'+fmtMoney(curP.inc - curP.exp)+'</span>'+deltaBadge(curP.inc - curP.exp, prevP.inc - prevP.exp, false)+'</div>';
  var list = document.getElementById('comparisonList');
  var cats = expenseCats().map(function(c){
    return {id:c.id, label:c.label, color:c.color, cur: curCats[c.id]||0, prev: prevCats[c.id]||0};
  }).filter(function(c){ return c.cur>0 || c.prev>0; }).sort(function(a, b){ return b.cur - a.cur || b.prev - a.prev; });
  if (!cats.length){
    list.innerHTML = '<p class="chart-empty">Ainda não há gastos suficientes para comparar os dois meses.</p>';
    return;
  }
  var top = Math.max(1, Math.max.apply(null, cats.map(function(c){ return Math.max(c.cur, c.prev); })));
  list.innerHTML = '<div class="cmp-row cmp-head"><span>Categoria</span><span class="tabular">'+cur.label.slice(0,3)+'</span><span class="tabular">'+prev.label.slice(0,3)+'</span><span>Variação</span></div>' +
    cats.map(function(c){
      return '<div class="cmp-row clickable" role="button" tabindex="0" data-open-detail="cmpcat:' + c.id + '"><span class="cmp-cat">' + catBadge(c.id, 'expense') + escapeHtml(c.label) +
        '<span class="cmp-bars" aria-hidden="true"><span class="cmp-bar cur" style="width:' + (100 * c.cur / top) + '%"></span><span class="cmp-bar prev" style="width:' + (100 * c.prev / top) + '%"></span></span></span>' +
        '<span class="tabular">'+fmtMoney(c.cur)+'</span><span class="tabular">'+fmtMoney(c.prev)+'</span>' + deltaBadge(c.cur, c.prev, true) + '</div>';
    }).join('');
}

export function renderDashboard(){
  setDashSection(State.dashSec || 'numeros');
  var cur = monthBounds(0);
  document.getElementById('monthLabel').textContent = 'Resumo de ' + cur.label;
  renderBackupBanner();
  renderSummary();
  renderStatTiles();
  renderForecasts();
  renderSalaryNotice();
  renderGranaStrip();
  renderNewsCard();
  renderDashNav();
  renderDonut();
  renderBarChart();
  renderInvoiceSplit();
  renderCreditDebit();
  renderComparison();
  renderParcels();
  renderRecentTx();
}

// Detalhes do mês em três partes (uma de cada vez): números, gráficos e comparação/parcelas.
export var DASH_SECTIONS = ['numeros', 'graficos', 'analises'];
export function setDashSection(sec, focus){
  if (DASH_SECTIONS.indexOf(sec) < 0) sec = 'numeros';
  State.dashSec = sec;
  setPref('dashSec', sec);
  DASH_SECTIONS.forEach(function(x){
    var on = x === sec, b = document.getElementById('dashSecBtn-' + x);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle('active', on);
    document.getElementById('dashSec-' + x).hidden = !on;
  });
  if (focus) document.getElementById('dashSecBtn-' + sec).focus();
  if (sec === 'graficos' && State.dashDetails) renderBarChart();
}
export function renderDashNav(){
  var m = dashMonth(), off = State.dashOffset || 0;
  document.getElementById('dashNavLabel').textContent = m.label;
  var badge = document.getElementById('dashNavBadge');
  badge.textContent = off === 0 ? 'Este mês' : off > 0 ? 'Previsão · ' + (off === 1 ? 'próximo mês' : 'daqui a ' + off + ' meses') : off === -1 ? 'Mês passado' : 'Há ' + (-off) + ' meses';
  badge.className = 'dash-badge ' + (off > 0 ? 'future' : off < 0 ? 'past' : 'now');
  document.getElementById('dashPrev').disabled = off <= DASH_MIN;
  document.getElementById('dashNext').disabled = off >= DASH_MAX;
  document.getElementById('dashToday').hidden = off === 0;
  document.getElementById('donutTitle').textContent = 'Gastos por categoria · ' + m.label.split(' de ')[0];
}
export function setDashOffset(n){
  State.dashOffset = Math.max(DASH_MIN, Math.min(DASH_MAX, n));
  renderDashMonthViews();
}
export function renderDashMonthViews(){
  renderDashNav(); renderDonut(); renderBarChart(); renderInvoiceSplit(); renderCreditDebit(); renderComparison();
}

export function renderRecentTx(){
  var list = document.getElementById('recentTxList');
  var today = todayKey();
  var recent = State.transactions.filter(function(t){ return t.date <= today; }).slice(0,5);
  if (!recent.length){ list.innerHTML = '<p class="empty-state">Nenhum lançamento ainda. Toque no botão “+” para começar.</p>'; return; }
  list.innerHTML = recent.map(txRowHtml).join('');
}

export function paymentLabel(t){
  if (t.type === 'income'){ var ai = t.accountId && findById(State.accounts, t.accountId); return ai ? 'Em ' + ai.name : ''; }
  if (t.type !== 'expense' || !t.paymentMethod) return '';
  if (t.paymentMethod === 'cartao'){
    var c = findById(State.cards, t.cardId);
    return c ? 'Cartão ' + c.name : 'Cartão de crédito';
  }
  if (t.paymentMethod === 'vale'){
    var v = voucherOf(t);
    return v ? 'Vale ' + v.name : 'Vale';
  }
  var a = t.accountId && findById(State.accounts, t.accountId);
  return a ? a.name : '';
}

// Etiqueta de gasto pago por outra pessoa ou de devolução (não entram nos seus gastos e ganhos).
export function otherTagHtml(t){
  if (isReversal(t)){
    var orig = findById(State.transactions, t.reversal.of);
    return '<span class="tx-tag good">Estorno' + (orig ? ' de ' + escapeHtml(orig.description || catLabel(orig.category, 'expense')) + ' (' + formatDateBr(orig.date) + ')' : ' de compra excluída') + '</span>';
  }
  var revs = t.type === 'expense' ? reversalsOf(State.transactions, t.id) : [];
  if (revs.length) return '<span class="tx-tag good">Estornado: ' + fmtMoney(-sumMoney(revs, function(r){ return r.amount; })) + '</span>' + forOtherTag(t);
  return forOtherTag(t);
}
export function forOtherTag(t){
  if (t.split && t.type === 'expense') return '<span class="tx-tag">Dividida: sua parte ' + fmtMoney(myShare(t)) + ' · ' + escapeHtml(t.split.people.map(function(p){ return p.person; }).join(', ')) + '</span>';
  if (isRefund(t)) return '<span class="tx-tag">Devolução · não conta como ganho</span>';
  if (!isForOther(t)) return '';
  var r = findById(State.receivables, t.forOther.receivableId);
  var st = !r ? '' : r.forgiven ? ' · não vai devolver' : recvRemaining(r) <= 0 ? ' · já devolveu' : ' · vai devolver';
  return '<span class="tx-tag">Pago por ' + escapeHtml(t.forOther.person) + st + ' · fora dos seus gastos</span>';
}
// Compra no cartão: em qual fatura ela (ou a parcela) entrou e a situação dessa fatura. A mesma
// compra aparece em Ganhos e gastos e dentro da fatura do cartão: são duas vistas, não somam duas vezes.
export function invoiceTagHtml(t){
  if (t.type !== 'expense' || t.paymentMethod !== 'cartao') return '';
  var c = findById(State.cards, t.cardId);
  if (!c) return '';
  var key = Cards.txInvoiceKey(t, c), cur = Cards.invoiceKeyFor(todayKey(), c), st, cls;
  if (t.installment && t.installment.settled){ st = 'paga antes do cadastro'; cls = 'good'; }
  else if (key > cur){ st = 'futura'; cls = ''; }
  else if (key === cur){ st = 'atual'; cls = 'brand'; }
  else {
    var status = Cards.invoiceStatus(c, key, todayKey(), State.transactions);
    st = status === 'paga' ? (Cards.partialPayment(c, key) ? 'paga em parte' : 'paga') : status === 'vencida' ? 'vencida' : 'fechada, a pagar';
    cls = status === 'paga' ? 'good' : status === 'vencida' ? 'bad' : 'warn';
  }
  var full = Cards.invoiceLabel(key, c);   // "novembro de 2026" -> curto "nov/2026"
  var short = full.slice(0, 3) + '/' + full.slice(-4);
  return '<span class="tx-tag inv-tag ' + cls + '" title="' + (t.installment ? 'Parcela ' + t.installment.n + ' de ' + t.installment.total + ' · ' : '') + 'fatura de ' + full + ' · ' + st + '">' +
    'fatura ' + short + ' · ' + st + '</span>';
}
export function txRowHtml(t){
  var isExpense = t.type === 'expense';
  var cat = catLabel(t.category, t.type, t.categoryLabel);
  var pay = paymentLabel(t);
  var tags = invoiceTagHtml(t) + otherTagHtml(t);   // ao lado do nome (quebra para baixo em tela estreita)
  return '<div class="tx-row" data-id="'+escapeHtml(t.id)+'">' +
    catBadge(t.category, t.type) +
    '<div class="tx-main"><div class="tx-desc"><span class="tx-name">'+escapeHtml(t.description || cat)+'</span>' + (tags ? '<span class="tx-tags">' + tags + '</span>' : '') + '</div>' +
    '<div class="tx-meta">'+escapeHtml(cat) + ' · ' + formatDateBr(t.date) + (pay ? ' · ' + escapeHtml(pay) : '') + '</div></div>' +
    '<span class="tx-amount ' + (isExpense && t.amount > 0 ? 'expense' : 'income') + ' tabular">' + (isExpense && t.amount > 0 ? '-' : '+') + ' ' + fmtMoney(Math.abs(t.amount)) + '</span>' +
    '<button class="tx-del tx-edit" type="button" data-edit-tx="'+escapeHtml(t.id)+'" aria-label="Editar lançamento" title="Editar">' + icon('edit') + '</button>' +
    '<button class="tx-del" type="button" data-del-tx="'+escapeHtml(t.id)+'" aria-label="Excluir lançamento" title="Excluir">' + icon('trash') + '</button>' +
    '</div>';
}

// Eventos do Início: previsões, período do gráfico, relatório e "como calculamos".
export function wireHome(){
  document.getElementById('forecastToggle').addEventListener('click', function(){
    var open = document.getElementById('forecastPanel').hidden;
    setForecastOpen(open);
    if (open) document.getElementById('fcDesc').focus();
  });
  document.getElementById('barPeriod').addEventListener('change', function(e){ State.barMonths = Number(e.target.value); renderBarChart(); });
  document.getElementById('dashPrev').addEventListener('click', function(){ setDashOffset((State.dashOffset || 0) - 1); });
  document.getElementById('dashNext').addEventListener('click', function(){ setDashOffset((State.dashOffset || 0) + 1); });
  document.getElementById('dashToday').addEventListener('click', function(){ setDashOffset(0); });
  // Tocar num mês do gráfico de barras escolhe aquele mês para os três gráficos.
  var barWrap = document.getElementById('barWrap');
  function pick(e){ var g = e.target.closest && e.target.closest('.bar-group'); if (g) setDashOffset(Number(g.getAttribute('data-off'))); }
  barWrap.addEventListener('click', pick);
  barWrap.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(e); } });

  document.getElementById('forecastForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var desc = document.getElementById('fcDesc').value.trim();
    var amount = money(document.getElementById('fcAmount').value);
    var date = document.getElementById('fcDate').value;
    if (!desc || !(amount > 0) || !date){ toast('Preencha descrição, valor e data prevista.'); return; }
    if (!validDateStr(date)){ toast('Use uma data entre 1900 e 3000.'); return; }
    var f = {description: desc, amount: amount, date: date, recurring: document.getElementById('fcRecurring').checked, category: /sal[aá]rio/i.test(desc) ? 'salario' : 'outros_receita', received: {}, createdAt: Date.now()};
    var saved = await Store.add(k(), 'forecasts', f);
    State.forecasts.push(saved);
    e.target.reset();
    document.getElementById('fcDate').value = todayKey();
    renderDashboard();
    toast('Previsão de ' + fmtMoney(amount) + ' adicionada.');
  });

  function openDetail(el){
    var parts = el.getAttribute('data-open-detail').split(':');
    if (parts[0] === 'inv') openInvoiceDetail(parts[1], parts.slice(2).join(':'));
    else if (parts[0] === 'bank') openBankDetail(Number(parts[1]), State.dashOffset || 0);
    else if (el.getAttribute('data-open-detail') === 'inv-all') openAllInvoicesDetail(State.dashOffset || 0);
    else if (el.getAttribute('data-open-detail') === 'bank-all') openAllBanksDetail(State.dashOffset || 0);
    else if (parts[0] === 'cmp') openCompareDetail(parts[1]);
    else if (parts[0] === 'cmpcat') openCompareDetail('cmpcat', parts[1]);
  }
  ['invSplitWrap', 'creditDebitWrap', 'comparisonSummary', 'comparisonList'].forEach(function(id){
    var el = document.getElementById(id);
    el.addEventListener('click', function(e){ var t = e.target.closest('[data-open-detail]'); if (t) openDetail(t); });
    el.addEventListener('keydown', function(e){ var t = e.target.closest('[data-open-detail]'); if (t && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openDetail(t); } });
  });
  var donut = document.getElementById('donutWrap');
  donut.addEventListener('click', function(e){ var el = e.target.closest('[data-cat-id]'); if (el) openCategoryDetail(el.getAttribute('data-cat-id')); });
  donut.addEventListener('keydown', function(e){ var el = e.target.closest('[data-cat-id]'); if (el && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openCategoryDetail(el.getAttribute('data-cat-id')); } });
  document.getElementById('pdfReportBtn').addEventListener('click', generateMonthlyReport);
  document.getElementById('calcHelpBtn').addEventListener('click', calcHelp);
}
