/*
 * Contas fixas (área própria): cadastro, vencimentos do mês, lançamento automático no dia (vira
 * gasto sozinho), mudar o valor de um mês, desfazer, mudar o valor "a partir de", encerrar e excluir.
 */
import {Store} from '../data/store.js';
import {BILL_FREQS, billOccurrences, billsMonthSummary, billNext, billAmountFor} from '../domain/bills.js';
import {money, fmtMoney} from '../domain/money.js';
import {todayKey, toDateKey, monthBounds, monthLabelOf, shiftMonthKey, formatDateBr, formatDateFull, validDateStr} from '../domain/dates.js';
import {findById} from '../domain/util.js';
import {invoiceFor} from '../domain/cards.js';
import {qs, escapeHtml, optionsHtml, labelOf, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';

// ctx: {state(), k(), paymentOptions(), applyPayment(tx, pay), catOptions(), catLabel(id), renderAll(), addTx(tx), removeTx(id)}
var ctx = null;
var offset = 0;
function txOf(o){ return o.paid ? findById(ctx.state().transactions, o.paid.txId) : null; }

function bills(){ return ctx.state().bills; }
function paidOk(b, p){ return !!findById(ctx.state().transactions, p.txId); }
// skipped: lançamento desfeito pela pessoa (não volta a ser lançado sozinho).
export function billMonth(key){
  return billOccurrences(bills(), key, todayKey(), paidOk).map(function(o){
    o.skipped = !o.paid && !!((o.b.paid || {})[key] || {}).skipped;
    var t = txOf(o); if (t) o.amount = Number(t.amount);
    return o;
  });
}
// Conta cadastrada depois do dia: aquele mês não é lançado sozinho (pode já ter sido lançado à mão).
// Data de cadastro da conta fixa no fuso de quem usa (em UTC, uma conta criada às 22h “nascia” amanhã
// e o vencimento de hoje não entrava sozinho).
function createdKey(b){ return b.createdAt ? toDateKey(new Date(b.createdAt)) : ''; }
function beforeSignup(o){ return o.b.createdAt && o.date < createdKey(o.b); }
// Lança sozinho, no dia, cada vencimento que chegou (desde o cadastro da conta). Devolve quantos lançou.
export async function runAutoBills(){
  if (!ctx || !bills().length) return 0;
  var today = todayKey(), cur = monthBounds(0).key, made = 0;
  for (var i = 0; i < bills().length; i++){
    var b = bills()[i];
    var from = b.startMonth;
    if (b.createdAt){ var cm = createdKey(b).slice(0, 7); if (cm > from) from = cm; }
    for (var key = from; key <= cur; key = shiftMonthKey(key, 1)){
      var o = billMonth(key).filter(function(x){ return x.b.id === b.id; })[0];
      if (!o || o.paid || o.skipped || o.date > today || beforeSignup(o)) continue;
      await launch(b, key, o.amount, o.date, b.pay, true);
      made++;
    }
  }
  if (made) toast(made === 1 ? '1 conta fixa foi lançada sozinha em Ganhos e gastos.' : made + ' contas fixas foram lançadas sozinhas em Ganhos e gastos.');
  return made;
}
async function launch(b, key, amount, date, pay, auto){
  var tx = {type: 'expense', amount: amount, category: b.category, categoryLabel: ctx.catLabel(b.category), date: date,
    description: b.name + ' (' + monthLabelOf(key) + ')', billId: b.id, billKey: key, createdAt: Date.now()};
  if (auto) tx.autoBill = true;
  ctx.applyPayment(tx, pay);
  var saved = await ctx.addTx(tx);
  var patch = {paid: Object.assign({}, b.paid || {})};
  patch.paid[key] = {txId: saved.id, amount: amount, date: date, auto: !!auto};
  await Store.update(ctx.k(), 'bills', b.id, patch);
  Object.assign(b, patch);
  return saved;
}
// Para o Início: contas do mês atual (e atrasadas do mês anterior) ainda não pagas.
export function pendingBills(){
  var cur = monthBounds(0).key;
  return billMonth(shiftMonthKey(cur, -1)).concat(billMonth(cur)).filter(function(o){ return !o.paid && !o.skipped; });
}

function payLabel(pay){ var o = ctx.paymentOptions().filter(function(x){ return x.id === pay; })[0]; return o ? o.label : 'Dinheiro'; }

function occRowHtml(o){
  var c = cardOfPay(o.b.pay), today = todayKey();
  var when = c ? 'compra no cartão ' + formatDateBr(o.date) + ' · fatura de ' + invoiceFor(o.date, c).label : formatDateBr(o.date);
  var state, cls, actions;
  if (o.paid){
    state = (o.paid.auto ? 'Lançada sozinha' : 'Lançada') + ' em ' + formatDateBr(o.paid.date); cls = 'good';
    actions = '<button class="btn btn-ghost btn-sm" type="button" data-edit-tx="' + escapeHtml(o.paid.txId) + '">Mudar valor</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-bill-undo="' + escapeHtml(o.b.id) + '" data-key="' + o.key + '">Desfazer</button>';
  } else if (o.skipped){
    state = 'Não lançada (você desfez)'; cls = '';
    actions = '<button class="btn btn-ghost btn-sm" type="button" data-bill-pay="' + escapeHtml(o.b.id) + '" data-key="' + o.key + '">Lançar</button>';
  } else if (o.date <= today){
    state = 'Antes do cadastro: lance se ainda não lançou'; cls = 'warning';
    actions = '<button class="btn btn-ghost btn-sm" type="button" data-bill-pay="' + escapeHtml(o.b.id) + '" data-key="' + o.key + '">Lançar</button>';
  } else {
    state = 'Lança sozinha em ' + formatDateBr(o.date); cls = '';
    actions = '<button class="btn btn-ghost btn-sm" type="button" data-bill-pay="' + escapeHtml(o.b.id) + '" data-key="' + o.key + '">Lançar agora</button>';
  }
  return '<div class="list-row bill-row">' +
    '<div class="tx-main"><div class="tx-desc">' + escapeHtml(o.b.name) + '</div>' +
      '<div class="tx-meta">' + when + ' · ' + escapeHtml(payLabel(o.b.pay)) + '</div></div>' +
    '<span class="tabular bill-amount">' + fmtMoney(o.amount) + '</span>' +
    '<span class="status-pill ' + cls + '">' + state + '</span>' +
    '<span class="bill-actions">' + actions + '</span></div>';
}
function billListRowHtml(b, cur){
  var next = billNext(b, cur, shiftMonthKey), ended = !!b.endMonth;
  return '<div class="list-row bill-row">' +
    '<div class="tx-main"><div class="tx-desc">' + escapeHtml(b.name) + ' <span class="pill">' + escapeHtml(labelOf(BILL_FREQS, String(b.every || 1))) + '</span></div>' +
      '<div class="tx-meta">' + escapeHtml(ctx.catLabel(b.category)) + ' · ' + (cardOfPay(b.pay) ? 'compra no cartão dia ' : 'dia ') + b.dueDay + ' · ' + escapeHtml(payLabel(b.pay)) + ' · ' +
        (ended ? 'encerrada em ' + monthLabelOf(b.endMonth) : next ? 'próxima ' + formatDateFull(next.date) : 'sem próximas') + '</div></div>' +
    '<span class="tabular bill-amount">' + fmtMoney(billAmountFor(b, cur)) + '</span>' +
    '<span class="bill-actions"><button class="btn btn-ghost btn-sm" type="button" data-bill-edit="' + escapeHtml(b.id) + '">Editar</button>' +
      (ended ? '' : '<button class="btn btn-ghost btn-sm" type="button" data-bill-end="' + escapeHtml(b.id) + '">Encerrar</button>') +
      '<button class="btn btn-danger btn-sm" type="button" data-bill-del="' + escapeHtml(b.id) + '">Excluir</button></span></div>';
}

export function renderBills(){
  if (!ctx) return;
  var cur = monthBounds(0).key, key = shiftMonthKey(cur, offset);
  var occ = billMonth(key), sum = billsMonthSummary(occ);
  qs('#billMonthLabel').textContent = monthLabelOf(key);
  qs('#billPrev').disabled = offset <= -12;
  qs('#billNext').disabled = offset >= 12;
  var wasOpen = qs('#billAll') && qs('#billAll').open;
  qs('#billMonth').innerHTML = !bills().length ? '<p class="empty-state">Nenhuma conta fixa ainda. Cadastre acima (água, luz, internet, aluguel…).</p>' :
    (!occ.length ? '<p class="tx-meta">Nenhuma conta vence neste mês.</p>' :
      '<p class="card-sub">' + sum.count + ' conta(s) · total ' + fmtMoney(sum.total) + ' · já lançadas ' + fmtMoney(sum.paid) + ' · ainda vão entrar <strong>' + fmtMoney(sum.pending) + '</strong></p>' +
      occ.map(occRowHtml).join('')) +
    '<details class="budget-details" id="billAll"' + (wasOpen ? ' open' : '') + '><summary>Todas as contas fixas (' + bills().length + '): editar, mudar valor, encerrar</summary>' +
      bills().map(function(b){ return billListRowHtml(b, cur); }).join('') + '</details>';
}

export function fillBillForm(){
  qs('#billCat').innerHTML = optionsHtml(ctx.catOptions(), qs('#billCat').value || 'moradia');
  qs('#billPay').innerHTML = optionsHtml(ctx.paymentOptions().filter(function(o){ return o.id !== 'card:none'; }), qs('#billPay').value);
  qs('#billEvery').innerHTML = optionsHtml(BILL_FREQS, qs('#billEvery').value || '1');
  if (!qs('#billStart').value) qs('#billStart').value = monthBounds(0).key;
  syncBillDay();
}
// O dia acompanha a forma de pagamento: Pix/débito/dinheiro = dia do pagamento; cartão = dia da
// compra no cartão, com a fatura em que ela entra (pelo fechamento do cartão escolhido).
function cardOfPay(pay){ return pay && pay.indexOf('card:') === 0 ? findById(ctx.state().cards, pay.slice(5)) : null; }
function syncBillDay(){
  var c = cardOfPay(qs('#billPay').value), day = Number(qs('#billDay').value);
  qs('#billDayLabel').textContent = c ? 'Dia da compra no cartão' : 'Dia do pagamento';
  var hint = '';
  if (c){
    var closing = Number(c.closingDay), due = Number(c.dueDay);
    hint = 'O ' + c.name + ' fecha dia ' + closing + ' e vence dia ' + due + '. ';
    if (day >= 1 && day <= 31) hint += day >= closing ?
      'Compra no dia ' + day + ' (no fechamento ou depois): entra na fatura seguinte, que vence dia ' + due + ' do mês ' + (due > closing ? 'seguinte' : 'depois do seguinte') + '.' :
      'Compra no dia ' + day + ' (antes do fechamento): entra na fatura que fecha no dia ' + closing + ' do mesmo mês e vence dia ' + due + (due > closing ? ' desse mês.' : ' do mês seguinte.');
    else hint += 'Informe o dia em que a cobrança cai no cartão.';
  } else hint = 'Dia em que você paga (Pix, débito ou dinheiro) e o valor sai da conta.';
  qs('#billDayHint').textContent = hint;
}

async function addBill(e){
  e.preventDefault();
  var name = qs('#billName').value.trim(), amount = money(qs('#billAmount').value), day = Number(qs('#billDay').value), start = qs('#billStart').value;
  if (!name || !(amount > 0)){ toast('Informe o nome e o valor da conta.'); return; }
  if (!(day >= 1 && day <= 31) || day % 1){ toast('O dia do vencimento vai de 1 a 31.'); return; }
  if (!/^\d{4}-\d{2}$/.test(start)){ toast('Informe a partir de qual mês a conta vale.'); return; }
  var b = {name: name, category: qs('#billCat').value, amount: amount, every: Number(qs('#billEvery').value) || 1, dueDay: day, startMonth: start,
    pay: qs('#billPay').value, amounts: [], paid: {}, createdAt: Date.now()};
  var saved;
  try { saved = await Store.add(ctx.k(), 'bills', b); }
  catch(err){ toast(err.userMessage || 'Não foi possível salvar. Se acabou de atualizar o app, o banco precisa da migração de contas fixas.'); return; }
  bills().push(saved);
  e.target.reset(); fillBillForm(); ctx.renderAll();
  toast('Conta fixa “' + name + '” adicionada. Ela entra sozinha em Ganhos e gastos no dia.');
  if (await runAutoBills()) ctx.renderAll();
}

async function payBill(id, key){
  var b = findById(bills(), id), o = billMonth(key).filter(function(x){ return x.b.id === id; })[0];
  if (!o) return;
  var date = o.date;
  var a = await openModal({
    title: 'Lançar ' + b.name,
    body: '<p>Vencimento de ' + monthLabelOf(key) + ': ' + formatDateFull(o.date) + '.</p>' +
      '<div class="field"><label for="bpAmount">Valor</label><span class="money-input"><span>R$</span><input id="bpAmount" name="amount" type="text" data-money autocomplete="off" inputmode="decimal" value="' + o.amount + '"></span>' +
        '<span class="field-hint">Conta que muda todo mês (luz, água)? Ajuste aqui o valor desta vez.</span></div>' +
      '<label class="check" id="bpKeepField" hidden><input type="checkbox" name="keep"> Usar este valor nos próximos meses também</label>' +
      '<div class="field"><label for="bpDate">Data</label><input id="bpDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + date + '"></div>' +
      '<div class="field"><label for="bpPay">Forma de pagamento</label><select id="bpPay" name="pay">' + optionsHtml(ctx.paymentOptions().filter(function(x){ return x.id !== 'card:none'; }), b.pay) + '</select></div>' +
      '<p class="field-hint">Vira um gasto em “Ganhos e gastos” (' + escapeHtml(ctx.catLabel(b.category)) + ') e desconta da conta ou entra na fatura do cartão escolhido.</p>',
    submitLabel: 'Lançar',
    onOpen: function(modal){
      qs('#bpAmount', modal).addEventListener('input', function(e){ qs('#bpKeepField', modal).hidden = money(e.target.value) === o.amount; });
    },
    onSubmit: function(form){
      var v = money(form.amount.value);
      if (!(v > 0)) return {error: 'Informe um valor maior que zero.'};
      if (!validDateStr(form.date.value)) return {error: 'Use uma data entre 1900 e 3000.'};
      return {amount: v, date: form.date.value, pay: form.pay.value, keep: form.keep.checked && v !== o.amount};
    }
  });
  if (!a) return;
  await launch(b, key, a.amount, a.date, a.pay, false);
  if (a.keep){
    var am = (b.amounts || []).filter(function(x){ return x.from !== key; }).concat([{from: key, amount: a.amount}]);
    await Store.update(ctx.k(), 'bills', b.id, {amounts: am});
    b.amounts = am;
  }
  ctx.renderAll();
  toast(b.name + ' lançada: ' + fmtMoney(a.amount) + '.' + (a.keep ? ' O novo valor vale para os próximos meses.' : ''));
}

async function undoBill(id, key){
  var b = findById(bills(), id), p = (b.paid || {})[key];
  if (!p) return;
  if (!(await confirmAction({title: 'Desfazer lançamento?', danger: false, confirmLabel: 'Desfazer',
    message: 'O gasto de ' + b.name + ' em ' + monthLabelOf(key) + ' sai de “Ganhos e gastos” e não será lançado de novo sozinho. Dá para lançar depois, se precisar.'}))) return;
  if (findById(ctx.state().transactions, p.txId)) await ctx.removeTx(p.txId);
  var paid = Object.assign({}, b.paid); paid[key] = {skipped: true, date: todayKey()};
  await Store.update(ctx.k(), 'bills', b.id, {paid: paid});
  b.paid = paid;
  ctx.renderAll();
  toast('Lançamento desfeito.');
}

async function editBill(id){
  var b = findById(bills(), id), cur = monthBounds(0).key;
  await openModal({
    title: 'Editar conta fixa',
    body: '<div class="field"><label for="beName">Nome</label><input id="beName" name="name" type="text" maxlength="60" value="' + escapeHtml(b.name) + '"></div>' +
      '<div class="field"><label for="beCat">Categoria</label><select id="beCat" name="cat">' + optionsHtml(ctx.catOptions(), b.category) + '</select></div>' +
      '<div class="field"><label for="beEvery">Frequência</label><select id="beEvery" name="every">' + optionsHtml(BILL_FREQS, String(b.every || 1)) + '</select></div>' +
      '<div class="field"><label for="beDay">Dia do pagamento (ou da compra no cartão)</label><input id="beDay" name="day" type="number" min="1" max="31" value="' + b.dueDay + '"></div>' +
      '<div class="field"><label for="bePay">Forma de pagamento</label><select id="bePay" name="pay">' + optionsHtml(ctx.paymentOptions().filter(function(x){ return x.id !== 'card:none'; }), b.pay) + '</select></div>' +
      '<fieldset class="brand-fieldset"><legend>Mudar o valor</legend>' +
        '<div class="field"><label for="beAmount">Novo valor</label><span class="money-input"><span>R$</span><input id="beAmount" name="amount" type="text" data-money autocomplete="off" inputmode="decimal" value="' + billAmountFor(b, cur) + '"></span></div>' +
        '<div class="field"><label for="beFrom">A partir de</label><input id="beFrom" name="from" type="month" value="' + cur + '"></div>' +
        '<p class="field-hint">Os meses anteriores continuam com o valor antigo.</p></fieldset>',
    submitLabel: 'Salvar',
    onSubmit: async function(form){
      var name = form.name.value.trim(), day = Number(form.day.value), amount = money(form.amount.value), from = form.from.value;
      if (!name) return {error: 'Dê um nome para a conta.'};
      if (!(day >= 1 && day <= 31) || day % 1) return {error: 'O dia do vencimento vai de 1 a 31.'};
      if (!(amount > 0) || !/^\d{4}-\d{2}$/.test(from)) return {error: 'Informe o valor e o mês a partir do qual ele vale.'};
      var patch = {name: name, category: form.cat.value, every: Number(form.every.value) || 1, dueDay: day, pay: form.pay.value};
      if (amount !== billAmountFor(b, from)) patch.amounts = (b.amounts || []).filter(function(x){ return x.from !== from; }).concat([{from: from, amount: amount}]);
      await Store.update(ctx.k(), 'bills', b.id, patch);
      Object.assign(b, patch);
      ctx.renderAll();
      toast('Conta fixa atualizada.');
      return true;
    }
  });
}

async function endBill(id){
  var b = findById(bills(), id), cur = monthBounds(0).key;
  if (!(await confirmAction({title: 'Encerrar ' + b.name + '?', danger: false, confirmLabel: 'Encerrar',
    message: 'A conta deixa de aparecer a partir do próximo mês (cancelou o serviço, mudou de casa…). Os pagamentos feitos continuam no histórico.'}))) return;
  await Store.update(ctx.k(), 'bills', b.id, {endMonth: cur});
  b.endMonth = cur;
  ctx.renderAll();
  toast(b.name + ' encerrada.');
}

async function deleteBill(id){
  var b = findById(bills(), id);
  if (!(await confirmAction({title: 'Excluir ' + b.name + '?', confirmLabel: 'Excluir',
    message: 'A conta fixa some de Compromissos. Os gastos já lançados pelos pagamentos continuam em “Ganhos e gastos”. Se só parou de pagar, prefira “Encerrar”.'}))) return;
  await Store.remove(ctx.k(), 'bills', b.id);
  ctx.state().bills = bills().filter(function(x){ return x.id !== b.id; });
  ctx.renderAll();
  toast(b.name + ' excluída.');
}

export function initBills(context){
  ctx = context;
  qs('#billForm').addEventListener('submit', addBill);
  ['change', 'input'].forEach(function(ev){ qs('#billPay').addEventListener(ev, syncBillDay); qs('#billDay').addEventListener(ev, syncBillDay); });
  qs('#billPrev').addEventListener('click', function(){ offset--; renderBills(); });
  qs('#billNext').addEventListener('click', function(){ offset++; renderBills(); });
  qs('#tab-fixas').addEventListener('click', function(e){
    var el;
    if ((el = e.target.closest('[data-bill-pay]'))) payBill(el.getAttribute('data-bill-pay'), el.getAttribute('data-key'));
    else if ((el = e.target.closest('[data-bill-undo]'))) undoBill(el.getAttribute('data-bill-undo'), el.getAttribute('data-key'));
    else if ((el = e.target.closest('[data-bill-edit]'))) editBill(el.getAttribute('data-bill-edit'));
    else if ((el = e.target.closest('[data-bill-end]'))) endBill(el.getAttribute('data-bill-end'));
    else if ((el = e.target.closest('[data-bill-del]'))) deleteBill(el.getAttribute('data-bill-del'));
  });
}
export function resetBillsView(){ offset = 0; }
