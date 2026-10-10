/*
 * Compromissos → Contas fixas: cadastro, vencimentos do mês, pagar (vira gasto), desfazer,
 * mudar o valor "a partir de", encerrar e excluir. Separado do app.js como o perfil e o painel adm.
 */
import {Store} from '../data/store.js';
import {BILL_FREQS, billOccurrences, billsMonthSummary, billNext, billAmountFor} from '../domain/bills.js';
import {money, fmtMoney} from '../domain/money.js';
import {todayKey, monthBounds, monthLabelOf, shiftMonthKey, formatDateBr, formatDateFull, validDateStr} from '../domain/dates.js';
import {findById} from '../domain/util.js';
import {qs, escapeHtml, optionsHtml, labelOf, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';

// ctx: {state(), k(), paymentOptions(), applyPayment(tx, pay), catOptions(), catLabel(id), renderAll(), addTx(tx), removeTx(id)}
var ctx = null;
var offset = 0;
var SUGGESTIONS = ['Água', 'Luz', 'Internet', 'Telefone', 'Celular', 'Gás', 'Aluguel', 'Condomínio', 'Streaming', 'Academia', 'Plano de saúde', 'Escola', 'Seguro'];
var STATUS = {paga: ['good', 'Paga'], atrasada: ['critical', 'Atrasada'], logo: ['warning', 'Vence logo'], aberta: ['', 'Em aberto']};

function bills(){ return ctx.state().bills; }
function paidOk(b, p){ return !!findById(ctx.state().transactions, p.txId); }
export function billMonth(key){ return billOccurrences(bills(), key, todayKey(), paidOk); }
// Para o Início: contas do mês atual (e atrasadas do mês anterior) ainda não pagas.
export function pendingBills(){
  var cur = monthBounds(0).key;
  return billMonth(shiftMonthKey(cur, -1)).concat(billMonth(cur)).filter(function(o){ return !o.paid; });
}

function payLabel(pay){ var o = ctx.paymentOptions().filter(function(x){ return x.id === pay; })[0]; return o ? o.label : 'Dinheiro'; }

function occRowHtml(o){
  var st = STATUS[o.status];
  return '<div class="list-row bill-row">' +
    '<div class="tx-main"><div class="tx-desc">' + escapeHtml(o.b.name) + '</div>' +
      '<div class="tx-meta">Vence ' + formatDateBr(o.date) + ' · ' + escapeHtml(o.paid ? 'paga em ' + formatDateBr(o.paid.date) : payLabel(o.b.pay)) + '</div></div>' +
    '<span class="tabular bill-amount">' + fmtMoney(o.amount) + '</span>' +
    '<span class="status-pill ' + st[0] + '">' + st[1] + '</span>' +
    (o.paid ? '<button class="btn btn-ghost btn-sm" type="button" data-bill-undo="' + escapeHtml(o.b.id) + '" data-key="' + o.key + '">Desfazer</button>' :
      '<button class="btn btn-primary btn-sm" type="button" data-bill-pay="' + escapeHtml(o.b.id) + '" data-key="' + o.key + '">Pagar</button>') +
    '</div>';
}

export function renderBills(){
  if (!ctx) return;
  var cur = monthBounds(0).key, key = shiftMonthKey(cur, offset);
  var occ = billMonth(key), sum = billsMonthSummary(occ);
  qs('#billMonthLabel').textContent = monthLabelOf(key);
  qs('#billPrev').disabled = offset <= -12;
  qs('#billNext').disabled = offset >= 12;
  qs('#billMonth').innerHTML = !bills().length ? '<p class="empty-state">Nenhuma conta fixa ainda. Cadastre acima (água, luz, internet, aluguel…).</p>' :
    !occ.length ? '<p class="tx-meta">Nenhuma conta vence neste mês.</p>' :
    '<p class="card-sub">' + sum.count + ' conta(s) · total ' + fmtMoney(sum.total) + ' · pagas ' + fmtMoney(sum.paid) + ' · faltam <strong>' + fmtMoney(sum.pending) + '</strong>' +
      (sum.late ? ' · <span class="neg-text">' + sum.late + ' atrasada(s)</span>' : '') + '</p>' + occ.map(occRowHtml).join('');
  qs('#billGrid').innerHTML = bills().map(function(b){
    var next = billNext(b, cur, shiftMonthKey), ended = !!b.endMonth;
    return '<div class="debt-card">' +
      '<div class="budget-top"><h4>' + escapeHtml(b.name) + '</h4><span class="pill">' + escapeHtml(labelOf(BILL_FREQS, String(b.every || 1))) + '</span></div>' +
      '<div class="debt-figs"><span class="tabular">' + fmtMoney(billAmountFor(b, cur)) + '</span><span>' + escapeHtml(ctx.catLabel(b.category)) + '</span></div>' +
      '<span class="tx-meta">Vence dia ' + b.dueDay + ' · ' + escapeHtml(payLabel(b.pay)) + '</span>' +
      '<span class="tx-meta">' + (ended ? 'Encerrada em ' + monthLabelOf(b.endMonth) + ' (último vencimento)' : next ? 'Próximo: ' + formatDateFull(next.date) + ' · ' + fmtMoney(next.amount) : 'Sem próximos vencimentos') + '</span>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" type="button" data-bill-edit="' + escapeHtml(b.id) + '">Editar ou mudar valor</button>' +
        (ended ? '' : '<button class="btn btn-ghost btn-sm" type="button" data-bill-end="' + escapeHtml(b.id) + '">Encerrar</button>') +
        '<button class="btn btn-danger btn-sm" type="button" data-bill-del="' + escapeHtml(b.id) + '">Excluir</button></div></div>';
  }).join('');
}

export function fillBillForm(){
  qs('#billCat').innerHTML = optionsHtml(ctx.catOptions(), qs('#billCat').value || 'moradia');
  qs('#billPay').innerHTML = optionsHtml(ctx.paymentOptions().filter(function(o){ return o.id !== 'card:none'; }), qs('#billPay').value);
  qs('#billEvery').innerHTML = optionsHtml(BILL_FREQS, qs('#billEvery').value || '1');
  if (!qs('#billStart').value) qs('#billStart').value = monthBounds(0).key;
  qs('#billNames').innerHTML = SUGGESTIONS.map(function(n){ return '<option value="' + n + '">'; }).join('');
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
  toast('Conta fixa “' + name + '” adicionada.');
}

async function payBill(id, key){
  var b = findById(bills(), id), o = billMonth(key).filter(function(x){ return x.b.id === id; })[0];
  if (!o) return;
  var today = todayKey(), date = o.date < today ? today : (key === monthBounds(0).key ? today : o.date);
  var a = await openModal({
    title: 'Pagar ' + b.name,
    body: '<p>Vencimento de ' + monthLabelOf(key) + ': ' + formatDateFull(o.date) + '.</p>' +
      '<div class="field"><label for="bpAmount">Valor pago</label><span class="money-input"><span>R$</span><input id="bpAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + o.amount + '"></span>' +
        '<span class="field-hint">Conta que muda todo mês (luz, água)? Ajuste aqui o valor desta vez.</span></div>' +
      '<label class="check" id="bpKeepField" hidden><input type="checkbox" name="keep"> Usar este valor nos próximos meses também</label>' +
      '<div class="field"><label for="bpDate">Data do pagamento</label><input id="bpDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + date + '"></div>' +
      '<div class="field"><label for="bpPay">Forma de pagamento</label><select id="bpPay" name="pay">' + optionsHtml(ctx.paymentOptions().filter(function(x){ return x.id !== 'card:none'; }), b.pay) + '</select></div>' +
      '<p class="field-hint">O pagamento vira um gasto em “Ganhos e gastos” (' + escapeHtml(ctx.catLabel(b.category)) + ') e desconta da conta ou entra na fatura do cartão escolhido.</p>',
    submitLabel: 'Registrar pagamento',
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
  var tx = {type: 'expense', amount: a.amount, category: b.category, categoryLabel: ctx.catLabel(b.category), date: a.date,
    description: b.name + ' (' + monthLabelOf(key) + ')', billId: b.id, billKey: key, createdAt: Date.now()};
  ctx.applyPayment(tx, a.pay);
  var saved = await ctx.addTx(tx);
  var patch = {paid: Object.assign({}, b.paid || {})};
  patch.paid[key] = {txId: saved.id, amount: a.amount, date: a.date};
  if (a.keep) patch.amounts = (b.amounts || []).filter(function(x){ return x.from !== key; }).concat([{from: key, amount: a.amount}]);
  await Store.update(ctx.k(), 'bills', b.id, patch);
  Object.assign(b, patch);
  ctx.renderAll();
  toast(b.name + ' paga: ' + fmtMoney(a.amount) + '.' + (a.keep ? ' O novo valor vale para os próximos meses.' : ''));
}

async function undoBill(id, key){
  var b = findById(bills(), id), p = (b.paid || {})[key];
  if (!p) return;
  if (!(await confirmAction({title: 'Desfazer pagamento?', danger: false, confirmLabel: 'Desfazer',
    message: 'O pagamento de ' + fmtMoney(p.amount) + ' (' + b.name + ', ' + monthLabelOf(key) + ') sai de “Ganhos e gastos” e a conta volta a ficar em aberto.'}))) return;
  if (findById(ctx.state().transactions, p.txId)) await ctx.removeTx(p.txId);
  var paid = Object.assign({}, b.paid); delete paid[key];
  await Store.update(ctx.k(), 'bills', b.id, {paid: paid});
  b.paid = paid;
  ctx.renderAll();
  toast('Pagamento desfeito.');
}

async function editBill(id){
  var b = findById(bills(), id), cur = monthBounds(0).key;
  await openModal({
    title: 'Editar conta fixa',
    body: '<div class="field"><label for="beName">Nome</label><input id="beName" name="name" type="text" maxlength="60" value="' + escapeHtml(b.name) + '"></div>' +
      '<div class="field"><label for="beCat">Categoria</label><select id="beCat" name="cat">' + optionsHtml(ctx.catOptions(), b.category) + '</select></div>' +
      '<div class="field"><label for="beEvery">Frequência</label><select id="beEvery" name="every">' + optionsHtml(BILL_FREQS, String(b.every || 1)) + '</select></div>' +
      '<div class="field"><label for="beDay">Dia do vencimento</label><input id="beDay" name="day" type="number" min="1" max="31" value="' + b.dueDay + '"></div>' +
      '<div class="field"><label for="bePay">Forma de pagamento</label><select id="bePay" name="pay">' + optionsHtml(ctx.paymentOptions().filter(function(x){ return x.id !== 'card:none'; }), b.pay) + '</select></div>' +
      '<fieldset class="brand-fieldset"><legend>Mudar o valor</legend>' +
        '<div class="field"><label for="beAmount">Novo valor</label><span class="money-input"><span>R$</span><input id="beAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + billAmountFor(b, cur) + '"></span></div>' +
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
