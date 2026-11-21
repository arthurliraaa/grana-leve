/*
 * Simulador: "se eu fizer isso, como ficam as minhas contas?". Compra (à vista, no cartão ou com o dinheiro de uma
 * meta), empréstimo/financiamento e gasto fixo. Nada é salvo ao simular; "Registrar de verdade" cria o lançamento,
 * a dívida ou a conta fixa, e (se for o caso) tira o dinheiro da meta.
 */
import {todayKey, monthKeyOf, monthBounds, monthLabelOf, shiftMonthKey, monthsBetween, validDateStr, formatDateBr} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import * as Cards from '../domain/cards.js';
import * as Tx from '../domain/transactions.js';
import {myShare, isPersonal} from '../domain/transactions.js';
import {projectCash, firstRedMonth, splitInstallments, goalUseImpact} from '../domain/simulate.js';
import {Store} from '../data/store.js';
import {qs, qsa, escapeHtml, optionsHtml, toast} from './dom.js';
import {State, k, catLabel, catOptions, expenseCats, incomeCats, txForMonth, expenseCategoryTotals, budgetLimit, cardUsed, expandInstallments, forecastOccurrences, totalAccountsBalance} from './state.js';
import {billMonth} from './bills.js';
import {dashboardFigures, monthPayments} from './home-tab.js';
import {applyPayment, paymentOptions} from './tx-list.js';
import {offGoalWarningHtml, goalMove} from './planning-tab.js';
import {renderAll, showTab} from './shell.js';
import {saveTransactions} from './tx-edit.js';
import {savedSalary} from './salary-calc.js';

var KINDS = [{id: 'compra', label: 'Compra'}, {id: 'ganho', label: 'Ganho'}, {id: 'emprestimo', label: 'Empréstimo ou financiamento'}, {id: 'fixo', label: 'Gasto fixo mensal'}];
var HORIZONS = [3, 6, 12];

// O que sai (a parte da pessoa) de faturas que vencem no mês `key`.
function invoicesMineDue(key){
  var tot = 0;
  State.cards.forEach(function(c){
    Cards.invoiceKeys(State.transactions, c).forEach(function(ik){
      if (Cards.invoiceDates(ik, c).due.slice(0, 7) !== key) return;
      var left = Cards.invoiceLeft(State.transactions, c, ik);
      if (!(left > 0)) return;
      var its = Cards.invoiceItems(State.transactions, c, ik).filter(function(t){ return !(t.installment && t.installment.settled); });
      tot += Math.min(left, Math.max(0, sum(its, myShare) + Cards.carryTotal(c, ik)));
    });
  });
  return money(tot);
}
// Salário que a pessoa costuma receber: média dos últimos 3 meses em que ele entrou (precisa de pelo menos 2).
function salaryAverage(){
  var cur = monthBounds(0).key, vals = [];
  for (var i = 1; i <= 3; i++){
    var v = sumMoney(txForMonth(shiftMonthKey(cur, -i)).filter(function(t){ return t.type === 'income' && isPersonal(t) && !t.refund && t.category === 'salario'; }), function(t){ return Number(t.amount) || 0; });
    if (v > 0) vals.push(v);
  }
  if (vals.length >= 2) return money(sum(vals, function(v){ return v; }) / vals.length);
  // Ainda sem 2 meses de salário lançado: vale o líquido que a pessoa calculou (e guardou) na calculadora do salário.
  var calc = savedSalary();
  return calc ? money(calc.fixedNet) : 0;
}
// De onde vem o salário de costume: da média dos meses lançados ou do líquido calculado.
function salarySource(){
  var cur = monthBounds(0).key, n = 0;
  for (var i = 1; i <= 3; i++){ if (txForMonth(shiftMonthKey(cur, -i)).some(function(t){ return t.type === 'income' && isPersonal(t) && !t.refund && t.category === 'salario'; })) n++; }
  return n >= 2 ? 'average' : 'calc';
}
// Já assumido para cada mês (do atual em diante): o que sai e o que está previsto entrar. Com useSalary, entra também o
// salário de costume nos meses em que ainda não há salário previsto nem recebido.
function baselineMonths(n, useSalary){
  var salary = useSalary ? salaryAverage() : 0, curKey = monthBounds(0).key;
  var cur = monthBounds(0).key, rows = [], mp = monthPayments(), f = dashboardFigures();
  var debtMonthly = sumMoney(State.debts, function(d){ var left = Math.max(0, Number(d.totalAmount || 0) - Number(d.paidAmount || 0)); return left > 0 && Number(d.monthlyPayment) > 0 ? Math.min(Number(d.monthlyPayment), left) : 0; });
  for (var i = 0; i < n; i++){
    var key = shiftMonthKey(cur, i);
    var out = i === 0 ? mp.leftMine : money(invoicesMineDue(key) + sumMoney(billMonth(key).filter(function(o){ return !o.paid && !o.skipped; }), function(o){ return o.amount; }) + debtMonthly);
    var pending = forecastOccurrences(key).filter(function(o){ return o.received === undefined; });
    var inc = i === 0 ? f.expectedIncome : sumMoney(pending, function(o){ return o.f.amount; });
    var hasSalary = pending.some(function(o){ return o.f.category === 'salario'; }) || (i === 0 && txForMonth(curKey).some(function(t){ return t.type === 'income' && t.category === 'salario' && isPersonal(t); }));
    var sal = salary > 0 && !hasSalary ? salary : 0;
    inc = money(inc + sal);
    rows.push({key: key, label: monthLabelOf(key).split(' de ')[0] + (i === 0 ? ' (este mês)' : ''), out: out, inc: inc, sal: sal});
  }
  return rows;
}

