/*
 * Início: previsões de entrada, números do mês, cartões de resumo, gráficos e últimos lançamentos.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {bankGroups} from './accounts-tab.js';
import {todayKey, monthKeyOf, formatDateBr, formatDateFull, validDateStr, monthBounds, shiftMonthKey} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import {isForOther, isRefund, isReversal, reversalsOf, myShare, othersShare} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import * as Budgets from '../domain/budgets.js';
import {statusForPct} from '../domain/budgets.js';
import {recvDueByMonth, recvInstallInfo, recvRemaining} from '../domain/receivables.js';

import {urgencyOf} from '../domain/urgency.js';
import {billMonth, pendingBills} from './bills.js';

import {Store} from '../data/store.js';
import {setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, icon, optionsHtml, resolveVar, toast} from './dom.js';
import {openModal, askAmount} from './modal.js';
import {wireTooltips} from './charts.js';
import {generateMonthlyReport} from './reports.js';
import {deltaBadge, renderBackupBanner, routeOf, setForecastOpen, showTab} from './shell.js';
import {State, URGENCY_MARK, URGENCY_RANK, accountBalance, accountMoves, catBadge, catLabel, expenseCategoryTotals, expenseCats, forecastOccurrences, installmentGroups, k, monthTotals, sortTransactions, totalAccountsBalance, voucherOf} from './state.js';
import {accountSelectHtml, fold, renderTransactionsTab} from './tx-list.js';

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

export async function receiveForecast(id, date){
  var f = findById(State.forecasts, id);
  if (!f) return;
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

/* ---------- Painel ---------- */
// O painel separa o que já aconteceu (data até hoje) do que ainda vai acontecer no mês,
// e o que existe agora (contas, faturas, metas, dívidas, a receber). Regras em docs/regras-financeiras.md.
export function dashboardFigures(){
  var cur = monthBounds(0), today = todayKey();
  var t = monthTotals(cur.key);
  var pendingForecast = sumMoney(forecastOccurrences(cur.key).filter(function(o){ return o.received === undefined; }), function(o){ return o.f.amount; });
  var expectedIncome = money(pendingForecast + t.incomeScheduled);
  var balanceDone = money(t.incomeDone - t.expenseDone);
  return {
    t: t, expectedIncome: expectedIncome, balanceDone: balanceDone,
    billsPending: sumMoney(pendingBills().filter(function(o){ return o.key === cur.key; }), function(o){ return o.amount; }),
    balanceEnd: money(balanceDone + expectedIncome - t.expenseScheduled - sumMoney(pendingBills().filter(function(o){ return o.key === cur.key; }), function(o){ return o.amount; })),
    invoices: Cards.invoicesSummary(State.transactions, State.cards, today),
    savedInGoals: sumMoney(State.goals.filter(function(g){ return !g.deletedAt; }), function(g){ return g.currentAmount; }),
    debtRemaining: money(sumMoney(State.debts, function(d){ return Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0)); })),
    installRemaining: money(sumMoney(installmentGroups(), function(g){ return g.remaining; })),
    toReceive: sumMoney(State.receivables, recvRemaining)
  };
}
export function renderStatTiles(){
  var f = dashboardFigures(), t = f.t;
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
  var mp = monthPayments(), hasAcc = State.accounts.length > 0, avail = hasAcc ? totalAccountsBalance() : 0;
  var saldo = hasAcc ? money(avail - mp.left) : f.balanceDone;
  var saldoEnd = hasAcc ? money(saldo + f.expectedIncome) : money(f.balanceDone + f.expectedIncome - mp.left);
  var leftParts = [mp.invoices > 0 ? 'faturas ' + fmtMoney(mp.invoices) : '', mp.bills > 0 ? 'contas fixas ' + fmtMoney(mp.bills) : '', mp.scheduled > 0 ? 'agendados ' + fmtMoney(mp.scheduled) : ''].filter(Boolean);
  var month = tile('Ganhos do mês', t.incomeDone, '', [hasAcc ? 'Disponível nas contas: ' + fmtMoney(avail) : '', f.expectedIncome > 0 ? 'Esperado ainda: + ' + fmtMoney(f.expectedIncome) : ''].filter(Boolean).join('<br>')) +
    tile('Gastos do mês', t.expenseDone, '', [t.expenseScheduled > 0 ? 'Agendado: + ' + fmtMoney(t.expenseScheduled) : '',
      t.forOther > 0 ? 'Fora daqui: ' + fmtMoney(t.forOther) + ' pagos por outras pessoas' : ''].filter(Boolean).join(' · ')) +
    tile('Falta pagar', mp.left, mp.left > 0 ? '' : 'pos', mp.left > 0 ? leftParts.join(' · ') : 'tudo pago neste mês') +
    tile('Saldo do mês', saldo, saldo < 0 ? 'neg' : 'pos', (hasAcc ? 'Disponível ' + fmtMoney(avail) + ' − falta pagar ' + fmtMoney(mp.left) : 'Ganhos − gastos') +
      (f.expectedIncome > 0 || (!hasAcc && mp.left > 0) ? '<br>Previsto no fim do mês: ' + fmtMoney(saldoEnd) : ''));
  var now = tile('Guardado nas metas', f.savedInGoals) +
    tile('Dívidas: falta pagar', f.debtRemaining, '', debtsOpen.length ? debtsOpen.length + (debtsOpen.length === 1 ? ' dívida' : ' dívidas') + ' em “Eu devo”<br>valor original ' + fmtMoney(debtOrig) + ' · já pago ' + fmtMoney(debtPaid) : 'nenhuma dívida em aberto') +
    tile('A receber neste mês', recvMonth, '', recvMonth > 0 ? 'Total a receber: ' + fmtMoney(f.toReceive) : (f.toReceive > 0 ? 'Nada vence neste mês<br>Total a receber: ' + fmtMoney(f.toReceive) : 'Ninguém te deve nada'));
  document.getElementById('statTiles').innerHTML =
    '<p class="tiles-group">Neste mês <span>realizado até hoje</span></p><div class="stat-tiles stat-tiles-auto">' + month + '</div>' +
    '<p class="tiles-group">Agora</p><div class="stat-tiles stat-tiles-auto">' + now + '</div>';
}

