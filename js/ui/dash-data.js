/*
 * Início, dados: números do mês, o que falta pagar, faturas, crédito × débito e projeções.
 * Sem HTML: só calcula (a tela fica em home-tab.js e dash-charts.js).
 */
import {bankGroups} from './accounts-tab.js';
import {todayKey, monthKeyOf, monthBounds, shiftMonthKey} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {sum} from '../domain/util.js';
import {myShare, othersShare} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import * as Budgets from '../domain/budgets.js';
import {recvInstallInfo, recvNextAmount, recvRemaining} from '../domain/receivables.js';
import {urgencyOf} from '../domain/urgency.js';
import {billMonth, pendingBills} from './bills.js';
import {State, URGENCY_RANK, accountMoves, expenseCategoryTotals, forecastOccurrences, installmentGroups, monthOthers, monthTotals, totalAccountsBalance} from './state.js';

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
// Os números do mês nas duas versões: o TOTAL (tudo o que saiu, inclusive o que é de outras pessoas e
// elas vão devolver) e o que é REALMENTE MEU. Mesma regra em todas as telas.
export function spendFigures(){
  var f = dashboardFigures(), t = f.t, mp = monthPayments(), hasAcc = State.accounts.length > 0, avail = hasAcc ? totalAccountsBalance() : 0;
  var mine = t.expenseDone, others = monthOthers(monthBounds(0).key, true), total = money(mine + others);
  return {f: f, mp: mp, hasAcc: hasAcc, avail: avail, income: t.incomeDone, mine: mine, others: others, total: total,
    left: mp.left, leftMine: mp.leftMine, leftOthers: money(mp.left - mp.leftMine),
    saldoAll: hasAcc ? money(avail - mp.left) : money(f.balanceDone - others),
    saldoMine: hasAcc ? money(avail - mp.leftMine) : f.balanceDone,
    // Previsão do fim do mês: com contas, o que sobra depois de pagar mais o que ainda vai entrar (se tudo
    // já foi pago, é o que há nas contas); sem contas, a conta antiga (ganhos − gastos do mês).
    endAll: hasAcc ? money(avail - mp.left + f.expectedIncome) : f.balanceEnd,
    endMine: hasAcc ? money(avail - mp.leftMine + f.expectedIncome) : f.balanceEnd};
}