function payChoices(forFixed){
  var opts = paymentOptions().filter(function(o){ return o.id !== 'card:none' && o.id.indexOf('vale') !== 0; });
  if (!forFixed) State.goals.filter(function(g){ return !g.deletedAt && Number(g.currentAmount) > 0; }).forEach(function(g){
    opts.push({id: 'goal:' + g.id, label: 'Dinheiro da meta · ' + g.name + ' (' + fmtMoney(g.currentAmount) + ' guardados)'});
  });
  return opts;
}

function formHtml(actions){
  var cats = catOptions(expenseCats()), pays = payChoices(false);
  return '<div class="sim-kinds" role="group" aria-label="O que simular">' + KINDS.map(function(x, i){
      return '<label class="chip-radio"><input type="radio" name="kind" value="' + x.id + '"' + (i ? '' : ' checked') + '><span>' + x.label + '</span></label>'; }).join('') + '</div>' +
    '<div class="sim-body"><div class="sim-left">' +
    '<div class="sim-grid">' +
      '<div class="field f-full"><label for="simName">Descrição</label><input id="simName" name="name" type="text" maxlength="50" placeholder="Ex: geladeira, viagem, financiamento"></div>' +
      '<div class="field" data-for="compra"><label for="simAmount">Valor total</label><span class="money-input"><span>R$</span><input id="simAmount" name="amount" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field" data-for="compra"><label for="simPay">Pagar com</label><select id="simPay" name="pay">' + optionsHtml(pays, (pays.filter(function(p){ return p.id.indexOf('card:') === 0; })[0] || pays[0] || {}).id) + '</select></div>' +
      '<div class="field" data-for="compra" data-card><label for="simN">Em quantas parcelas</label><input id="simN" name="n" type="number" min="1" max="24" step="1" value="1"></div>' +
      '<div class="field" data-for="compra"><label for="simDate">Data da compra</label><input id="simDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + todayKey() + '"></div>' +
      '<div class="field" data-for="compra,fixo"><label for="simCat">Categoria</label><select id="simCat" name="cat">' + optionsHtml(cats, (cats[0] || {}).id) + '</select></div>' +
      '<div class="field" data-for="ganho"><label for="simIncAmount">Valor do ganho</label><span class="money-input"><span>R$</span><input id="simIncAmount" name="incamount" type="text" data-money autocomplete="off" inputmode="decimal"></span><button type="button" class="linklike sal-link" data-salary-calc="simIncAmount">É salário? Calcular o líquido</button></div>' +
      '<div class="field" data-for="ganho"><label for="simIncFreq">Com que frequência</label><select id="simIncFreq" name="incfreq"><option value="once">Uma vez só (ex.: bônus, venda)</option><option value="monthly">Todo mês (ex.: aumento, novo trabalho)</option></select></div>' +
      '<div class="field" data-for="ganho"><label for="simIncStart">Começa a receber</label><select id="simIncStart" name="incstart"><option value="0">Neste mês</option><option value="1" selected>No mês que vem</option></select></div>' +
      '<div class="field" data-for="ganho"><label for="simIncAcc">Entra em</label><select id="simIncAcc" name="incacc">' + optionsHtml(State.accounts.map(function(a){ return {id: a.id, label: a.name}; }).concat([{id: '', label: 'Dinheiro (fora das contas)'}]), (State.accounts[0] || {id: ''}).id) + '</select></div>' +
      '<div class="field" data-for="emprestimo"><label for="simRecv">Dinheiro que entra na conta <span class="opt">(opcional)</span></label><span class="money-input"><span>R$</span><input id="simRecv" name="recv" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field" data-for="emprestimo"><label for="simParcels">Número de parcelas</label><input id="simParcels" name="parcels" type="number" min="1" max="120" step="1" value="12"></div>' +
      '<div class="field" data-for="emprestimo"><label for="simParcel">Valor de cada parcela</label><span class="money-input"><span>R$</span><input id="simParcel" name="parcel" type="text" data-money autocomplete="off" inputmode="decimal"></span><span class="field-hint">Já com juros, como o banco informou. A 1ª parcela cai no mês que vem.</span></div>' +
      '<div class="field" data-for="fixo"><label for="simMonthly">Valor por mês</label><span class="money-input"><span>R$</span><input id="simMonthly" name="monthly" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field" data-for="fixo"><label for="simFixPay">Paga com</label><select id="simFixPay" name="fixpay">' + optionsHtml(payChoices(true), (payChoices(true)[0] || {}).id) + '</select></div>' +
      '<div class="field" data-for="fixo"><label for="simDay">Dia do mês</label><input id="simDay" name="day" type="number" min="1" max="31" step="1" value="5"></div>' +
      '<div class="field" data-for="fixo"><label for="simStart">Começa</label><select id="simStart" name="start"><option value="0">Neste mês</option><option value="1" selected>No mês que vem</option></select></div>' +
    '</div>' +
    '<div class="sim-goal" data-goalbox hidden>' +
      '<fieldset class="radio-group"><legend>Esse dinheiro é para quê?</legend>' +
        '<label class="check"><input type="radio" name="purpose" value="meta" checked> Para o objetivo da meta (ex.: pagar a viagem)</label>' +
        '<label class="check"><input type="radio" name="purpose" value="outro"> Para outra coisa (fora do objetivo)</label></fieldset>' +
      '<fieldset class="radio-group"><legend>Ao registrar</legend>' +
        '<label class="check"><input type="radio" name="gmode" value="lancar" checked> Lançar o gasto em Ganhos e gastos e tirar da meta</label>' +
        '<label class="check"><input type="radio" name="gmode" value="so"> Só tirar da meta (sem lançar gasto)</label></fieldset>' +
    '</div>' +
    '<div class="sim-hz"><span>Olhar os próximos</span>' + HORIZONS.map(function(h){ return '<label class="chip-radio"><input type="radio" name="hz" value="' + h + '"' + (h === 6 ? ' checked' : '') + '><span>' + h + ' meses</span></label>'; }).join('') + '</div>' +
    '<label class="check sim-sal"><input type="checkbox" name="carry"> Somar o que sobra (ou falta) de um mês no seguinte</label>' +
    (salaryAverage() > 0 ? '<label class="check sim-sal"><input type="checkbox" name="usesal" checked> Considerar o meu salário nos próximos meses (cerca de ' + fmtMoney(salaryAverage()) + ' por mês, ' + (salarySource() === 'calc' ? 'o líquido que você calculou na calculadora do salário' : 'a média dos últimos meses') + ')</label>' : '') +
    (actions || '') + '</div><div id="simResult" class="sim-result" aria-live="polite"></div></div>';
}