/* ---------- Início: 3 cartões de resumo, cada um com + para os detalhes ---------- */
// O que vem para pagar: faturas (vencidas primeiro) e dívidas abertas, pela urgência e pela data.
export function upcomingCommitments(){
  var today = todayKey(), out = [];
  var inv = Cards.invoicesSummary(State.transactions, State.cards, today);
  inv.toPay.concat(inv.open).forEach(function(i){
    if (!(i.left > 0)) return;
    out.push({title: 'Fatura ' + i.card.name, amount: i.left, date: i.due, late: i.status === 'vencida' || i.due < today,
      urgency: i.status === 'vencida' ? 'alta' : 'media', note: (i.status === 'aberta' ? 'fatura aberta' : '') + (i.paid > 0 ? (i.status === 'aberta' ? ' · ' : '') + 'falta, de ' + fmtMoney(i.total) : ''), go: 'cartoes'});
  });
  pendingBills().forEach(function(o){
    out.push({title: o.b.name, amount: o.amount, date: o.date, late: o.status === 'atrasada', urgency: o.status === 'atrasada' ? 'alta' : o.status === 'logo' ? 'media' : 'baixa',
      note: 'conta fixa', go: 'fixas'});
  });
  State.debts.forEach(function(d){
    var left = money(Math.max(0, Number(d.totalAmount || 0) - Number(d.paidAmount || 0)));
    if (left <= 0) return;
    var p = debtParcels(d);
    out.push({title: d.name + (d.creditor ? ' · ' + d.creditor : ''), amount: p ? Math.min(Number(d.monthlyPayment), left) : left, date: null, late: false,
      urgency: urgencyOf(d), note: p ? 'parcela ' + (p.done + 1) + ' de ' + p.total : 'falta pagar', go: 'dividas'});
  });
  return out.sort(function(a, b){
    return (b.late - a.late) || (URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]) || String(a.date || '9999').localeCompare(String(b.date || '9999'));
  });
}
// O que sai do bolso neste mês, por banco: o que já foi pago (débitos, Pix, faturas e adiantamentos
// que saíram da conta) e o que ainda falta (faturas em aberto que vencem até este mês, contas fixas e
// gastos agendados; fatura atrasada de mês anterior também conta, porque continua devida).
// Transferências entre contas não contam. Linha "Dinheiro" para o que não tem banco.
export function monthPayments(){
  var cur = monthBounds(0).key, today = todayKey(), rows = [], parts = {invoices: 0, bills: 0, scheduled: 0};
  var bills = pendingBills().filter(function(o){ return o.key === cur; });
  function scheduled(match){
    return sumMoney(State.transactions.filter(function(t){ return t.type === 'expense' && !t.reversal && t.date > today && t.date.slice(0, 7) === cur && t.paymentMethod !== 'cartao' && match(t); }), function(t){ return t.amount; });
  }
  bankGroups().forEach(function(g){
    var first = g.acc || g.cards[0], paid = 0, left = 0;
    if (g.acc){
      paid += -sumMoney(accountMoves(g.acc).filter(function(m){ return m.amount < 0 && m.kind !== 'Transferência' && m.date.slice(0, 7) === cur; }), function(m){ return m.amount; });
      var sc = scheduled(function(t){ return t.accountId === g.acc.id; });
      var bl = sumMoney(bills.filter(function(o){ return o.b.pay === 'acc:' + g.acc.id; }), function(o){ return o.amount; });
      parts.scheduled += sc; parts.bills += bl; left += sc + bl;
    }
    g.cards.forEach(function(c){
      Cards.invoiceKeys(State.transactions, c).forEach(function(key){
        var dueMonth = Cards.invoiceDates(key, c).due.slice(0, 7);
        if (dueMonth > cur) return;   // fatura de mês que ainda não chegou
        var thisMonth = dueMonth === cur, pay = (c.invoicePayments || {})[key];
        // Pagamentos sem conta escolhida não aparecem no saldo: entram aqui.
        if (thisMonth && pay && !pay.accountId && Cards.invoiceStatus(c, key, today) === 'paga') paid += Number(pay.amount) || 0;
        if (thisMonth) paid += sumMoney(Cards.invoiceAdvances(c, key).filter(function(x){ return !x.accountId; }), function(x){ return x.amount; });
        if (Cards.invoiceStatus(c, key, today) !== 'paga'){ var il = Cards.invoiceLeft(State.transactions, c, key); parts.invoices += il; left += il; }
      });
    });
    if (paid > 0 || left > 0) rows.push({name: first.name, paid: money(paid), left: money(left), go: 'cartoes'});
  });
  var cashPaid = sumMoney(State.transactions.filter(function(t){ return t.type === 'expense' && !t.reversal && t.paymentMethod === 'conta' && !t.accountId && t.date <= today && t.date.slice(0, 7) === cur && !t.outsideTotals; }), function(t){ return t.amount; });
  var cashSc = scheduled(function(t){ return !t.accountId; }), cashBills = sumMoney(bills.filter(function(o){ return o.b.pay === 'conta' || !o.b.pay; }), function(o){ return o.amount; });
  parts.scheduled += cashSc; parts.bills += cashBills;
  var cashLeft = cashSc + cashBills;
  if (cashPaid > 0 || cashLeft > 0) rows.push({name: 'Dinheiro', paid: money(cashPaid), left: money(cashLeft), go: 'lancamentos'});
  return {rows: rows, paid: sumMoney(rows, function(r){ return r.paid; }), left: sumMoney(rows, function(r){ return r.left; }),
    invoices: money(parts.invoices), bills: money(parts.bills), scheduled: money(parts.scheduled)};
}
// Dívida com parcela mensal: quantas parcelas no total e quantas já foram pagas (estimado pelo valor).
function debtParcels(d){
  var per = Number(d.monthlyPayment) || 0, total = Number(d.totalAmount) || 0;
  if (!(per > 0) || !(total > 0)) return null;
  var n = Math.ceil(total / per - 0.0001), left = Math.ceil(Math.max(0, total - Number(d.paidAmount || 0)) / per - 0.0001);
  return n > 1 ? {total: n, done: Math.max(0, n - left), left: left} : null;
}
// Tudo o que está sendo pago ou recebido em parcelas, com quantas foram e quantas faltam.
export function installmentProgress(){
  var out = [];
  installmentGroups().forEach(function(g){
    if (!g.future.length) return;
    // Compra para outra pessoa (pago por) ou dividida: a parcela também é de terceiros.
    var t0 = g.items[0], people = t0.forOther ? [t0.forOther.person] : t0.split ? t0.split.people.map(function(x){ return x.person; }) : [];
    out.push({kind: 'pagar', title: g.name, where: (g.card ? 'Cartão ' + g.card.name : 'Cartão') + (t0.forOther ? ' · para ' + t0.forOther.person : t0.split ? ' · dividida com ' + people.join(', ') : ''),
      total: g.total, done: g.done, left: g.future.length, leftAmount: g.remaining, per: g.perInstallment, go: 'cartoes', people: people.filter(Boolean)});
  });
  State.debts.forEach(function(d){
    var p = debtParcels(d), left = money(Math.max(0, Number(d.totalAmount || 0) - Number(d.paidAmount || 0)));
    if (!p || !(left > 0)) return;
    out.push({kind: 'pagar', title: d.name, where: d.creditor ? 'Você deve a ' + d.creditor : 'Dívida', total: p.total, done: p.done, left: p.left, leftAmount: left, per: Number(d.monthlyPayment), go: 'dividas',
      people: d.creditor ? [d.creditor] : []});
  });
  State.receivables.forEach(function(r){
    var info = recvInstallInfo(r), left = recvRemaining(r);
    if (!info || !(left > 0) || r.forgiven) return;
    out.push({kind: 'receber', title: r.description || r.person, where: r.person + ' te paga', total: info.n, done: info.paid, left: info.n - info.paid, leftAmount: left, per: info.per, go: 'receber',
      people: [r.person]});
  });
  return out.sort(function(a, b){ return (a.kind === 'receber') - (b.kind === 'receber') || a.left - b.left; });
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
  var f = dashboardFigures(), t = f.t;
  if (!t.incomeDone && !t.expenseDone && !f.expectedIncome && !f.billsPending && !t.expenseScheduled) return 'Comece anotando o que entra e o que sai neste mês: o resumo aparece aqui.';
  var end = f.balanceEnd, ahead = end !== f.balanceDone;
  return 'Até hoje entraram <strong class="tabular">' + fmtMoney(t.incomeDone) + '</strong> e saíram <strong class="tabular">' + fmtMoney(t.expenseDone) + '</strong>' +
    (ahead ? '. Se o resto do mês sair como previsto' + (f.billsPending > 0 ? ' (com ' + fmtMoney(f.billsPending) + ' de contas fixas)' : '') + ', você termina com ' :
      ': saldo do mês de ') +
    '<strong class="tabular ' + (end < 0 ? 'neg-text' : 'pos-text') + '">' + fmtMoney(end) + '</strong>' + (end < 0 ? ' — atenção: o mês fecha no vermelho.' : '.');
}
export function plannedTotal(key){
  var plan = Budgets.budgetsFor(State.budgetBase, State.budgetMonths, key);
  return sumMoney(Object.keys(plan), function(cat){ return plan[cat]; });
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

export function renderSummary(){
  var f = dashboardFigures(), t = f.t, cur = monthBounds(0).key;
  // 1. Quanto tenho
  var hasAcc = State.accounts.length > 0;
  var have = hasAcc ? totalAccountsBalance() : f.balanceDone;
  var c1 = sumCard(1, 'wallet', 'Quanto tenho', fmtMoney(have), have < 0 ? 'neg-text' : '',
    hasAcc ? 'Disponível hoje em ' + State.accounts.length + (State.accounts.length > 1 ? ' contas' : ' conta') : 'Saldo do mês: ganhos menos gastos até hoje',
    '',
    (hasAcc ? State.accounts.map(function(a){ var b = accountBalance(a); return detailRow(escapeHtml(a.name), fmtMoney(b), b < 0 ? 'neg-text' : ''); }).join('') : '') +
    detailRow('Ganhos do mês', fmtMoney(t.incomeDone) + (f.expectedIncome > 0 ? ' <small>+ ' + fmtMoney(f.expectedIncome) + ' esperado</small>' : '')) +
    (hasAcc ? detailRow('Saldo do mês', fmtMoney(f.balanceDone), f.balanceDone < 0 ? 'neg-text' : '') : '') +
    (f.balanceEnd !== f.balanceDone ? detailRow('Previsto no fim do mês', fmtMoney(f.balanceEnd), f.balanceEnd < 0 ? 'neg-text' : '') : '') +
    detailRow('Guardado nas metas', fmtMoney(f.savedInGoals)) +
    detailRow('Me devem', fmtMoney(f.toReceive)) +
    goLink(hasAcc ? 'cartoes' : 'lancamentos', hasAcc ? 'Ver contas' : 'Ver ganhos e gastos'));
  // 2. Gastos do mês
  var planned = plannedTotal(cur), spent = t.expenseDone;
  var pct = planned > 0 ? spent / planned : 0;
  var status = statusForPct(pct);
  var bar = planned > 0 ? '<div class="progress" role="img" aria-label="' + Math.round(pct * 100) + '% do planejado"><span style="width:' + Math.min(100, pct * 100) + '%; background:' +
    (status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)') + '"></span></div>' : '';
  // Em destaque o total gasto; embaixo, quanto ainda falta pagar no mês. O + mostra, por banco, o que
  // já foi pago e o que falta (faturas, contas fixas e gastos agendados).
  var mp = monthPayments();
  var c2 = sumCard(2, 'pie', 'Gastos do mês', fmtMoney(spent), '',
    (mp.left > 0 ? 'Falta pagar <strong class="tabular">' + fmtMoney(mp.left) + '</strong> neste mês' : mp.paid > 0 ? 'Tudo pago neste mês por enquanto' : 'Nenhum pagamento pendente') +
      (planned > 0 ? ' · ' + Math.round(pct * 100) + '% de ' + fmtMoney(planned) + ' planejado' + (spent > planned ? ' (passou ' + fmtMoney(spent - planned) + ')' : '') : ''),
    bar,
    (mp.rows.length ? '<p class="sum-caption">Por banco: pago e o que falta no mês</p>' +
      '<div class="bank-pay" role="table" aria-label="Pago e o que falta no mês, por banco"><div class="bp-row bp-head" role="row"><span role="columnheader">Banco</span><span role="columnheader">Pago</span><span role="columnheader">Falta</span></div>' +
      mp.rows.map(function(r){
        return '<a class="bp-row" role="row" href="#/' + routeOf(r.go) + '" data-go="' + r.go + '"><span role="cell">' + escapeHtml(r.name) + '</span>' +
          '<span role="cell" class="tabular">' + fmtMoney(r.paid) + '</span><strong role="cell" class="tabular' + (r.left > 0 ? '' : ' pos-text') + '">' + fmtMoney(r.left) + '</strong></a>';
      }).join('') +
      '<div class="bp-row bp-total" role="row"><span role="cell">Total</span><span role="cell" class="tabular">' + fmtMoney(mp.paid) + '</span><strong role="cell" class="tabular">' + fmtMoney(mp.left) + '</strong></div></div>' :
      '<p class="sum-caption">Nenhum pagamento neste mês ainda.</p>') +
    goLink('limites', 'Planejar gastos'));
  // 3. Próximos pagamentos: faturas, contas fixas e dívidas (cada um leva para a sua área)
  var list = upcomingCommitments(), next = list[0];
  function when(c){ return c.date ? (c.late ? '<span class="neg-text">venceu ' + formatDateBr(c.date) + '</span>' : 'vence ' + formatDateBr(c.date)) + (c.note ? ' · ' + c.note : '') : c.note; }
  var c3 = next ?
    sumCard(3, 'clock', 'Próximos pagamentos', fmtMoney(next.amount), next.late ? 'neg-text' : '',
      escapeHtml(next.title) + ' · ' + when(next) + (next.urgency === 'alta' ? ' · ' + URGENCY_MARK.alta + ' urgente' : ''), '',
      '<p class="sum-caption">Próximos ' + Math.min(5, list.length) + ' de ' + list.length + '</p>' +
      list.slice(0, 5).map(function(c){ return '<a class="sum-row sum-row-link" href="#/' + routeOf(c.go) + '" data-go="' + c.go + '"><span>' + URGENCY_MARK[c.urgency] + ' ' + escapeHtml(c.title) + ' <small>' + when(c) + '</small></span><strong class="tabular">' + fmtMoney(c.amount) + '</strong></a>'; }).join('')) :
    sumCard(3, 'clock', 'Próximos pagamentos', 'Nada pendente', 'sum-value-text', 'Sem faturas, contas fixas nem dívidas para pagar. 🎉', '',
      '<p class="sum-caption">Cadastre cartões em “Contas e cartões”, contas de todo mês em “Ganhos e gastos → Contas fixas” e dívidas em “Compromissos” para ver aqui o que vem pela frente.</p>' + goLink('fixas', 'Ver contas fixas'));
  document.getElementById('monthStatus').innerHTML = monthStatusHtml();
  document.getElementById('summaryCards').innerHTML = c1 + c2 + c3;
}

export var CALC_RULES = [
  ['Realizado e agendado', 'Ganhos e gastos do mês contam só o que tem data até hoje. O que tem data mais para frente no mês (uma parcela, um gasto agendado) aparece como “Agendado” e entra na previsão do fim do mês.'],
  ['Esperado', 'Soma as previsões de entrada ainda não recebidas e os ganhos com data futura no mês.'],
  ['Cartão de crédito', 'Cada compra no cartão (ou parcela) conta como gasto no mês em que vence a fatura dela, como no app do banco: compra de 04/10 com fatura vencendo em novembro conta em novembro. No mês da compra ela aparece só como aviso. A compra feita no dia do fechamento (ou depois) já vai para a fatura seguinte.'],
  ['Pagar a fatura', 'Não é um gasto novo (as compras já contaram). Se você escolher uma conta ao marcar a fatura como paga, o valor sai do saldo dessa conta.'],
  ['Falta pagar', 'Tudo o que ainda vai sair neste mês: o que falta das faturas que vencem no mês (já sem o que foi adiantado ou pago), as contas fixas ainda não lançadas e os gastos agendados.'],
  ['Saldo do mês', 'Com contas cadastradas: o disponível nas contas menos o que ainda falta pagar. O que já foi pago (como uma fatura quitada) já saiu do disponível e não é descontado de novo. Sem contas: ganhos menos gastos. Se houver entradas previstas, aparece também o saldo com elas.'],
  ['Gastos do mês', 'O número grande é o total gasto no mês. “Falta pagar” soma o que ainda vai sair: o que falta das faturas que vencem no mês, as contas fixas do mês ainda não lançadas e os gastos agendados. No +, o mesmo por banco.'],
  ['Dívidas: falta pagar', 'Soma das dívidas em Compromissos → Eu devo: valor original menos o que já foi pago. Compras parceladas no cartão não entram aqui: ficam em “Parcelas no cartão”, porque já estão nas próximas faturas.'],
  ['A receber neste mês', 'O que vence neste mês (parcelas e combinados até o fim do mês, inclusive atrasados) em “Me devem”. Embaixo, o total que ainda falta receber.'],
  ['Parcelas', 'Cada parcela é um gasto no mês dela. Os centavos que sobram da divisão ficam na 1ª parcela. “Parcelas em andamento” mostra quantas já foram pagas e quantas faltam, com filtros.'],
  ['Próximos pagamentos', 'Junta o que vem para pagar: faturas fechadas e abertas, contas fixas do mês e dívidas (pela urgência e pela data). Cada item leva para a área dele.'],
  ['Disponível nas contas', 'Parte do saldo que você informou e soma o que veio depois: ganhos e gastos ligados à conta, transferências e faturas pagas com ela. Transferência não é ganho nem gasto. Aparece em “Ganhos do mês”.']
];
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
    '<div class="tile tile-sm"><span class="tile-lbl">Ganhos' + fc + '</span><span class="tile-val tabular">'+fmtMoney(curP.inc)+'</span>'+deltaBadge(curP.inc, prevP.inc, false)+'</div>' +
    '<div class="tile tile-sm"><span class="tile-lbl">Gastos' + fc + '</span><span class="tile-val tabular">'+fmtMoney(curP.exp)+'</span>'+deltaBadge(curP.exp, prevP.exp, true)+'</div>' +
    '<div class="tile tile-sm"><span class="tile-lbl">Saldo' + fc + '</span><span class="tile-val tabular">'+fmtMoney(curP.inc - curP.exp)+'</span>'+deltaBadge(curP.inc - curP.exp, prevP.inc - prevP.exp, false)+'</div>';
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
      return '<div class="cmp-row"><span class="cmp-cat">' + catBadge(c.id, 'expense') + escapeHtml(c.label) +
        '<span class="cmp-bars" aria-hidden="true"><span class="cmp-bar cur" style="width:' + (100 * c.cur / top) + '%"></span><span class="cmp-bar prev" style="width:' + (100 * c.prev / top) + '%"></span></span></span>' +
        '<span class="tabular">'+fmtMoney(c.cur)+'</span><span class="tabular">'+fmtMoney(c.prev)+'</span>' + deltaBadge(c.cur, c.prev, true) + '</div>';
    }).join('');
}