/* ---------- Início: 3 cartões de resumo, cada um com + para os detalhes ---------- */
// O que vem para pagar: faturas (vencidas primeiro) e dívidas abertas, pela urgência e pela data.
export function upcomingCommitments(){
  var today = todayKey(), out = [];
  var inv = Cards.invoicesSummary(State.transactions, State.cards, today);
  inv.toPay.concat(inv.open).forEach(function(i){
    if (!(i.left > 0)) return;
    // A fatura vem inteira (com a parte de outras pessoas); a nota diz quanto dela é sua.
    var its = Cards.invoiceItems(State.transactions, i.card, i.key).filter(function(t){ return !(t.installment && t.installment.settled); });
    var mine = money(Math.min(i.left, Math.max(0, sum(its, myShare) + Cards.carryTotal(i.card, i.key))));
    var notes = [];
    if (i.status === 'aberta') notes.push('fatura aberta');
    if (i.paid > 0) notes.push('falta, de ' + fmtMoney(i.total));
    if (mine < i.left - 0.004) notes.push('seu: ' + fmtMoney(mine));
    out.push({title: 'Fatura ' + i.card.name, amount: i.left, date: i.due, late: i.status === 'vencida' || i.due < today,
      urgency: i.status === 'vencida' ? 'alta' : 'media', note: notes.join(' · '), go: 'cartoes'});
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
  var cur = monthBounds(0).key, today = todayKey(), rows = [], parts = {invoices: 0, bills: 0, scheduled: 0}, mineParts = {invoices: 0, bills: 0, scheduled: 0};
  var bills = pendingBills().filter(function(o){ return o.key === cur; });
  // fn: o que somar de cada gasto agendado (o valor todo ou só a parte que é minha).
  function scheduled(match, fn){
    return sumMoney(State.transactions.filter(function(t){ return t.type === 'expense' && !t.reversal && t.date > today && t.date.slice(0, 7) === cur && t.paymentMethod !== 'cartao' && match(t); }), fn || function(t){ return t.amount; });
  }
  bankGroups().forEach(function(g){
    var first = g.acc || g.cards[0], paid = 0, left = 0, leftMine = 0;
    if (g.acc){
      paid += -sumMoney(accountMoves(g.acc).filter(function(m){ return m.amount < 0 && m.kind !== 'Transferência' && m.kind !== 'Ajuste de saldo' && m.date.slice(0, 7) === cur; }), function(m){ return m.amount; });
      var sc = scheduled(function(t){ return t.accountId === g.acc.id; });
      var bl = sumMoney(bills.filter(function(o){ return o.b.pay === 'acc:' + g.acc.id; }), function(o){ return o.amount; });
      var scMine = scheduled(function(t){ return t.accountId === g.acc.id; }, myShare);
      parts.scheduled += sc; parts.bills += bl; left += sc + bl;
      mineParts.scheduled += scMine; mineParts.bills += bl; leftMine += scMine + bl;
    }
    g.cards.forEach(function(c){
      Cards.invoiceKeys(State.transactions, c).forEach(function(key){
        var dueMonth = Cards.invoiceDates(key, c).due.slice(0, 7);
        if (dueMonth > cur) return;   // fatura de mês que ainda não chegou
        var thisMonth = dueMonth === cur, pay = (c.invoicePayments || {})[key];
        // Pagamentos sem conta escolhida não aparecem no saldo: entram aqui.
        if (thisMonth && pay && !pay.accountId && Cards.invoiceStatus(c, key, today, State.transactions) === 'paga') paid += Number(pay.amount) || 0;
        if (thisMonth) paid += sumMoney(Cards.invoiceAdvances(c, key).filter(function(x){ return !x.accountId; }), function(x){ return x.amount; });
        if (Cards.invoiceStatus(c, key, today, State.transactions) !== 'paga'){
          var il = Cards.invoiceLeft(State.transactions, c, key); parts.invoices += il; left += il;
          // A parte minha do que falta: a minha parte da fatura continua toda a pagar (o que já foi
          // pago não a abate), limitada ao que falta. O resto do que falta é de outras pessoas.
          var its = Cards.invoiceItems(State.transactions, c, key).filter(function(t){ return !(t.installment && t.installment.settled); });
          var mn = Math.max(0, sum(its, myShare) + Cards.carryTotal(c, key)), mineLeft = Math.min(il, mn);
          mineParts.invoices += mineLeft; leftMine += mineLeft;
        }
      });
    });
    if (paid > 0 || left > 0) rows.push({name: first.name, paid: money(paid), left: money(left), mine: money(leftMine), go: 'cartoes'});
  });
  var cashPaid = sumMoney(State.transactions.filter(function(t){ return t.type === 'expense' && !t.reversal && t.paymentMethod === 'conta' && !t.accountId && t.date <= today && t.date.slice(0, 7) === cur && !t.outsideTotals; }), function(t){ return t.amount; });
  var cashSc = scheduled(function(t){ return !t.accountId; }), cashBills = sumMoney(bills.filter(function(o){ return o.b.pay === 'conta' || !o.b.pay; }), function(o){ return o.amount; });
  parts.scheduled += cashSc; parts.bills += cashBills;
  var cashScMine = scheduled(function(t){ return !t.accountId; }, myShare);
  mineParts.scheduled += cashScMine; mineParts.bills += cashBills;
  var cashLeft = cashSc + cashBills;
  if (cashPaid > 0 || cashLeft > 0) rows.push({name: 'Dinheiro', paid: money(cashPaid), left: money(cashLeft), mine: money(cashScMine + cashBills), go: 'lancamentos'});
  return {rows: rows, paid: sumMoney(rows, function(r){ return r.paid; }), left: sumMoney(rows, function(r){ return r.left; }), leftMine: sumMoney(rows, function(r){ return r.mine; }),
    invoices: money(parts.invoices), invoicesMine: money(mineParts.invoices), bills: money(parts.bills), scheduled: money(parts.scheduled)};
}
// Faturas que vencem no mês seguinte (o que falta pagar delas) e a parte que é minha. Para ver, em
// "Contas e cartões", como o mês que vem começa.
export function nextMonthInvoices(){
  var next = shiftMonthKey(monthBounds(0).key, 1), all = 0, mine = 0, list = [];
  State.cards.forEach(function(c){
    Cards.invoiceKeys(State.transactions, c).forEach(function(key){
      if (Cards.invoiceDates(key, c).due.slice(0, 7) !== next) return;
      var il = Cards.invoiceLeft(State.transactions, c, key);
      if (!(il > 0)) return;
      var its = Cards.invoiceItems(State.transactions, c, key).filter(function(t){ return !(t.installment && t.installment.settled); });
      var mn = Math.min(il, Math.max(0, sum(its, myShare) + Cards.carryTotal(c, key)));
      all += il; mine += mn; list.push({card: c, key: key, left: il, mine: money(mn)});
    });
  });
  // Contas fixas do mês que vem que ainda vão cair (ainda não lançadas) e ganhos previstos.
  var fixed = billMonth(next).filter(function(o){ return !o.paid && !o.skipped; });
  var income = forecastOccurrences(next).filter(function(o){ return o.received === undefined; });
  return {key: next, total: money(all), mine: money(mine), list: list,
    fixedTotal: money(sum(fixed, function(o){ return o.amount; })), fixed: fixed.map(function(o){ return {name: o.b.name, amount: o.amount}; }),
    incomeTotal: money(sum(income, function(o){ return o.f.amount; }))};
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
    out.push({kind: 'receber', title: r.description || r.person, where: r.person + ' te paga', total: info.n, done: info.paid, left: info.n - info.paid, leftAmount: left, per: recvNextAmount(r), go: 'receber',
      people: [r.person]});
  });
  return out.sort(function(a, b){ return (a.kind === 'receber') - (b.kind === 'receber') || a.left - b.left; });
}
export function plannedTotal(key){
  var plan = Budgets.budgetsFor(State.budgetBase, State.budgetMonths, key);
  return sumMoney(Object.keys(plan), function(cat){ return plan[cat]; });
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
    rows.push({card: c, key: key, label: Cards.invoiceLabel(key, c), due: Cards.invoiceDates(key, c).due, status: Cards.invoiceStatus(c, key, today, State.transactions),
      mine: mine, others: others, total: money(mine + others)});
  });
  var late = [];
  State.cards.forEach(function(c){
    Cards.invoiceKeys(State.transactions, c).forEach(function(kk){
      var v = Cards.invoiceDueTotal(State.transactions, c, kk);
      if (v > 0 && Cards.invoiceStatus(c, kk, today, State.transactions) === 'vencida') late.push(v);
    });
  });
  return {rows: rows, late: {count: late.length, total: money(sum(late, function(v){ return v; }))}};
}
export function pctOf(v, t){ return t > 0 ? Math.round(100 * v / t) : 0; }
export function monthName(offset){ return monthBounds(offset || 0).label.split(' de ')[0].toLowerCase(); }
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
    return {name: (g.acc || g.cards[0]).name, credit: credit, debit: debit, total: money(credit + debit), accIds: accIds, cardIds: cardIds};
  });
  var cash = money(sum(tx.filter(function(t){ return (t.paymentMethod === 'conta' || !t.paymentMethod) && !usedAcc[t.accountId]; }), function(t){ return t.amount; }));
  var vale = money(sum(tx.filter(function(t){ return t.paymentMethod === 'vale'; }), function(t){ return t.amount; }));
  return {rows: rows, cash: cash, vale: vale};
}
/* ---------- Gráficos do Início: mês escolhido (passado, atual ou futuro com previsão) ---------- */
export var DASH_MIN = -36, DASH_MAX = 12;
export function dashMonth(){ return monthBounds(State.dashOffset || 0); }
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
export function projectCats(key, all){
  var out = Object.assign({}, expenseCategoryTotals(key, all));
  monthProjection(key).bills.forEach(function(o){ out[o.b.category] = money((out[o.b.category] || 0) + o.amount); });
  return out;
}