// Lê o formulário e calcula tudo. Devolve também o texto de erro (quando falta algo) para o registro.
function readForm(form){
  var v = function(n){ return form.elements[n] ? form.elements[n].value : ''; };
  var kind = (qs('input[name=kind]:checked', form) || {}).value || 'compra';
  var hz = Number((qs('input[name=hz]:checked', form) || {}).value) || 6;
  var s = {kind: kind, hz: hz, usesal: !!(form.elements.usesal && form.elements.usesal.checked), carry: !!(form.elements.carry && form.elements.carry.checked), name: v('name').trim(), cat: v('cat'), notes: [], warns: [], adds: {}, inflowNow: 0, error: ''};
  if (kind === 'compra'){
    s.amount = money(v('amount')); s.pay = v('pay'); s.date = v('date') || todayKey();
    s.isCard = s.pay.indexOf('card:') === 0; s.isGoal = s.pay.indexOf('goal:') === 0;
    s.n = s.isCard ? Tx.clampInstall(v('n')) : 1;
    s.purpose = (qs('input[name=purpose]:checked', form) || {}).value || 'meta'; s.gmode = (qs('input[name=gmode]:checked', form) || {}).value || 'lancar';
    if (!(s.amount > 0)) s.error = 'Informe o valor da compra.'; else if (!validDateStr(s.date)) s.error = 'Use uma data entre 1900 e 3000.';
  } else if (kind === 'ganho'){
    s.amount = money(v('incamount')); s.freq = v('incfreq') || 'once'; s.start = Number(v('incstart')) || 0; s.acc = v('incacc');
    if (!(s.amount > 0)) s.error = 'Informe o valor do ganho.'; else if (!s.name) s.error = 'Dê um nome ao ganho.';
  } else if (kind === 'emprestimo'){
    s.recv = money(v('recv')); s.parcels = Math.max(1, Math.round(Number(v('parcels')) || 0)); s.parcel = money(v('parcel'));
    if (!(s.parcel > 0)) s.error = 'Informe o valor de cada parcela.'; else if (!s.name) s.error = 'Dê um nome ao empréstimo.';
  } else {
    s.monthly = money(v('monthly')); s.pay = v('fixpay'); s.day = Math.round(Number(v('day')) || 0); s.start = Number(v('start')) || 0;
    if (!(s.monthly > 0)) s.error = 'Informe o valor por mês.'; else if (!s.name) s.error = 'Dê um nome ao gasto.'; else if (!(s.day >= 1 && s.day <= 31)) s.error = 'O dia vai de 1 a 31.';
  }
  return s;
}
function monthsFromNow(key){ return monthsBetween(monthBounds(0).key, key); }