export function renderDashboard(){
  var cur = monthBounds(0);
  document.getElementById('monthLabel').textContent = 'Resumo de ' + cur.label;
  renderBackupBanner();
  renderSummary();
  renderStatTiles();
  renderForecasts();
  renderDashNav();
  renderDonut();
  renderBarChart();
  renderInvoiceSplit();
  renderCreditDebit();
  renderComparison();
  renderParcels();
  renderRecentTx();
}

export function setToggleLabel(which){
  var btn = qs('[data-view-toggle="' + which + '"]');
  var view = which === 'donut' ? State.donutView : which === 'bar' ? State.barView : ((State.dashViews || {})[which] || 'chart');
  btn.textContent = view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico';
}

// Faturas que vencem no mês escolhido, uma por cartão, separadas em "minha parte" e "outras pessoas"
// (pago por alguém que vai devolver + a parte dos outros nas divididas). Parcelas acertadas antes do
// cadastro não entram. As vencidas e ainda não pagas (de qualquer mês) vêm à parte.
export function invoiceSplitData(offset){
  var today = todayKey(), mk = monthBounds(offset || 0).key, rows = [];
  State.cards.forEach(function(c){
    var key = null;
    [-2, -1, 0, 1].forEach(function(d){
      var kk = shiftMonthKey(mk, d);
      if (!key && monthKeyOf(Cards.invoiceDates(kk, c).due) === mk) key = kk;
    });
    if (!key) return;
    var items = Cards.invoiceItems(State.transactions, c, key).filter(function(t){ return !(t.installment && t.installment.settled); });
    // Saldo de fatura anterior paga em parte é dívida sua.
    var mine = money(sum(items, myShare) + Cards.carryTotal(c, key)), others = money(sum(items, othersShare));
    if (!(mine + others)) return;
    rows.push({card: c, key: key, label: Cards.invoiceLabel(key, c), due: Cards.invoiceDates(key, c).due, status: Cards.invoiceStatus(c, key, today),
      mine: mine, others: others, total: money(mine + others)});
  });
  var late = [];
  State.cards.forEach(function(c){
    Cards.invoiceKeys(State.transactions, c).forEach(function(kk){
      var v = Cards.invoiceDueTotal(State.transactions, c, kk);
      if (v > 0 && Cards.invoiceStatus(c, kk, today) === 'vencida') late.push(v);
    });
  });
  return {rows: rows, late: {count: late.length, total: money(sum(late, function(v){ return v; }))}};
}
export function toggleDashView(key){
  State.dashViews = State.dashViews || {};
  State.dashViews[key] = (State.dashViews[key] || 'chart') === 'chart' ? 'table' : 'chart';
  if (key === 'invsplit') renderInvoiceSplit(); else renderCreditDebit();
}
function pctOf(v, t){ return t > 0 ? Math.round(100 * v / t) : 0; }
function monthName(offset){ return monthBounds(offset || 0).label.split(' de ')[0].toLowerCase(); }