function compute(s){
  var cur = monthBounds(0), today = todayKey(), adds = s.adds, notes = s.notes, warns = s.warns;
  if (s.error) return null;
  if (s.kind === 'compra'){
    if (s.isCard){
      var card = findById(State.cards, s.pay.slice(5));
      var key0 = Cards.invoiceKeyFor(s.date, card), parts = splitInstallments(s.amount, s.n), first = Cards.invoiceDates(key0, card);
      parts.forEach(function(p, i){
        var due = Cards.invoiceDates(shiftMonthKey(key0, i), card).due.slice(0, 7), off = monthsFromNow(due);
        if (off >= 0 && off < s.hz) adds[off] = money((adds[off] || 0) + p);
      });
      notes.push('Compra em ' + formatDateBr(s.date) + ': o ' + escapeHtml(card.name) + ' fecha dia ' + card.closingDay + ' e vence dia ' + card.dueDay + ', então a ' + (s.n > 1 ? '1ª parcela' : 'compra') + ' entra na fatura de ' + Cards.invoiceLabel(key0, card) + ' (fecha ' + formatDateBr(first.closing) + ', vence ' + formatDateBr(first.due) + ').');
      if (s.n > 1){
        var lastD = Cards.invoiceDates(shiftMonthKey(key0, s.n - 1), card);
        notes.push(s.n + ' parcelas de cerca de ' + fmtMoney(parts[1] || parts[0]) + ', uma por fatura: da fatura de ' + Cards.invoiceLabel(key0, card) + ' (vence ' + formatDateBr(first.due) + ') até a de ' + Cards.invoiceLabel(shiftMonthKey(key0, s.n - 1), card) + ' (vence ' + formatDateBr(lastD.due) + '). Cada parcela pesa no mês em que a fatura vence.');
      }
      var limit = Number(card.limit) || 0, used = cardUsed(card);
      if (limit > 0){
        var after = money(used + s.amount);
        // A compra inteira (todas as parcelas) já ocupa o limite; ele volta aos poucos, conforme as faturas são pagas.
        s.limitInfo = {name: card.name, limit: limit, used: used, avail: money(limit - used), after: after, availAfter: money(limit - after),
          usedPct: Math.min(100, Math.round(100 * used / limit)), newPct: Math.max(0, Math.min(100 - Math.min(100, Math.round(100 * used / limit)), Math.round(100 * s.amount / limit))),
          pct: Math.round(100 * after / limit), over: after > limit + 0.004, short: money(Math.max(0, after - limit)), per: s.n > 1 ? money(s.amount / s.n) : s.amount};
        if (s.limitInfo.over) warns.push('Passa do limite disponível do ' + escapeHtml(card.name) + ': faltam ' + fmtMoney(s.limitInfo.short) + ' de limite.');
      }
    } else if (s.isGoal){
      var g = findById(State.goals, s.pay.slice(5)), imp = goalUseImpact(g, s.amount, today);
      s.goal = g;
      notes.push('Sai do que você guardou em “' + escapeHtml(g.name) + '”: de ' + fmtMoney(imp.current) + ' fica ' + fmtMoney(imp.after) + (imp.hasTarget ? ' (' + imp.pctBefore + '% → ' + imp.pctAfter + '% do alvo)' : '') + '. As contas do banco não mudam.');
      if (imp.shortfall > 0) warns.push('Isso é mais do que há guardado na meta (faltam ' + fmtMoney(imp.shortfall) + ').');
      if (s.purpose === 'outro') warns.push(offGoalWarningHtml(g, s.amount));
    } else {
      var off0 = Math.max(0, monthsFromNow(monthKeyOf(s.date)));
      if (off0 < s.hz) adds[off0] = money((adds[off0] || 0) + s.amount);
      var accId = s.pay.indexOf('acc:') === 0 ? s.pay.slice(4) : null;
      notes.push('Sai ' + (accId ? 'da conta ' + escapeHtml((findById(State.accounts, accId) || {}).name || '') : 'em dinheiro') + ' em ' + formatDateBr(s.date) + '.');
    }
    // Planejamento da categoria: o que cai neste mês.
    var thisMonth = s.isGoal ? 0 : adds[0] || 0, lim = budgetLimit(cur.key, s.cat);
    if (lim > 0 && thisMonth > 0){
      var spent = money((expenseCategoryTotals(cur.key)[s.cat] || 0) + thisMonth);
      notes.push('Planejamento de ' + escapeHtml(catLabel(s.cat, 'expense')) + ': ficaria em ' + fmtMoney(spent) + ' de ' + fmtMoney(lim) + ' (' + Math.round(100 * spent / lim) + '%).');
      if (spent > lim) warns.push(escapeHtml(catLabel(s.cat, 'expense')) + ' passaria do limite do mês em ' + fmtMoney(money(spent - lim)) + '.');
    }
  } else if (s.kind === 'ganho'){
    // Ganho entra como "saída negativa": soma ao saldo dos meses em que cai.
    if (s.freq === 'monthly'){
      for (var g2 = s.start; g2 < s.hz; g2++) adds[g2] = money((adds[g2] || 0) - s.amount);
      notes.push('Ganho de ' + fmtMoney(s.amount) + ' todo mês: ' + fmtMoney(money(s.amount * 12)) + ' em um ano.');
    } else {
      if (s.start < s.hz) adds[s.start] = money((adds[s.start] || 0) - s.amount);
      notes.push('Entra uma vez só, ' + (s.start === 0 ? 'neste mês' : 'no mês que vem') + ', ' + (s.acc ? 'na conta ' + escapeHtml((findById(State.accounts, s.acc) || {}).name || '') : 'em dinheiro') + '.');
    }
  } else if (s.kind === 'emprestimo'){
    s.inflowNow = s.recv;
    for (var i = 1; i <= s.parcels && i < s.hz; i++) adds[i] = money((adds[i] || 0) + s.parcel);
    var total = money(s.parcel * s.parcels);
    notes.push(s.parcels + ' parcelas de ' + fmtMoney(s.parcel) + ' = ' + fmtMoney(total) + ' no total' + (s.recv > 0 ? '. Você recebe ' + fmtMoney(s.recv) + ' e paga ' + fmtMoney(money(total - s.recv)) + ' a mais (juros e taxas).' : '.'));
  } else {
    for (var j = s.start; j < s.hz; j++) adds[j] = money((adds[j] || 0) + s.monthly);
    notes.push('Gasto de ' + fmtMoney(s.monthly) + ' todo mês: ' + fmtMoney(money(s.monthly * 12)) + ' em um ano.');
    var limF = budgetLimit(cur.key, s.cat);
    if (limF > 0 && s.start === 0){
      var spF = money((expenseCategoryTotals(cur.key)[s.cat] || 0) + s.monthly);
      notes.push('Planejamento de ' + escapeHtml(catLabel(s.cat, 'expense')) + ' neste mês: ' + fmtMoney(spF) + ' de ' + fmtMoney(limF) + ' (' + Math.round(100 * spF / limF) + '%).');
      if (spF > limF) warns.push(escapeHtml(catLabel(s.cat, 'expense')) + ' passaria do limite do mês.');
    }
  }
  var cash = State.accounts.length ? totalAccountsBalance() : 0;
  var base = baselineMonths(s.hz, s.usesal);
  s.rows = projectCash(cash, base, adds, s.inflowNow, s.carry);
  if (s.usesal && base.some(function(b){ return b.sal > 0; })) notes.push('Considerei o seu salário de cerca de ' + fmtMoney(salaryAverage()) + ' por mês (' + (salarySource() === 'calc' ? 'o líquido que você calculou na calculadora do salário' : 'média dos últimos meses') + ') nos meses em que ele ainda não está lançado nem previsto. Desmarque a opção acima para ver sem ele.');
  s.cash = cash;
  return s;
}

// Um mês no resultado: nome curto (“dez/26”) e marca de “agora” no mês atual.
function monthShort(r){ return monthLabelOf(r.key).split(' de ')[0].slice(0, 3) + '/' + r.key.slice(2, 4) + (/este mês/.test(r.label) ? ' · agora' : ''); }
function simCell(r){ return r.added > 0 ? '− ' + fmtMoney(r.added) : r.added < 0 ? '+ ' + fmtMoney(-r.added) : '—'; }
function simCls(r){ return r.added > 0 ? 'neg-text' : r.added < 0 ? 'pos-text' : ''; }
function sobra(v){ return '<span class="' + (v < 0 ? 'neg-text' : '') + '">' + fmtMoney(v) + '</span>'; }
// Tabela (telas largas) e cartões por mês (celular): o mesmo conteúdo, sem precisar rolar para os lados.
function monthsHtml(s){
  var table = '<div class="sim-table-wrap"><table class="data-table sim-table"><thead><tr><th>Mês</th><th>Já assumido</th><th>Simulação</th><th>Ganhos</th><th>Sobra sem</th><th>Sobra com</th></tr></thead><tbody>' + s.rows.map(function(r){
    return '<tr><td>' + escapeHtml(monthShort(r)) + '</td><td class="tabular">' + fmtMoney(r.out) + '</td><td class="tabular ' + simCls(r) + '">' + simCell(r) + '</td><td class="tabular">' + fmtMoney(r.inc) + '</td>' +
      '<td class="tabular">' + sobra(r.base) + '</td><td class="tabular"><strong>' + sobra(r.sim) + '</strong></td></tr>'; }).join('') + '</tbody></table></div>';
  var cards = '<div class="sim-months">' + s.rows.map(function(r){
    return '<div class="sim-month"><div class="sm-head"><strong>' + escapeHtml(monthShort(r)) + '</strong><span>Sobra com a simulação <strong class="tabular">' + sobra(r.sim) + '</strong></span></div>' +
      '<div class="sm-grid"><span>Já assumido</span><b class="tabular">' + fmtMoney(r.out) + '</b><span>Simulação</span><b class="tabular ' + simCls(r) + '">' + simCell(r) + '</b>' +
      '<span>Ganhos</span><b class="tabular">' + fmtMoney(r.inc) + '</b><span>Sobra sem ela</span><b class="tabular">' + sobra(r.base) + '</b></div></div>'; }).join('') + '</div>';
  return table + cards;
}
// Cartão: limite do cartão antes e depois da compra, com barra (o que já usa + esta compra).
function limitHtml(s){
  var L = s.limitInfo;
  if (!L) return '';
  var tone = L.over ? 'bad' : L.pct >= 90 ? 'warn' : 'good';
  return '<div class="sim-limit ' + tone + '"><div class="sl-head"><strong>Limite do cartão · ' + escapeHtml(L.name) + '</strong>' +
    '<span>' + (L.over ? 'não cabe: faltam ' + fmtMoney(L.short) : 'depois da compra, sobram ' + fmtMoney(L.availAfter) + ' de ' + fmtMoney(L.limit)) + '</span></div>' +
    '<div class="sl-bar" role="img" aria-label="' + L.pct + '% do limite usado depois da compra"><span class="used" style="width:' + L.usedPct + '%"></span><span class="new" style="width:' + L.newPct + '%"></span></div>' +
    '<div class="sl-grid"><span>Limite</span><b class="tabular">' + fmtMoney(L.limit) + '</b><span>Já usado</span><b class="tabular">' + fmtMoney(L.used) + '</b>' +
      '<span>Disponível agora</span><b class="tabular">' + fmtMoney(L.avail) + '</b><span>Esta compra' + (L.per !== undefined && s.n > 1 ? ' (' + s.n + 'x de ' + fmtMoney(L.per) + ')' : '') + '</span><b class="tabular">' + fmtMoney(s.amount) + '</b>' +
      '<span>Disponível depois</span><b class="tabular ' + (L.over ? 'neg-text' : '') + '">' + fmtMoney(L.availAfter) + '</b></div>' +
    '<p class="tx-meta">A compra toda (todas as parcelas) ocupa o limite agora, e ele volta a ser liberado conforme você paga cada fatura.</p></div>';
}
function resultHtml(s){
  if (s.error) return '<p class="tx-meta">' + escapeHtml(s.error.replace(/^Informe o valor da compra\.$/, 'Preencha o valor para ver como ficariam as contas.')) + '</p>';
  var red = firstRedMonth(s.rows), first = s.rows[0], min = Math.min.apply(null, s.rows.map(function(r){ return r.sim; }));
  var tight = !red && s.cash > 0 && first.sim < s.cash * 0.1;
  var gain = s.rows.filter(function(r){ return r.added < 0; })[0];
  var verdict = s.kind === 'ganho' && gain ? ['good', 'Com esse ganho, ' + gain.label.replace(' (este mês)', '') + ' ficaria com ' + fmtMoney(gain.sim) + ' (' + fmtMoney(-gain.added) + ' a mais)' + (s.freq === 'monthly' ? ', e o mesmo vale para os meses seguintes.' : '.')] :
    s.isGoal ? (s.purpose === 'outro' ? ['warn', 'Usa dinheiro guardado na meta para outra coisa. As contas do banco não mudam, mas a meta encolhe.'] : ['good', 'O dinheiro vem da meta, para o objetivo dela. As contas do banco não mudam.']) :
    s.limitInfo && s.limitInfo.over ? ['bad', 'Não cabe no limite do cartão: faltam ' + fmtMoney(s.limitInfo.short) + ' de limite disponível.'] :
    red ? ['bad', 'Deixa ' + red.label.replace(' (este mês)', '') + ' no vermelho (' + fmtMoney(red.sim) + ')' + (red.wasRed ? ', mês que já estava negativo sem a simulação.' : '.')] :
    tight ? ['warn', 'Cabe, mas deixa as contas apertadas: neste mês sobrariam ' + fmtMoney(first.sim) + '.'] : ['good', 'Cabe nas contas: o menor valor que sobra num mês seria ' + fmtMoney(min) + '.'];
  var noAcc = !State.accounts.length ? '<p class="tx-meta">Sem contas cadastradas, o primeiro mês parte de R$ 0,00. Cadastre suas contas em “Contas e cartões” para um resultado mais real.</p>' : '';
  var how = s.carry ? 'O saldo parte do que há nas contas hoje (' + fmtMoney(s.cash) + ') e o que sobra (ou falta) de um mês segue para o outro.' :
    'Cada mês é visto sozinho: ganhos − o que já está assumido − a simulação. Só o mês atual parte do que há nas contas hoje (' + fmtMoney(s.cash) + '). Marque “Somar o que sobra…” para acumular de um mês para o outro.';
  return '<div class="sim-verdict ' + verdict[0] + '"><strong>' + verdict[1] + '</strong></div>' +
    (s.warns.length ? '<ul class="sim-warns">' + s.warns.map(function(w){ return '<li>' + w + '</li>'; }).join('') + '</ul>' : '') + limitHtml(s) +
    (s.isGoal ? '' : monthsHtml(s) + '<p class="tx-meta">' + how + ' Já assumido = faturas suas que vencem no mês, contas fixas e parcelas de dívidas.</p>') +
    '<ul class="sim-notes">' + s.notes.map(function(n){ return '<li>' + n + '</li>'; }).join('') + '</ul>' + noAcc;
}