// Parte comum dos dois quadros: total em destaque, uma barra com as duas partes e a legenda com valores.
// a e b = {cls, label, value}. Os segmentos têm dica por mouse e teclado.
function splitSummary(totalLabel, total, a, b){
  function seg(p){ return p.value > 0 ? '<span class="inv-seg ' + p.cls + '" style="width:' + (100 * p.value / total).toFixed(2) + '%" tabindex="0" data-label="' + escapeHtml(p.label) + '" data-value="' + fmtMoney(p.value) + ' (' + pctOf(p.value, total) + '%)"></span>' : ''; }
  function key(p){ return '<span class="split-key"><i class="inv-key ' + p.cls + '" aria-hidden="true"></i><span>' + p.label + '</span><strong class="tabular">' + fmtMoney(p.value) + '</strong><small>' + pctOf(p.value, total) + '%</small></span>'; }
  return '<div class="split-kpi"><span class="kpi-lbl">' + totalLabel + '</span><strong class="tabular">' + fmtMoney(total) + '</strong></div>' +
    '<div class="inv-track thick">' + seg(a) + seg(b) + '</div>' +
    '<div class="split-keys">' + key(a) + key(b) + '</div>';
}
// Uma linha por cartão/banco: nome, total e a barra das duas partes (largura relativa à maior).
function splitRows(rows, max, a, b, meta){
  function seg(cls, v, label, r){
    if (!(v > 0) || !(max > 0)) return '';
    return '<span class="inv-seg ' + cls + '" style="width:' + (100 * v / max).toFixed(2) + '%" tabindex="0" data-label="' + escapeHtml(r.name + ' · ' + label) + '" data-value="' + fmtMoney(v) + ' (' + pctOf(v, r.total) + '%)"></span>';
  }
  return '<div class="inv-rows" role="img" aria-label="' + escapeHtml(rows.map(function(r){ return r.name + ': ' + a.label.toLowerCase() + ' ' + fmtMoney(r[a.field]) + ', ' + b.label.toLowerCase() + ' ' + fmtMoney(r[b.field]); }).join('; ')) + '">' +
    rows.map(function(r){
      return '<div class="inv-row"><div class="inv-row-head"><strong>' + escapeHtml(r.name) + '</strong>' + (meta ? '<span class="tx-meta">' + meta(r) + '</span>' : '') + '<strong class="tabular inv-row-total">' + fmtMoney(r.total) + '</strong></div>' +
        '<div class="inv-track">' + seg(a.cls, r[a.field], a.label.toLowerCase(), r) + seg(b.cls, r[b.field], b.label.toLowerCase(), r) + '</div></div>';
    }).join('') + '</div>';
}

export function renderInvoiceSplit(){
  var card = document.getElementById('invSplitCard'), wrap = document.getElementById('invSplitWrap');
  card.hidden = !State.cards.length;
  if (card.hidden) return;
  var off = State.dashOffset || 0, d = invoiceSplitData(off);
  var rows = d.rows.map(function(r){ return Object.assign({name: r.card.name}, r); });
  var tot = {mine: money(sum(rows, function(r){ return r.mine; })), others: money(sum(rows, function(r){ return r.others; }))};
  tot.total = money(tot.mine + tot.others);
  setToggleLabel('invsplit');
  document.getElementById('invSplitTitle').textContent = 'Faturas do cartão · ' + monthName(off);
  document.getElementById('invSplitSub').textContent = 'Faturas que vencem em ' + monthName(off) + ', separando o que é seu do que outras pessoas vão te devolver.';
  var lateHtml = off === 0 && d.late.count ? '<p class="inv-late" role="note">' + icon('clock') + '<span>Também há <strong>' + d.late.count + ' fatura(s) vencida(s)</strong> somando <strong class="tabular">' +
    fmtMoney(d.late.total) + '</strong>. Se já foram pagas, marque como pagas em “Contas e cartões”.</span> <a class="sum-link" href="#/contas" data-go="cartoes">Ver →</a></p>' : '';
  if (!rows.length){ wrap.innerHTML = '<p class="chart-empty">Nenhuma fatura vence em ' + monthName(off) + '.</p>' + lateHtml; return; }
  if (((State.dashViews || {}).invsplit || 'chart') === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Cartão</th><th>Fatura</th><th>Minha parte</th><th>Outras pessoas</th><th>Total</th></tr></thead><tbody>' +
      rows.map(function(r){ return '<tr><td>' + escapeHtml(r.card.name) + '</td><td>' + escapeHtml(r.label) + ' · vence ' + formatDateBr(r.due) + '</td><td class="tabular">' + fmtMoney(r.mine) +
        '</td><td class="tabular">' + fmtMoney(r.others) + '</td><td class="tabular">' + fmtMoney(r.total) + '</td></tr>'; }).join('') +
      '<tr><td colspan="2"><strong>Total</strong></td><td class="tabular"><strong>' + fmtMoney(tot.mine) + '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.others) +
      '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.total) + '</strong></td></tr></tbody></table>' + lateHtml;
    return;
  }
  var A = {cls: 'mine', label: 'Minha parte', field: 'mine'}, B = {cls: 'others', label: 'Outras pessoas', field: 'others'};
  var max = Math.max.apply(null, rows.map(function(r){ return r.total; }).concat([0]));
  wrap.innerHTML = splitSummary('Total das faturas', tot.total, Object.assign({value: tot.mine}, A), Object.assign({value: tot.others}, B)) +
    splitRows(rows, max, A, B, function(r){ return 'vence ' + formatDateBr(r.due) + ' · ' + r.status; }) + lateHtml;
  wireTooltips(wrap, '.inv-seg');
}
// Crédito × débito por banco no mês escolhido: o que saiu no cartão (pela data da compra) e da conta
// (Pix/débito). Conta e cartão do mesmo banco ficam juntos (bankGroups). Dinheiro e vale vão à parte.
// No mês atual conta só até hoje; nos futuros entra o que já está agendado (parcelas, por exemplo).
export function creditDebitData(offset){
  var key = monthBounds(offset || 0).key, today = todayKey(), upToToday = !offset;
  var tx = State.transactions.filter(function(t){ return t.type === 'expense' && monthKeyOf(t.date) === key && (!upToToday || t.date <= today); });
  var usedAcc = {}, usedCard = {};
  var rows = bankGroups().map(function(g){
    var accIds = g.acc ? [g.acc.id] : [], cardIds = g.cards.map(function(c){ return c.id; });
    accIds.forEach(function(id){ usedAcc[id] = true; }); cardIds.forEach(function(id){ usedCard[id] = true; });
    var debit = money(sum(tx.filter(function(t){ return t.paymentMethod === 'conta' && accIds.indexOf(t.accountId) >= 0; }), function(t){ return t.amount; }));
    var credit = money(sum(tx.filter(function(t){ return t.paymentMethod === 'cartao' && cardIds.indexOf(t.cardId) >= 0; }), function(t){ return t.amount; }));
    return {name: (g.acc || g.cards[0]).name, credit: credit, debit: debit, total: money(credit + debit)};
  });
  var cash = money(sum(tx.filter(function(t){ return (t.paymentMethod === 'conta' || !t.paymentMethod) && !usedAcc[t.accountId]; }), function(t){ return t.amount; }));
  var vale = money(sum(tx.filter(function(t){ return t.paymentMethod === 'vale'; }), function(t){ return t.amount; }));
  return {rows: rows, cash: cash, vale: vale};
}
export function renderCreditDebit(){
  var card = document.getElementById('creditDebitCard'), wrap = document.getElementById('creditDebitWrap');
  card.hidden = !State.cards.length && !State.accounts.length;
  if (card.hidden) return;
  var off = State.dashOffset || 0, d = creditDebitData(off), rows = d.rows.filter(function(r){ return r.total > 0; });
  var tot = {credit: money(sum(d.rows, function(r){ return r.credit; })), debit: money(sum(d.rows, function(r){ return r.debit; }))};
  tot.total = money(tot.credit + tot.debit);
  setToggleLabel('creditdebit');
  document.getElementById('creditDebitTitle').textContent = 'Crédito × débito · ' + monthName(off);
  document.getElementById('creditDebitSub').textContent = (off === 0 ? 'Quanto saiu de cada banco até hoje' : off > 0 ? 'Quanto já está agendado para cada banco' : 'Quanto saiu de cada banco') +
    ': no cartão (pela data da compra) e da conta, por Pix ou débito. Inclui o que outras pessoas vão te devolver.';
  var outside = (d.cash || d.vale) ? '<p class="tx-meta cd-outside">Fora dos bancos: ' + [d.cash ? 'dinheiro ' + fmtMoney(d.cash) : '', d.vale ? 'vale ' + fmtMoney(d.vale) : ''].filter(Boolean).join(' · ') + '.</p>' : '';
  if (!tot.total){ wrap.innerHTML = '<p class="chart-empty">' + (off > 0 ? 'Nada agendado nos bancos para ' : 'Nenhum gasto nos bancos em ') + monthName(off) + '.</p>' + outside; return; }
  if (((State.dashViews || {}).creditdebit || 'chart') === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Banco</th><th>Crédito</th><th>Débito/Pix</th><th>Total</th></tr></thead><tbody>' +
      d.rows.map(function(r){ return '<tr><td>' + escapeHtml(r.name) + '</td><td class="tabular">' + fmtMoney(r.credit) + '</td><td class="tabular">' + fmtMoney(r.debit) + '</td><td class="tabular">' + fmtMoney(r.total) + '</td></tr>'; }).join('') +
      '<tr><td><strong>Total</strong></td><td class="tabular"><strong>' + fmtMoney(tot.credit) + '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.debit) + '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.total) + '</strong></td></tr></tbody></table>' + outside;
    return;
  }
  var A = {cls: 'credit', label: 'Crédito', field: 'credit'}, B = {cls: 'debit', label: 'Débito/Pix', field: 'debit'};
  var max = Math.max.apply(null, rows.map(function(r){ return r.total; }).concat([0]));
  wrap.innerHTML = splitSummary('Total nos bancos', tot.total, Object.assign({value: tot.credit}, A), Object.assign({value: tot.debit}, B)) + splitRows(rows, max, A, B) + outside;
  wireTooltips(wrap, '.inv-seg');
}
/* ---------- Gráficos do Início: mês escolhido (passado, atual ou futuro com previsão) ---------- */
export var DASH_MIN = -36, DASH_MAX = 12;
function dashMonth(){ return monthBounds(State.dashOffset || 0); }
// R$ 1.234 -> "1,2 mil"; valores menores ficam inteiros. Para os eixos dos gráficos.
export function compactMoney(v){
  v = Math.round(Number(v) || 0);
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace('.', ',').replace(',0', '') + ' mi';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil';
  return String(v);
}
// O que se espera de um mês: o registrado mais, daqui para frente, as contas fixas ainda não lançadas
// e as previsões de entrada ainda não recebidas. Meses passados são só o registrado.
export function monthProjection(key){
  var cur = monthBounds(0).key, t = monthTotals(key), ahead = key >= cur;
  var bills = ahead ? billMonth(key).filter(function(o){ return !o.paid && !o.skipped; }) : [];
  var fcs = ahead ? forecastOccurrences(key).filter(function(o){ return o.received === undefined; }) : [];
  var expExtra = sumMoney(bills, function(o){ return o.amount; }), incExtra = sumMoney(fcs, function(o){ return o.f.amount; });
  return {key: key, inc: money(t.income + incExtra), exp: money(t.expense + expExtra), incReg: t.income, expReg: t.expense,
    incExtra: incExtra, expExtra: expExtra, bills: bills, future: key > cur, forecast: key > cur || expExtra > 0 || incExtra > 0};
}
// Gastos por categoria do mês, com as contas fixas previstas.
export function projectCats(key){
  var out = Object.assign({}, expenseCategoryTotals(key));
  monthProjection(key).bills.forEach(function(o){ out[o.b.category] = money((out[o.b.category] || 0) + o.amount); });
  return out;
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

export function renderDonut(){
  var wrap = document.getElementById('donutWrap'), m = dashMonth(), key = m.key;
  setToggleLabel('donut');
  var byCat = projectCats(key), proj = monthProjection(key);
  var entries = expenseCats().map(function(c){ return {label:c.label, emoji:c.emoji, color:c.color, value: byCat[c.id]||0}; })
    .filter(function(e){ return e.value>0; }).sort(function(a, b){ return b.value - a.value; });
  var total = sum(entries, function(e){ return e.value; });
  if (!total){
    wrap.innerHTML = '<p class="chart-empty">' + ((State.dashOffset || 0) > 0 ? 'Nada previsto para este mês ainda (parcelas, contas fixas ou gastos agendados).' : 'Sem gastos registrados neste mês.') + '</p>';
    return;
  }
  if (State.donutView === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' +
      entries.map(function(e){ return '<tr><td>'+escapeHtml(e.label)+'</td><td class="tabular">'+fmtMoney(e.value)+'</td><td class="tabular">'+Math.round(100*e.value/total)+'%</td></tr>'; }).join('') +
      '<tr><td><strong>Total</strong></td><td class="tabular"><strong>'+fmtMoney(total)+'</strong></td><td>100%</td></tr></tbody></table>';
    return;
  }
  var style = DONUT_STYLES.indexOf(State.donutStyle) >= 0 ? State.donutStyle : 'rosca';
  qsa('[data-donut-style]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-donut-style') === style ? 'true' : 'false'); });
  var figure = style === 'blocos' ? donutBlocks(entries, total, wrap) : donutSvg(entries, total, style, m.label, wrap);
  var rows = '<ol class="cat-rank">' + entries.slice(0, 7).map(function(e){
    var pct = Math.round(100 * e.value / total);
    return '<li><span class="cat-rank-top"><span class="cat-rank-name"><span class="legend-swatch" style="background:' + resolveVar(e.color, wrap) + '"></span>' + escapeHtml(e.emoji + ' ' + e.label) + '</span>' +
      '<span class="tabular">' + fmtMoney(e.value) + ' <small>' + pct + '%</small></span></span>' +
      '<span class="cat-rank-bar"><span style="width:' + pct + '%; background:' + resolveVar(e.color, wrap) + '"></span></span></li>';
  }).join('') + (entries.length > 7 ? '<li class="tx-meta">+ ' + (entries.length - 7) + ' categorias menores (veja na tabela)</li>' : '') + '</ol>';
  wrap.innerHTML = '<div class="donut-layout is-' + style + '">' + figure + rows + '</div>' +
    (proj.expExtra > 0 ? '<p class="chart-note">Inclui ' + fmtMoney(proj.expExtra) + ' de contas fixas previstas, ainda não lançadas.</p>' : '');
  wireTooltips(wrap, '.donut-seg, .tm-block');
}
// Três jeitos de ver os gastos por categoria: rosca (com o total no meio), pizza e blocos (tamanho = valor).
var DONUT_STYLES = ['rosca', 'pizza', 'blocos'];
export function setDonutStyle(style){
  if (DONUT_STYLES.indexOf(style) < 0) return;
  State.donutStyle = style;
  setPref('donutStyle', style);
  renderDonut();
}
function donutSvg(entries, total, style, monthLabel, wrap){
  var pie = style === 'pizza', size = 220, cx = size / 2, cy = size / 2;
  // Rosca: anel fino. Pizza: o mesmo truque, com um traço tão grosso quanto o raio dobrado.
  var r = pie ? 55 : 82, sw = pie ? 110 : 24, circumference = 2 * Math.PI * r, gap = entries.length > 1 ? (pie ? 2 : 3) : 0;
  var cum = 0, labels = '';
  var circles = entries.map(function(e, i){
    var frac = e.value / total, dash = Math.max(0, frac * circumference - gap), offset = -cum * circumference;
    if (pie && frac >= 0.06){
      var ang = (cum + frac / 2) * 2 * Math.PI - Math.PI / 2;
      labels += '<text class="pie-pct" x="' + (cx + 74 * Math.cos(ang)).toFixed(1) + '" y="' + (cy + 74 * Math.sin(ang) + 4).toFixed(1) + '" text-anchor="middle">' + Math.round(100 * frac) + '%</text>';
    }
    cum += frac;
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + resolveVar(e.color, wrap) + '" stroke-width="' + sw + '" stroke-linecap="butt" style="--i:' + i + '" ' +
      'stroke-dasharray="' + dash.toFixed(2) + ' ' + (circumference - dash).toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '" ' +
      'transform="rotate(-90 ' + cx + ' ' + cy + ')" tabindex="0" data-label="' + escapeHtml(e.label) + '" data-value="' + fmtMoney(e.value) + ' (' + Math.round(100 * frac) + '%)" class="donut-seg' + (pie ? ' pie' : '') + '"></circle>';
  }).join('');
  var center = pie ? '' : '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">' + ((State.dashOffset || 0) > 0 ? 'Previsto' : 'Total') + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text-primary)">' + fmtMoney(total) + '</text>';
  return '<div class="donut-fig"><svg class="donut-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Gastos por categoria em ' + escapeHtml(monthLabel) + '">' +
    (pie ? '' : '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--gridline)" stroke-width="' + sw + '" opacity=".6"></circle>') + circles + labels + center + '</svg>' +
    (pie ? '<p class="donut-total">' + ((State.dashOffset || 0) > 0 ? 'Previsto' : 'Total') + ' <strong class="tabular">' + fmtMoney(total) + '</strong></p>' : '') + '</div>';
}
// Treemap: retângulos com área proporcional ao valor (algoritmo "squarified" numa grade 100 × 62,5).
function squarify(areas, x, y, w, h){
  var out = [], rest = areas.map(function(a, i){ return {a: a, i: i}; });
  function worst(row, side){
    var s = 0, mx = 0, mn = Infinity;
    row.forEach(function(r){ s += r.a; mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); });
    return Math.max(side * side * mx / (s * s), s * s / (side * side * mn));
  }
  while (rest.length){
    var side = Math.min(w, h), row = [], best = Infinity;
    while (rest.length){
      var next = row.concat([rest[0]]), score = worst(next, side);
      if (row.length && score > best) break;
      row = next; best = score; rest.shift();
    }
    var tot = sum(row, function(r){ return r.a; }), pos;
    if (w >= h){
      var cw = tot / h; pos = y;
      row.forEach(function(r){ var rh = r.a / cw; out[r.i] = {x: x, y: pos, w: cw, h: rh}; pos += rh; });
      x += cw; w -= cw;
    } else {
      var rh2 = tot / w; pos = x;
      row.forEach(function(r){ var rw = r.a / rh2; out[r.i] = {x: pos, y: y, w: rw, h: rh2}; pos += rw; });
      y += rh2; h -= rh2;
    }
  }
  return out;
}
function donutBlocks(entries, total, wrap){
  var W = 100, H = 62.5, areas = entries.map(function(e){ return e.value / total * W * H; });
  var rects = squarify(areas, 0, 0, W, H);
  return '<div class="tm" role="img" aria-label="Gastos por categoria, blocos proporcionais ao valor">' + entries.map(function(e, i){
    var q = rects[i], pct = Math.round(100 * e.value / total), big = q.w > 22 && q.h > 22, mid = q.w > 13 && q.h > 13;
    return '<div class="tm-block' + (big ? ' big' : mid ? ' mid' : '') + '" tabindex="0" style="left:' + q.x.toFixed(2) + '%;top:' + (q.y / H * 100).toFixed(2) + '%;width:' + q.w.toFixed(2) + '%;height:' + (q.h / H * 100).toFixed(2) +
      '%;background:' + resolveVar(e.color, wrap) + '" data-label="' + escapeHtml(e.label) + '" data-value="' + fmtMoney(e.value) + ' (' + pct + '%)">' +
      '<span class="tm-emoji" aria-hidden="true">' + escapeHtml(e.emoji) + '</span>' + (big ? '<span class="tm-name">' + escapeHtml(e.label) + '</span>' : '') + (mid || big ? '<span class="tm-pct">' + pct + '%</span>' : '') + '</div>';
  }).join('') + '</div>';
}