// Painel da guia “Simular” (em Ganhos e gastos): formulário à esquerda e resultado ao lado, ao vivo.
// Montado de novo toda vez que a guia abre, para refletir as contas, cartões e metas de agora.
export function renderSimulator(){
  var panel = document.getElementById('simPanel');
  if (!panel) return;
  panel.innerHTML = formHtml('<div class="sim-actions"><button type="submit" class="btn btn-primary" id="simSubmit">Registrar de verdade</button>' +
    '<button type="button" class="btn btn-ghost" id="simClear">Limpar</button>' +
    '<p class="form-error" id="simError" role="alert"></p></div>');
  panel.insertAdjacentHTML('afterbegin', '<h3 class="sim-title">Simular gasto ou ganho</h3>');
  syncSimulator();
}
function syncSimulator(){
  var form = document.getElementById('simForm'), panel = document.getElementById('simPanel');
  if (!form || !panel) return;
  var kind = (qs('input[name=kind]:checked', panel) || {}).value;
  qsa('[data-for]', panel).forEach(function(el){ el.hidden = el.getAttribute('data-for').split(',').indexOf(kind) < 0; });
  var pay = qs('#simPay', panel).value;
  qs('[data-card]', panel).hidden = !(kind === 'compra' && pay.indexOf('card:') === 0);
  qs('[data-goalbox]', panel).hidden = !(kind === 'compra' && pay.indexOf('goal:') === 0);
  var s = readForm(form);
  qs('#simResult', panel).innerHTML = resultHtml(compute(s) || s);
  var err = document.getElementById('simError'); if (err) err.textContent = '';
}
async function submitSimulator(e){
  e.preventDefault();
  var form = document.getElementById('simForm'), err = document.getElementById('simError');
  var s = readForm(form);
  if (s.error){ err.textContent = s.error; return; }
  if (s.kind === 'compra' && s.isGoal){
    s.goal = findById(State.goals, s.pay.slice(5));
    if (s.amount > Number(s.goal.currentAmount || 0) + 0.001){ err.textContent = 'A meta só tem ' + fmtMoney(s.goal.currentAmount || 0) + ' guardados.'; return; }
  }
  await registerSimulation(s);
  renderSimulator();   // começa uma simulação nova
}

// Registrar de verdade: o que foi simulado vira lançamento, dívida ou conta fixa.
export async function registerSimulation(s){
  if (s.kind === 'compra'){
    var tx = {type: 'expense', amount: s.amount, category: s.cat, categoryLabel: catLabel(s.cat, 'expense'), date: s.date, description: s.name, paymentMethod: null, accountId: null, createdAt: Date.now()};
    var g = s.isGoal ? findById(State.goals, s.pay.slice(5)) : null;
    if (g){
      // Direto na meta, ou também como gasto em Ganhos e gastos (sem mexer no saldo de nenhuma conta).
      var txId = null;
      if (s.gmode === 'lancar'){
        tx.paymentMethod = 'conta'; tx.goalId = g.id; tx.description = (s.name || catLabel(s.cat, 'expense')) + ' (da meta ' + g.name + ')';
        var saved = await saveTransactions([tx]);
        txId = saved[0].id;
      }
      await goalMove(g.id, 'withdraw', s.amount, Object.assign({purpose: s.purpose === 'outro' ? 'outro' : 'meta'}, txId ? {txId: txId} : {}));
      renderAll();
      toast(fmtMoney(s.amount) + ' saíram de “' + g.name + '”' + (txId ? ' e entraram em Ganhos e gastos' : '') + (s.purpose === 'outro' ? '. É para outra coisa: lembre de repor.' : '.'));
      return;
    }
    applyPayment(tx, s.pay);
    var n = tx.paymentMethod === 'cartao' ? s.n : 1;
    tx.amount = Tx.purchaseTotal(s.amount, n, null);
    await saveTransactions(expandInstallments(tx, n, 1));
    renderAll();
    var cardT = tx.paymentMethod === 'cartao' ? findById(State.cards, tx.cardId) : null;
    toast('Compra registrada' + (cardT ? ' na fatura de ' + Cards.invoiceLabel(Cards.invoiceKeyFor(s.date, cardT), cardT) + ' do ' + cardT.name : ' e descontada da conta') + (n > 1 ? ' em ' + n + 'x' : '') + '.');
    return;
  }
  if (s.kind === 'ganho'){
    var incCat = (incomeCats().filter(function(c){ return c.id === 'salario'; })[0] || incomeCats()[0] || {id: 'outros_receita'}).id;
    if (s.freq === 'monthly'){
      // Todo mês: vira uma previsão recorrente (aparece em “Previstas” e entra na previsão do mês).
      var sd = s.start === 0 ? todayKey() : shiftMonthKey(monthBounds(0).key, 1) + '-01';
      var fc = {description: s.name, amount: s.amount, date: sd, recurring: true, category: /sal[aá]rio/i.test(s.name) ? 'salario' : 'outros_receita', received: {}, createdAt: Date.now()};
      var savedF = await Store.add(k(), 'forecasts', fc);
      State.forecasts.push(savedF);
      renderAll();
      toast('Ganho previsto de ' + fmtMoney(s.amount) + ' por mês adicionado em “Previstas”. Quando cair, é só registrar o recebimento.');
      return;
    }
    var itx = {type: 'income', amount: s.amount, category: incCat, categoryLabel: catLabel(incCat, 'income'), date: s.start === 0 ? todayKey() : shiftMonthKey(monthBounds(0).key, 1) + '-01',
      description: s.name, paymentMethod: null, accountId: s.acc || null, createdAt: Date.now()};
    await saveTransactions([itx]);
    renderAll();
    toast('Ganho de ' + fmtMoney(s.amount) + ' registrado' + (s.start === 0 ? '.' : ' para o mês que vem.'));
    return;
  }
  if (s.kind === 'emprestimo'){
    var debt = {name: s.name, kind: 'emprestimo', creditor: '', totalAmount: money(s.parcel * s.parcels), paidAmount: 0, monthlyPayment: s.parcel, urgency: 'media', createdAt: Date.now()};
    var savedD = await Store.add(k(), 'debts', debt);
    State.debts.push(savedD);
    renderAll();
    toast('Dívida “' + s.name + '” registrada em Compromissos.' + (s.recv > 0 ? ' O dinheiro que entrou (' + fmtMoney(s.recv) + ') não foi lançado: registre como ganho ou transferência se já caiu na conta.' : ''));
    showTab('dividas');
    return;
  }
  var start = shiftMonthKey(monthBounds(0).key, s.start);
  var bill = {name: s.name, category: s.cat, amount: s.monthly, every: 1, dueDay: s.day, startMonth: start, pay: s.pay, amounts: [], paid: {}, createdAt: Date.now()};
  var savedB = await Store.add(k(), 'bills', bill);
  State.bills.push(savedB);
  renderAll();
  toast('Conta fixa “' + s.name + '” adicionada em Ganhos e gastos, a partir de ' + monthLabelOf(start) + '.');
}

export function wireSimulator(){
  var form = document.getElementById('simForm');
  if (form){
    form.addEventListener('input', syncSimulator); form.addEventListener('change', syncSimulator);
    form.addEventListener('submit', submitSimulator);
    form.addEventListener('click', function(e){ if (e.target.closest('#simClear')) renderSimulator(); });
  }
}