export function renderBarChart(){
  var wrap = document.getElementById('barWrap');
  setToggleLabel('bar');
  var n = State.barMonths, off = State.dashOffset || 0;
  // A janela sempre inclui o mês escolhido: termina nele (se for futuro) ou no mês atual.
  var end = off >= 0 ? off : Math.min(0, off + Math.floor(n / 2));
  var data = [];
  for (var i = n - 1; i >= 0; i--){
    var mo = end - i, m = monthBounds(mo), p = monthProjection(m.key);
    data.push({off: mo, label: m.label.slice(0, 3), year: m.key.slice(2, 4), full: m.label, p: p, sel: mo === off, now: mo === 0});
  }
  if (State.barView === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Mês</th><th>Ganhos</th><th>Gastos</th><th>Saldo</th></tr></thead><tbody>' +
      data.map(function(d){ return '<tr><td>'+d.full+(d.p.forecast ? ' <small>(previsão)</small>' : '')+'</td><td class="tabular">'+fmtMoney(d.p.inc)+'</td><td class="tabular">'+fmtMoney(d.p.exp)+'</td><td class="tabular">'+fmtMoney(d.p.inc-d.p.exp)+'</td></tr>'; }).join('') +
      '</tbody></table>';
    return;
  }
  var max = Math.max(1, Math.max.apply(null, data.map(function(d){ return Math.max(d.p.inc, d.p.exp); })));
  var W = 340, H = 220, padL = 40, padB = 34, padT = 12, padR = 6;
  var plotW = W - padL - padR, plotH = H - padT - padB, groupW = plotW / data.length, barW = Math.min(18, groupW / 2.6);
  var incColor = resolveVar('var(--cat-3)', wrap), expColor = resolveVar('var(--cat-8)', wrap), selColor = resolveVar('var(--brand)', wrap);
  var defs = '<defs>' +
    '<linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + incColor + '"/><stop offset="1" stop-color="' + incColor + '" stop-opacity=".62"/></linearGradient>' +
    '<linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + expColor + '"/><stop offset="1" stop-color="' + expColor + '" stop-opacity=".62"/></linearGradient>' +
    '<pattern id="hInc" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="' + incColor + '" opacity=".18"/><rect width="2" height="5" fill="' + incColor + '" opacity=".75"/></pattern>' +
    '<pattern id="hExp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="' + expColor + '" opacity=".18"/><rect width="2" height="5" fill="' + expColor + '" opacity=".75"/></pattern></defs>';
  var grid = [0, 0.5, 1].map(function(f){
    var y = padT + plotH * (1 - f);
    return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--gridline)" stroke-width="1"' + (f ? ' stroke-dasharray="3 4"' : '') + '></line>' +
      '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + compactMoney(max * f) + '</text>';
  }).join('');
  function bar(x, val, extra, label, grad, hatch, idx, color, d){
    var hTot = (val / max) * plotH, hExtra = (extra / max) * plotH, hReg = Math.max(0, hTot - hExtra), y0 = padT + plotH;
    var tip = label + ' · ' + d.full + ': ' + fmtMoney(val) + (extra > 0 ? ' (' + fmtMoney(extra) + ' previsto)' : '');
    var out = '';
    if (hReg > 0.4) out += '<rect class="bar-seg" style="--i:' + idx + '" data-label="' + escapeHtml(label + ' · ' + d.full) + '" data-value="' + fmtMoney(val) + (extra > 0 ? ' (' + fmtMoney(extra) + ' previsto)' : '') + '" x="' + x + '" y="' + (y0 - hReg) + '" width="' + barW + '" height="' + hReg + '" rx="' + Math.min(4, hReg / 2) + '" fill="url(#' + grad + ')" tabindex="0"><title>' + escapeHtml(tip) + '</title></rect>';
    if (hExtra > 0.4) out += '<rect class="bar-seg bar-forecast" style="--i:' + idx + '" data-label="' + escapeHtml(label + ' previsto · ' + d.full) + '" data-value="' + fmtMoney(extra) + '" x="' + x + '" y="' + (y0 - hTot) + '" width="' + barW + '" height="' + hExtra + '" rx="3" fill="url(#' + hatch + ')" stroke="' + color + '" stroke-width="1" stroke-dasharray="3 2" tabindex="0"></rect>';
    if (hTot <= 0.4) out += '<rect x="' + x + '" y="' + (y0 - 1.5) + '" width="' + barW + '" height="1.5" rx="1" fill="' + color + '" opacity=".4"></rect>';
    return out;
  }
  var groups = data.map(function(d, idx){
    var gx = padL + idx * groupW, cx = gx + groupW / 2, x1 = cx - barW - 1.5, x2 = cx + 1.5;
    var sub = d.now ? 'hoje' : d.p.forecast ? 'previsão' : "'" + d.year;
    return '<g class="bar-group' + (d.sel ? ' sel' : '') + '" data-off="' + d.off + '" >' +
      '<rect class="bar-hit" x="' + gx + '" y="' + padT + '" width="' + groupW + '" height="' + (plotH + padB - 2) + '" rx="8" fill="' + (d.sel ? selColor : 'transparent') + '" fill-opacity="' + (d.sel ? '.1' : '0') + '"></rect>' +
      bar(x1, d.p.inc, d.p.incExtra, 'Ganhos', 'gInc', 'hInc', idx, incColor, d) + bar(x2, d.p.exp, d.p.expExtra, 'Gastos', 'gExp', 'hExp', idx, expColor, d) +
      '<text x="' + cx + '" y="' + (H - 18) + '" text-anchor="middle" font-size="' + (n > 6 ? 8 : 10) + '" font-weight="' + (d.sel ? 700 : 500) + '" fill="' + (d.sel ? 'var(--text-primary)' : 'var(--text-secondary)') + '">' + d.label + '</text>' +
      '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="7.5" fill="var(--text-muted)">' + sub + '</text></g>';
  }).join('');
  var svg = '<svg class="bar-svg" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Ganhos e gastos por mês. Para trocar de mês, use os botões de mês anterior e próximo.">' + defs + grid +
    '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="var(--baseline)" stroke-width="1"></line>' + groups + '</svg>';
  var legend = '<div class="legend">' +
    '<span class="legend-item"><span class="legend-swatch" style="background:' + incColor + '"></span>Ganhos</span>' +
    '<span class="legend-item"><span class="legend-swatch" style="background:' + expColor + '"></span>Gastos</span>' +
    '<span class="legend-item"><span class="legend-swatch hatch"></span>Previsto (contas fixas e entradas esperadas)</span></div>';
  var sel = data.filter(function(d){ return d.sel; })[0];
  var cap = sel ? '<p class="chart-note"><strong>' + escapeHtml(sel.full) + '</strong>: ganhos ' + fmtMoney(sel.p.inc) + ' · gastos ' + fmtMoney(sel.p.exp) + ' · saldo <strong class="' + (sel.p.inc - sel.p.exp < 0 ? 'neg-text' : 'pos-text') + '">' + fmtMoney(sel.p.inc - sel.p.exp) + '</strong>' + (sel.p.forecast ? ' (previsão)' : '') + '</p>' : '';
  // Médias dos meses já vividos da janela (só o que foi registrado, sem previsão).
  var past = data.filter(function(d){ return d.off <= 0 && (d.p.incReg || d.p.expReg); });
  var stats = '';
  if (past.length){
    var priciest = past.slice().sort(function(a, b){ return b.p.expReg - a.p.expReg; })[0];
    function stat(lbl, val, sub){ return '<div class="bar-stat"><span class="kpi-lbl">' + lbl + '</span><strong class="tabular">' + val + '</strong><span class="tx-meta">' + sub + '</span></div>'; }
    stats = '<div class="bar-stats">' +
      stat('Média de ganhos', fmtMoney(sumMoney(past, function(d){ return d.p.incReg; }) / past.length), 'por mês, ' + past.length + (past.length > 1 ? ' meses' : ' mês')) +
      stat('Média de gastos', fmtMoney(sumMoney(past, function(d){ return d.p.expReg; }) / past.length), 'por mês, ' + past.length + (past.length > 1 ? ' meses' : ' mês')) +
      stat('Mês mais caro', fmtMoney(priciest.p.expReg), escapeHtml(priciest.full)) + '</div>';
  }
  wrap.innerHTML = svg + legend + cap + stats;
  wireTooltips(wrap, '.bar-seg');
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
    var status = Cards.invoiceStatus(c, key, todayKey());
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

  document.getElementById('pdfReportBtn').addEventListener('click', generateMonthlyReport);
  document.getElementById('calcHelpBtn').addEventListener('click', calcHelp);
}
