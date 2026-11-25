/*
 * Contas bancárias, transferências e vale-alimentação.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, monthKeyOf, formatDateBr, formatDateFull, validDateStr, monthBounds, monthLabelOf, shiftMonthKey} from '../domain/dates.js';
import {creditDay, nextCredit} from '../domain/vouchers.js';
import {money, fmtMoney, splitAmount} from '../domain/money.js';
import {findById, sum, uid} from '../domain/util.js';
import * as Cards from '../domain/cards.js';
import {invoiceLabel} from '../domain/cards.js';

import {badgeHtml, pickerHtml, readPicker, wirePicker} from './brand-picker.js';
import {lookOf} from '../domain/brands.js';
import {Store} from '../data/store.js';
import {escapeHtml, icon, optionsHtml, qs, qsa, toast} from './dom.js';
import {confirmAction, openModal} from './modal.js';
import {cardHtml, readCardFields, renderCards, renderWalletSummary} from './cards-tab.js';
import {moreMenu} from './commitments-tab.js';
import {renderStatTiles, txRowHtml} from './home-tab.js';
import {renderAll} from './shell.js';
import {State, accountBalance, accountMoves, accountName, k, voucherBalance, voucherTx} from './state.js';
import {fold, populatePaymentSelect} from './tx-list.js';

/* ---------- Contas bancárias ---------- */

export function moveRowHtml(m){
  var pos = m.amount >= 0;
  return '<div class="tx-row">' +
    '<span class="tx-cat-dot" style="background:' + (pos ? 'var(--good)' : 'var(--text-muted)') + '"></span>' +
    '<div class="tx-main"><div class="tx-desc">' + escapeHtml(m.label) + '</div><div class="tx-meta">' + m.kind + ' · ' + formatDateBr(m.date) + '</div></div>' +
    '<span class="tx-amount tabular ' + (pos ? 'income' : 'expense') + '">' + (pos ? '+ ' : '- ') + fmtMoney(Math.abs(m.amount)) + '</span>' +
    (m.adjustId ? '<button class="tx-del" type="button" data-adjust-undo="' + escapeHtml(m.accId + ':' + m.adjustId) + '" aria-label="Desfazer ajuste de saldo" title="Desfazer ajuste">' + icon('trash') + '</button>' : '') +
    (m.transferId ? '<button class="tx-del" type="button" data-transfer-del="' + escapeHtml(m.transferId) + '" aria-label="Excluir transferência" title="Excluir transferência">' + icon('trash') + '</button>' : '') +
    '</div>';
}

// Contas e cartões ficam juntos, um bloco por banco (renderCards também chama esta função).
export function renderAccounts(){ renderBanks(); }

// Um bloco por banco: a conta (saldo) e o(s) cartão(ões) do mesmo banco. O vínculo vem de
// card.accountId; registros antigos sem vínculo são juntados pelo banco reconhecido ou pelo nome.
export function bankGroups(){
  var out = [], used = {};
  function key(x){ var b = lookOf(x).bank; return b ? 'b:' + b.id : 'n:' + fold(String(x.name || '').trim()); }
  State.accounts.forEach(function(a){
    var cards = State.cards.filter(function(c){ return c.accountId === a.id; });
    cards.forEach(function(c){ used[c.id] = true; });
    out.push({acc: a, cards: cards});
  });
  out.forEach(function(g){
    if (g.cards.length) return;
    g.cards = State.cards.filter(function(c){ return !used[c.id] && !findById(State.accounts, c.accountId) && key(c) === key(g.acc); });
    g.cards.forEach(function(c){ used[c.id] = true; });
  });
  State.cards.forEach(function(c){ if (!used[c.id]) out.push({acc: null, cards: [c]}); });
  return out;
}
// Seção da conta dentro do bloco do banco: saldo, entradas e saídas do mês numa linha; ações no cabeçalho
// da seção; movimentações recolhidas.
export function accountHtml(a){
  var cur = monthBounds(0).key, bal = accountBalance(a), moves = accountMoves(a).map(function(m){ return Object.assign({accId: a.id}, m); });
  var month = moves.filter(function(m){ return monthKeyOf(m.date) === cur && m.kind !== 'Ajuste de saldo'; });
  var inM = sum(month.filter(function(m){ return m.amount > 0; }), function(m){ return m.amount; });
  var outM = -sum(month.filter(function(m){ return m.amount < 0; }), function(m){ return m.amount; });
  return '<div class="bank-sec account-card" aria-label="Conta ' + escapeHtml(a.name) + '">' +
    '<div class="sec-head"><span class="sec-title">' + icon('bank') + 'Conta</span>' +
      '<span class="sec-actions">' + (State.accounts.length > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-acc-transfer="' + a.id + '">' + icon('swap') + 'Transferir</button>' : '') +
        moreMenu(['<button type="button" data-acc-edit="' + a.id + '">' + icon('edit') + 'Editar conta</button>',
          '<button type="button" class="danger" data-acc-del="' + a.id + '">' + icon('trash') + 'Excluir conta</button>']) + '</span></div>' +
    '<div class="sec-kpis acc-kpis">' +
      '<div class="kpi"><span class="kpi-lbl">Saldo hoje</span><strong class="tabular kpi-val account-balance ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
      '<div class="kpi"><span class="kpi-lbl">Entrou no mês</span><strong class="tabular pos-text">' + fmtMoney(inM) + '</strong></div>' +
      '<div class="kpi"><span class="kpi-lbl">Saiu no mês</span><strong class="tabular">' + fmtMoney(outM) + '</strong></div>' +
    '</div>' +
    (moves.length ? '<details class="budget-details"><summary>Ver movimentações (' + moves.length + ')</summary>' + moves.slice(0, 40).map(moveRowHtml).join('') + '</details>' : '') +
    '</div>';
}
export function renderBanks(){
  document.getElementById('transferBtn').hidden = State.accounts.length < 2;
  var wrap = document.getElementById('bankList');
  var groups = bankGroups();
  if (!groups.length){ wrap.innerHTML = '<p class="empty-state">Nenhum banco cadastrado. Adicione acima a conta e, se tiver, o cartão de crédito.</p>'; return; }
  // Um bloco por banco: nome e ícone uma vez no cabeçalho; a cor da marca é só uma faixa fina na lateral;
  // conta e cartão em seções compactas separadas por uma linha.
  wrap.innerHTML = groups.map(function(g){
    var first = g.acc || g.cards[0], look = lookOf(first);
    return '<section class="bank-block" aria-label="' + escapeHtml(first.name) + '"' + (look.color ? ' style="--bank-color:' + look.color + '"' : '') + '>' +
      '<header class="bank-head">' + badgeHtml(first) + '<h4><span class="acc-name">' + escapeHtml(first.name) + '</span></h4>' +
        '<span class="tx-meta">' + (g.acc && g.cards.length ? 'Conta e cartão' : g.acc ? 'Conta' : 'Só cartão') + '</span>' +
        (g.acc && !g.cards.length ? '<button class="btn btn-ghost btn-sm" type="button" data-bank-addcard="' + g.acc.id + '">' + icon('plus') + 'Adicionar cartão de crédito</button>' : '') +
        (!g.acc ? '<button class="btn btn-ghost btn-sm" type="button" data-bank-addacc="' + g.cards[0].id + '">' + icon('plus') + 'Adicionar a conta</button>' : '') +
      '</header>' +
      (g.acc ? accountHtml(g.acc) : '') +
      g.cards.map(cardHtml).join('') +
      '</section>';
  }).join('');
}
// Cartão novo num banco que já tem conta: mesmo nome, mesmo visual e ligado à conta.
export async function addCardToBank(accId){
  var a = findById(State.accounts, accId);
  await openModal({
    title: 'Cartão de crédito · ' + a.name,
    body: '<div class="field"><label for="bcLimit">Limite</label><span class="money-input"><span>R$</span><input id="bcLimit" name="limit" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field"><label for="bcClosing">Dia do fechamento da fatura</label><input id="bcClosing" name="closing" type="number" min="1" max="31"></div>' +
      '<div class="field"><label for="bcDue">Dia do vencimento da fatura</label><input id="bcDue" name="due" type="number" min="1" max="31"></div>' +
      '<p class="field-hint">A compra entra na fatura que ainda não fechou; no dia do fechamento já vai para a próxima.</p>',
    submitLabel: 'Adicionar cartão',
    onSubmit: async function(form){
      var v = readCardFields(a.name, form.limit.value, form.closing.value, form.due.value);
      if (v.error) return v;
      Object.assign(v, {accountId: a.id, bank: a.bank || null, color: a.color || null, mark: a.mark || null, paidInvoices: [], createdAt: Date.now()});
      State.cards.push(await Store.add(k(), 'cards', v));
      renderAll();
      toast('Cartão do ' + a.name + ' adicionado.');
      return true;
    }
  });
}
// Conta nova para um cartão que estava sozinho: liga os dois.
export async function addAccountToBank(cardId){
  var c = findById(State.cards, cardId);
  await openModal({
    title: 'Conta · ' + c.name,
    body: '<div class="field"><label for="baBalance">Saldo atual da conta</label><span class="money-input"><span>R$</span><input id="baBalance" name="balance" type="text" data-money autocomplete="off" inputmode="decimal" placeholder="0,00"></span></div>',
    submitLabel: 'Adicionar conta',
    onSubmit: async function(form){
      var a = {name: c.name, initialBalance: form.balance.value === '' ? 0 : money(form.balance.value), baseDate: todayKey(), baseAt: Date.now(), createdAt: Date.now(),
        bank: c.bank || null, color: c.color || null, mark: c.mark || null};
      var saved = await Store.add(k(), 'accounts', a);
      State.accounts.push(saved);
      await Store.update(k(), 'cards', c.id, {accountId: saved.id});
      c.accountId = saved.id;
      renderAll();
      toast('Conta do ' + c.name + ' adicionada com saldo de ' + fmtMoney(a.initialBalance) + '.');
      return true;
    }
  });
}

export async function editAccount(id){
  var a = findById(State.accounts, id);
  var current = accountBalance(a);
  await openModal({
    title: 'Editar conta',
    body: '<div class="field"><label for="eaName">Nome da conta</label><input id="eaName" name="name" type="text" maxlength="40" value="' + escapeHtml(a.name) + '"></div>' +
      '<div class="field"><label for="eaBalance">Saldo hoje</label><span class="money-input"><span>R$</span><input id="eaBalance" name="balance" type="text" data-money autocomplete="off" inputmode="decimal" value="' + current + '"></span>' +
      '<span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do banco. A diferença vira um <strong>ajuste de saldo</strong> no histórico: não conta como ganho nem como gasto e não apaga nada.</span>' +
      '<p class="field-hint adj-preview" id="eaAdjust" aria-live="polite"></p></div>' +
      '<fieldset class="brand-fieldset"><legend><span id="eaPreview"></span>Cor e ícone</legend>' + pickerHtml('eaP', a) + '</fieldset>',
    onOpen: function(modal){
      wirePicker(modal, 'eaP', qs('#eaName', modal), qs('#eaPreview', modal));
      var inp = qs('#eaBalance', modal), out = qs('#eaAdjust', modal);
      function showAdj(){
        var diff = inp.value === '' ? 0 : money(money(inp.value) - current);
        out.textContent = diff ? 'Saldo no app: ' + fmtMoney(current) + ' → novo saldo ' + fmtMoney(money(inp.value)) + '. Ajuste de ' + (diff > 0 ? '+ ' : '− ') + fmtMoney(Math.abs(diff)) + '.' : '';
      }
      inp.addEventListener('input', showAdj); showAdj();
    },
    onSubmit: async function(form){
      var name = form.name.value.trim();
      if (!name) return {error:'Dê um nome para a conta.'};
      var patch = Object.assign({name: name}, readPicker(form, 'eaP'));
      var bal = money(form.balance.value);
      // A diferença vira um ajuste de saldo (não conta como ganho nem gasto e o histórico fica).
      if (form.balance.value !== '' && bal !== current){
        patch.adjustments = (a.adjustments || []).concat([{id: uid(), date: todayKey(), createdAt: Date.now(), amount: money(bal - current), note: 'Ajuste de saldo'}]);
      }
      await Store.update(k(), 'accounts', id, patch);
      Object.assign(a, patch);
      renderAll();
      toast(patch.adjustments ? 'Conta atualizada. Ajuste de saldo de ' + fmtMoney(patch.adjustments[patch.adjustments.length - 1].amount) + ' registrado.' : 'Conta atualizada.');
    }
  });
}
// Desfaz um ajuste de saldo (ref = "idDaConta:idDoAjuste").
export async function undoBalanceAdjust(ref){
  var parts = ref.split(':'), a = findById(State.accounts, parts[0]);
  if (!a) return;
  var item = (a.adjustments || []).filter(function(x){ return x.id === parts[1]; })[0];
  if (!item) return;
  if (!(await confirmAction({title: 'Desfazer este ajuste de saldo?', danger: false, confirmLabel: 'Desfazer', message: 'O ajuste de ' + fmtMoney(item.amount) + ' sai e o saldo da conta ' + a.name + ' volta ao valor de antes.'}))) return;
  var list = (a.adjustments || []).filter(function(x){ return x.id !== item.id; });
  await Store.update(k(), 'accounts', a.id, {adjustments: list});
  a.adjustments = list;
  renderAll();
  toast('Ajuste desfeito.');
}

export async function openTransfer(fromId){
  var opts = State.accounts.map(function(a){ return {id: a.id, label: a.name + ' (' + fmtMoney(accountBalance(a)) + ')'}; });
  var from = fromId || State.accounts[0].id;
  var to = State.accounts.filter(function(a){ return a.id !== from; })[0].id;
  var r = await openModal({
    title: 'Transferir entre contas',
    body: '<div class="field"><label for="trFrom">De</label><select id="trFrom" name="from">' + optionsHtml(opts, from) + '</select></div>' +
      '<div class="field"><label for="trTo">Para</label><select id="trTo" name="to">' + optionsHtml(opts, to) + '</select></div>' +
      '<div class="field"><label for="trAmount">Valor</label><span class="money-input"><span>R$</span><input id="trAmount" name="amount" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field"><label for="trDate">Data</label><input id="trDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + todayKey() + '"></div>' +
      '<div class="field"><label for="trDesc">Descrição (opcional)</label><input id="trDesc" name="desc" type="text" maxlength="60" placeholder="Ex: guardar na poupança"></div>' +
      '<p class="field-hint">Transferências mudam o saldo das duas contas, mas não contam como ganho nem como gasto.</p>',
    submitLabel: 'Transferir',
    onSubmit: async function(form){
      var amount = money(form.amount.value);
      if (!(amount > 0)) return {error:'Informe um valor maior que zero.'};
      if (form.from.value === form.to.value) return {error:'Escolha contas diferentes em “De” e “Para”.'};
      var date = form.date.value || todayKey();
      if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
      var saved = await Store.add(k(), 'transfers', {fromId: form.from.value, toId: form.to.value, amount: amount, date: date, description: form.desc.value.trim(), createdAt: Date.now()});
      State.transfers.push(saved);
      return saved;
    }
  });
  if (r && r.id){
    renderAccounts(); renderStatTiles();
    toast('Transferência de ' + fmtMoney(r.amount) + ' de ' + accountName(r.fromId) + ' para ' + accountName(r.toId) + ' registrada.');
  }
}

// Marcar fatura como paga: com contas cadastradas, pergunta de qual conta saiu o dinheiro.
// O pagamento da fatura só desconta da conta; as compras já contaram como gasto quando foram feitas.
// Conta que paga a fatura: a escolhida no cartão; senão, a do mesmo banco; senão, a primeira.
export function payAccountFor(card){
  if (card.payAccountId && findById(State.accounts, card.payAccountId)) return card.payAccountId;
  if (card.accountId && findById(State.accounts, card.accountId)) return card.accountId;
  var bank = lookOf(card).bank;
  var same = bank && State.accounts.filter(function(a){ var b = lookOf(a).bank; return b && b.id === bank.id; })[0];
  return same ? same.id : (State.accounts[0] ? State.accounts[0].id : '');
}
// Pagar a fatura: o total ou só uma parte. Pagando uma parte, o resto fica em aberto (vai para a fatura
// seguinte, o rotativo) ou é parcelado nas faturas seguintes, como os bancos oferecem. Juros (parcelas
// maiores que o resto dividido, ou encargos informados) viram gasto no cartão; o saldo em si, não,
// porque as compras já contaram (regras em Cards.partialPayment).
var PAY_MODES = [
  {id: 'total', title: 'Paguei a fatura toda', hint: 'O que falta pagar sai da conta e a fatura fica paga.'},
  {id: 'adiantado', title: 'Adiantei uma parte', hint: 'A fatura continua em aberto: o resto você paga depois, nesta mesma fatura.'},
  {id: 'aberto', title: 'Paguei uma parte, o resto fica em aberto', hint: 'O que faltou vai para a próxima fatura (rotativo).'},
  {id: 'parcelado', title: 'Paguei uma parte e parcelei o resto', hint: 'O que faltou é dividido nas próximas faturas, com as parcelas que o banco ofereceu.'}
];
// Pagamento adiantado: a fatura continua aberta e o valor sai da conta escolhida.
async function addInvoiceAdvance(card, key, choice){
  var adv = Object.assign({}, card.invoiceAdvances || {});
  adv[key] = Cards.invoiceAdvances(card, key).concat([{id: uid(), date: choice.date, amount: choice.paidNow, accountId: choice.accountId || null, createdAt: Date.now()}]);
  await Store.update(k(), 'cards', card.id, {invoiceAdvances: adv});
  card.invoiceAdvances = adv;
  renderAll();
  toast(choice.rest > 0 ? 'Pagamento de ' + fmtMoney(choice.paidNow) + ' registrado. Falta ' + fmtMoney(choice.rest) + ' da fatura de ' + invoiceLabel(key, card) + '.' :
    'Pagamento de ' + fmtMoney(choice.paidNow) + ' registrado. A fatura de ' + invoiceLabel(key, card) + ' ainda recebe compras: o que passar daqui para a frente entra como novo valor a pagar.');
}
// Desfaz um pagamento adiantado (ref = "idDoCartão:AAAA-MM:idDoPagamento").
export async function undoInvoiceAdvance(ref){
  var parts = ref.split(':'), card = findById(State.cards, parts[0]), key = parts[1];
  var item = card && Cards.invoiceAdvances(card, key).filter(function(x){ return x.id === parts[2]; })[0];
  if (!item) return;
  if (!(await confirmAction({title: 'Desfazer este pagamento?', danger: false, confirmLabel: 'Desfazer',
    message: fmtMoney(item.amount) + ' de ' + formatDateBr(item.date) + ' volta a faltar na fatura de ' + invoiceLabel(key, card) + (item.accountId ? ' e volta para o saldo de ' + accountName(item.accountId) : '') + '.'}))) return;
  var adv = Object.assign({}, card.invoiceAdvances || {});
  adv[key] = Cards.invoiceAdvances(card, key).filter(function(x){ return x.id !== item.id; });
  if (!adv[key].length) delete adv[key];
  await Store.update(k(), 'cards', card.id, {invoiceAdvances: adv});
  card.invoiceAdvances = adv;
  renderAll();
  toast('Pagamento desfeito.');
}
export async function toggleInvoicePaid(cardId, key){
  var card = findById(State.cards, cardId);
  var paid = (card.paidInvoices || []).slice();
  var pays = Object.assign({}, card.invoicePayments || {});
  var idx = paid.indexOf(key), label = invoiceLabel(key, card), fees = [], removeIds = [];
  // Fatura já paga em que chegaram compras novas: o botão cobra só o que chegou (não desfaz o pagamento).
  var reopened = idx >= 0 && Cards.invoiceExtraAfterPaid(State.transactions, card, key) > 0.004;
  var paidDue = Object.assign({}, card.invoicePaidDue || {});
  if (idx >= 0 && !reopened){
    var prev = pays[key] || {};
    if (prev.mode){
      var ok = await openModal({
        title: 'Desfazer o pagamento?',
        body: '<p>A fatura de ' + label + ' volta a ficar em aberto. O saldo que foi para as próximas faturas' +
          ((prev.feeTxIds || []).length ? ' e os juros lançados' : '') + ' saem também.</p>',
        submitLabel: 'Desfazer pagamento', danger: true
      });
      if (!ok) return;
      removeIds = (prev.feeTxIds || []).filter(function(id){ return findById(State.transactions, id); });
    }
    paid.splice(idx, 1); delete pays[key]; delete paidDue[key];
  } else {
    // O que falta pagar (sem o que já foi adiantado); full é o valor da fatura.
    var full = Cards.invoiceDueTotal(State.transactions, card, key), advanced = Cards.invoiceAdvanced(card, key);
    var total = Cards.invoiceLeft(State.transactions, card, key);
    var stillOpen = Cards.invoiceStatus(card, key, todayKey()) === 'aberta';
    var accOpts = State.accounts.map(function(a){ return {id: a.id, label: a.name + ' (saldo ' + fmtMoney(accountBalance(a)) + ')'}; }).concat([{id:'', label:'Não descontar de nenhuma conta'}]);
    var choice = await openModal({
      title: 'Pagar fatura',
      body: '<p>Fatura de ' + label + ' do ' + escapeHtml(card.name) + ': ' + (advanced > 0 ?
          'falta <strong class="tabular">' + fmtMoney(total) + '</strong> (total ' + fmtMoney(full) + ', já pago ' + fmtMoney(advanced) + ').' :
          '<strong class="tabular">' + fmtMoney(total) + '</strong>.') + '</p>' +
        (reopened ? '<p class="field-hint">Esta fatura já tinha sido paga, mas chegaram compras novas. Aqui você paga só o que chegou.</p>' :
          stillOpen ? '<p class="field-hint">Esta fatura ainda recebe compras: se você passar algo no cartão depois, o valor novo volta a aparecer para pagar.</p>' : '') +
        '<fieldset class="option-cards pay-modes"><legend class="sr-only">Como você pagou?</legend>' + PAY_MODES.filter(function(m){ return !reopened || m.id === 'total' || m.id === 'adiantado'; }).map(function(m, i){
          return '<label class="option-card"><input type="radio" name="mode" value="' + m.id + '"' + (i ? '' : ' checked') + '>' +
            '<span><strong>' + m.title + '</strong><small>' + m.hint + '</small></span></label>';
        }).join('') + '</fieldset>' +
        '<div class="field" data-part hidden><label for="ipPaid">Quanto você pagou agora</label><span class="money-input"><span>R$</span>' +
          '<input id="ipPaid" name="paidNow" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
        '<div class="field" data-only="aberto" hidden><label for="ipFee">Juros e encargos na próxima fatura <span class="opt">opcional</span></label><span class="money-input"><span>R$</span>' +
          '<input id="ipFee" name="fee" type="text" data-money autocomplete="off" inputmode="decimal"></span>' +
          '<span class="field-hint">Se ainda não souber, deixe em branco e lance depois como gasto no cartão.</span></div>' +
        '<div class="pay-parcel" data-only="parcelado" hidden>' +
          '<div class="field"><label for="ipN">Em quantas parcelas</label><input id="ipN" name="n" type="number" min="2" max="48" step="1" value="6"></div>' +
          '<div class="field"><label for="ipParcel">Valor de cada parcela</label><span class="money-input"><span>R$</span>' +
            '<input id="ipParcel" name="parcel" type="text" data-money autocomplete="off" inputmode="decimal"></span>' +
            '<span class="field-hint">O que o banco mostrou, já com juros.</span></div></div>' +
        '<p class="pay-sum tabular" id="ipSum" aria-live="polite"></p>' +
        (State.accounts.length ? '<div class="field"><label for="ipAcc">Paguei com a conta</label><select id="ipAcc" name="acc">' + optionsHtml(accOpts, payAccountFor(card)) + '</select>' +
          '<span class="field-hint">Pode ser a conta de outro banco: o valor sai do saldo da conta escolhida.</span></div>' : '') +
        '<div class="field"><label for="ipDate">Data do pagamento</label><input id="ipDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + todayKey() + '"></div>',
      submitLabel: 'Registrar pagamento',
      onOpen: function(modal){
        var parcelTouched = false;
        function read(){
          var f = qs('form', modal) || modal;
          var mode = (qs('input[name=mode]:checked', modal) || {}).value || 'total';
          var paidNow = mode === 'total' ? total : money(qs('#ipPaid', modal).value);
          var rest = money(total - paidNow), n = Math.round(Number(qs('#ipN', modal).value)) || 0;
          return {f: f, mode: mode, paidNow: paidNow, rest: rest, n: n, parcel: money(qs('#ipParcel', modal).value), fee: money(qs('#ipFee', modal).value)};
        }
        function sync(){
          var v = read();
          qsa('[data-part]', modal).forEach(function(el){ el.hidden = v.mode === 'total'; });
          qsa('[data-only]', modal).forEach(function(el){ el.hidden = el.getAttribute('data-only') !== v.mode; });
          if (v.mode === 'parcelado' && !parcelTouched && v.rest > 0 && v.n > 0) qs('#ipParcel', modal).value = splitAmount(v.rest, v.n)[0].toFixed(2);
          v = read();
          var out = '';
          if (v.mode === 'adiantado' && v.paidNow > 0 && v.rest > 0) out = 'Fica faltando ' + fmtMoney(v.rest) + ' nesta fatura, que continua em aberto.';
          else if (v.mode !== 'total' && v.rest > 0 && v.rest < total + 0.001){
            var next = invoiceLabel(shiftMonthKey(key, 1), card);
            if (v.mode === 'aberto') out = 'Falta ' + fmtMoney(v.rest) + ': vai para a fatura de ' + next + (v.fee > 0 ? ' com ' + fmtMoney(v.fee) + ' de juros' : '') + '.';
            else if (v.n >= 2 && v.parcel > 0){
              var juros = money(v.parcel * v.n - v.rest);
              out = 'Falta ' + fmtMoney(v.rest) + ': ' + v.n + 'x de ' + fmtMoney(v.parcel) + ' = ' + fmtMoney(money(v.parcel * v.n)) +
                ', a partir da fatura de ' + next + '. ' + (juros > 0 ? 'Juros: ' + fmtMoney(juros) + ' (contam como gasto).' : 'Sem juros.');
            }
          }
          qs('#ipSum', modal).textContent = out;
        }
        qs('#ipParcel', modal).addEventListener('input', function(){ parcelTouched = true; });
        qs('#ipN', modal).addEventListener('input', function(){ parcelTouched = false; });
        modal.addEventListener('input', sync); modal.addEventListener('change', sync);
        sync();
      },
      onSubmit: function(form){
        var date = form.date.value || todayKey();
        if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
        var mode = form.mode.value || 'total';
        var out = {mode: mode, accountId: form.acc ? form.acc.value : '', date: date, paidNow: total};
        if (mode === 'total') return out;
        var paidNow = money(form.paidNow.value), rest = money(total - paidNow);
        if (form.paidNow.value === '' || !(paidNow >= 0)) return {error: 'Informe quanto você pagou agora.'};
        if ((mode === 'aberto' || mode === 'adiantado') && !(paidNow > 0)) return {error: 'Informe quanto você pagou. Se não pagou nada, deixe a fatura em aberto.'};
        if (!(rest > 0)) return {error: 'Esse valor paga a fatura toda (tudo o que falta): escolha “Paguei a fatura toda”.'};
        out.paidNow = paidNow; out.rest = rest;
        if (mode === 'adiantado') return out;
        if (mode === 'aberto'){ out.fee = money(form.fee.value) > 0 ? money(form.fee.value) : 0; return out; }
        var n = Math.round(Number(form.n.value)), parcel = money(form.parcel.value);
        if (!(n >= 2 && n <= 48)) return {error: 'O parcelamento vai de 2 a 48 parcelas.'};
        if (!(parcel > 0)) return {error: 'Informe o valor de cada parcela.'};
        if (money(parcel * n) < rest) return {error: n + 'x de ' + fmtMoney(parcel) + ' dá menos que o que faltou (' + fmtMoney(rest) + '). Confira o valor da parcela.'};
        out.n = n; out.parcel = parcel; out.fee = money(parcel * n - rest);
        return out;
      }
    });
    if (!choice) return;
    if (choice.mode === 'adiantado'){ await addInvoiceAdvance(card, key, choice); return; }
    if (choice.mode === 'total' && reopened){ await addInvoiceAdvance(card, key, Object.assign({}, choice, {paidNow: total, rest: 0})); return; }
    var rec = {accountId: choice.accountId, amount: choice.paidNow, date: choice.date, createdAt: Date.now()};
    if (choice.mode !== 'total'){
      Object.assign(rec, {mode: choice.mode, total: total, rest: choice.rest});
      if (choice.mode === 'parcelado') Object.assign(rec, {n: choice.n, parcel: choice.parcel});
      fees = feeTxs(card, key, choice);
    }
    if (choice.accountId || choice.mode !== 'total') pays[key] = rec;
    paid.push(key);
    paidDue[key] = {due: full, at: Date.now()};
  }
  if (fees.length){
    var saved = await Store.addMany(k(), 'transactions', fees);
    State.transactions = saved.concat(State.transactions);
    pays[key].feeTxIds = saved.map(function(t){ return t.id; });
  }
  if (removeIds.length){
    await Store.removeMany(k(), 'transactions', removeIds);
    State.transactions = State.transactions.filter(function(t){ return removeIds.indexOf(t.id) < 0; });
  }
  await Store.update(k(), 'cards', card.id, {paidInvoices: paid, invoicePayments: pays, invoicePaidDue: paidDue});
  card.paidInvoices = paid; card.invoicePayments = pays; card.invoicePaidDue = paidDue;
  if (fees.length || removeIds.length) renderAll();
  else { renderCards(); renderAccounts(); renderStatTiles(); renderWalletSummary(); }
  var p = pays[key];
  toast(idx >= 0 ? 'Fatura marcada como em aberto.' :
    p && p.mode === 'aberto' ? 'Pagamento de ' + fmtMoney(p.amount) + ' registrado. Faltam ' + fmtMoney(p.rest) + ', que vão para a fatura de ' + invoiceLabel(shiftMonthKey(key, 1), card) + '.' :
    p && p.mode === 'parcelado' ? 'Pagamento de ' + fmtMoney(p.amount) + ' registrado. O resto foi parcelado em ' + p.n + 'x de ' + fmtMoney(p.parcel) + '.' :
    'Fatura marcada como paga' + (p && p.accountId ? ' com a conta ' + accountName(p.accountId) : '') + '.');
}
// Juros do pagamento parcial: no rotativo, um gasto na fatura seguinte; no parcelamento, o que passa
// do resto é dividido nas mesmas faturas das parcelas. Ficam no cartão, com a fatura fixada (invoiceKey).
function feeTxs(card, key, c){
  if (!(c.fee > 0)) return [];
  var label = invoiceLabel(key, card), now = Date.now();
  var n = c.mode === 'parcelado' ? c.n : 1, parts = splitAmount(c.fee, n);
  return parts.map(function(v, i){
    return {type: 'expense', paymentMethod: 'cartao', cardId: card.id, amount: v, date: c.date, category: 'outros', categoryLabel: 'Outros',
      invoiceKey: shiftMonthKey(key, i + 1), invoiceFee: {from: key},
      description: c.mode === 'parcelado' ? 'Juros do parcelamento da fatura de ' + label + ' (' + (i + 1) + '/' + n + ')' : 'Juros do rotativo da fatura de ' + label,
      createdAt: now + i};
  });
}

/* ---------- Vale-alimentação / refeição ---------- */

// “Cai todo dia 5 · próximo em 05/12/2026 (em 12 dias)”; vazio se a pessoa não informou o dia.
function creditLine(v){
  var next = nextCredit(v, todayKey());
  if (!next) return '';
  return '<p class="voucher-credit">' + icon('calendar') + '<span>Cai todo dia ' + creditDay(v) + ' · ' + (next.days === 0 ? '<strong>cai hoje</strong>' : 'próximo em ' + formatDateFull(next.date) + ' (' + (next.days === 1 ? 'amanhã' : 'em ' + next.days + ' dias') + ')') + '</span></p>';
}
export function renderVouchers(){
  var wrap = document.getElementById('voucherList');
  if (!State.vouchers.length){ wrap.innerHTML = ''; return; }
  var cur = monthBounds(0).key;
  wrap.innerHTML = State.vouchers.map(function(v){
    var monthTx = voucherTx(v).filter(function(t){ return monthKeyOf(t.date) === cur; });
    var spent = sum(monthTx, function(t){ return t.amount; });
    var bal = voucherBalance(v);
    var pct = Number(v.amount) > 0 ? Math.min(1, spent / Number(v.amount)) : 0;
    return '<div class="goal-card">' +
      '<div class="budget-top"><h4>' + escapeHtml(v.name) + '</h4><span class="pill">' + (v.carryOver ? 'saldo acumula' : 'saldo zera todo mês') + '</span></div>' +
      '<div class="goal-figs"><span>Saldo disponível</span><strong class="tabular ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
      '<div class="progress" title="Gasto do crédito deste mês"><span style="width:' + (pct*100) + '%; background:' + (pct >= 1 ? 'var(--critical)' : pct >= 0.8 ? 'var(--warning)' : 'var(--brand)') + '"></span></div>' +
      '<div class="meta-line"><span>Cai por mês: ' + fmtMoney(v.amount) + '</span><span>Gasto em ' + monthLabelOf(cur) + ': ' + fmtMoney(spent) + '</span></div>' +
      creditLine(v) +
      (monthTx.length ? '<details class="budget-details"><summary>Ver ' + monthTx.length + ' gasto(s) deste mês</summary>' + monthTx.map(txRowHtml).join('') + '</details>' : '') +
      '<div class="card-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-voucher-edit="' + v.id + '">Editar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-voucher-del="' + v.id + '">Excluir</button>' +
      '</div></div>';
  }).join('');
}

export async function editVoucher(id){
  var v = findById(State.vouchers, id);
  await openModal({
    title: 'Editar vale',
    body: '<div class="field"><label for="evName">Nome</label><input id="evName" name="name" type="text" maxlength="30" value="' + escapeHtml(v.name) + '"></div>' +
      '<div class="field"><label for="evAmount">Valor que cai por mês</label><span class="money-input"><span>R$</span><input id="evAmount" name="amount" type="text" data-money autocomplete="off" inputmode="decimal" value="' + v.amount + '"></span></div>' +
      '<div class="field"><label for="evDay">Dia em que o vale cai <span class="opt">(opcional)</span></label><input id="evDay" name="day" type="number" min="1" max="31" step="1" inputmode="numeric" value="' + (creditDay(v) || '') + '" placeholder="Ex: 5"><span class="field-hint">Todo mês. Aparece no calendário e pode avisar.</span></div>' +
      '<div class="field"><label for="evBalance">Saldo atual</label><span class="money-input"><span>R$</span><input id="evBalance" name="balance" type="text" data-money autocomplete="off" inputmode="decimal" value="' + voucherBalance(v) + '"></span><span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do cartão.</span></div>' +
      '<label class="check"><input type="checkbox" name="carry"' + (v.carryOver ? ' checked' : '') + '> Saldo acumula de um mês para o outro</label>',
    onSubmit: async function(form){
      var name = form.name.value.trim(), amount = money(form.amount.value);
      if (!name || !(amount > 0)) return {error:'Informe o nome e o valor mensal do vale.'};
      var dayRaw = String(form.day.value || '').trim(), day = Math.floor(Number(dayRaw));
      if (dayRaw !== '' && !(day >= 1 && day <= 31)) return {error:'O dia em que o vale cai vai de 1 a 31.'};
      var patch = {name:name, amount:amount, carryOver: form.carry.checked, creditDay: dayRaw === '' ? null : day};
      var bal = money(form.balance.value);
      if (form.carry.checked && bal !== voucherBalance(v)){ patch.initialBalance = bal; patch.startDate = todayKey(); patch.adjustedAt = Date.now(); }
      // Ao reajustar o saldo, gastos de hoje já lançados não podem descontar de novo.
      if (patch.startDate){
        patch.initialBalance = money(bal + sum(voucherTx(v).filter(function(t){ return t.date >= patch.startDate; }), function(t){ return t.amount; }));
      }
      await Store.update(k(), 'vouchers', id, patch);
      Object.assign(v, patch);
      renderVouchers(); populatePaymentSelect();
      toast('Vale atualizado.');
    }
  });
}

// Eventos de Contas e cartões: formulários de conta, cartão e vale, e transferência.
export function wireWallet(){
  document.getElementById('accPickerWrap').innerHTML = pickerHtml('naP');
  var newAccPicker = wirePicker(document.getElementById('accountForm'), 'naP', document.getElementById('accName'), document.getElementById('accNewPreview'));
  var hasAcc = document.getElementById('bankHasAcc'), hasCard = document.getElementById('bankHasCard');
  function syncParts(){
    qsa('[data-bank-part="acc"]').forEach(function(el){ el.hidden = !hasAcc.checked; });
    qsa('[data-bank-part="card"]').forEach(function(el){ el.hidden = !hasCard.checked; });
  }
  [hasAcc, hasCard].forEach(function(el){ el.addEventListener('change', syncParts); });
  // "Cor e ícone" fica na linha das caixinhas; as opções abrem numa linha inteira logo abaixo.
  var lookBtn = document.getElementById('bankLookToggle'), lookPanel = document.getElementById('bankLookPanel');
  function setLook(open){ lookPanel.hidden = !open; lookBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  lookBtn.addEventListener('click', function(){ setLook(lookPanel.hidden); });
  document.getElementById('accountForm').addEventListener('reset', function(){ setTimeout(function(){ syncParts(); setLook(false); }, 0); });
  // Um cadastro por banco: a conta (saldo), o cartão (limite e datas da fatura) ou os dois, já ligados.
  document.getElementById('accountForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('accName').value.trim();
    if (!name){ toast('Dê um nome para o banco.'); return; }
    if (!hasAcc.checked && !hasCard.checked){ toast('Marque o que você tem nesse banco: conta, cartão ou os dois.'); return; }
    var look = readPicker(e.target, 'naP'), cardV = null;
    if (hasCard.checked){
      cardV = readCardFields(name, document.getElementById('cardLimit').value, document.getElementById('cardClosing').value, document.getElementById('cardDue').value);
      if (cardV.error){ toast(cardV.error); return; }
    }
    var raw = document.getElementById('accBalance').value, acc = null;
    if (hasAcc.checked){
      acc = await Store.add(k(), 'accounts', Object.assign({name: name, initialBalance: raw === '' ? 0 : money(raw), baseDate: todayKey(), baseAt: Date.now(), createdAt: Date.now()}, look));
      State.accounts.push(acc);
    }
    if (cardV){
      Object.assign(cardV, look, {accountId: acc ? acc.id : null, paidInvoices: [], createdAt: Date.now()});
      State.cards.push(await Store.add(k(), 'cards', cardV));
    }
    e.target.reset(); newAccPicker.reset();
    renderAll();
    toast(name + ' adicionado' + (acc ? ': conta com saldo de ' + fmtMoney(acc.initialBalance) : ':') + (cardV ? (acc ? ' e ' : ' ') + 'cartão com limite de ' + fmtMoney(cardV.limit) : '') + '.');
  });
  document.getElementById('transferBtn').addEventListener('click', function(){ openTransfer(); });
  document.getElementById('bankList').addEventListener('click', function(e){
    var b;
    if ((b = e.target.closest('[data-bank-addcard]'))) addCardToBank(b.getAttribute('data-bank-addcard'));
    else if ((b = e.target.closest('[data-bank-addacc]'))) addAccountToBank(b.getAttribute('data-bank-addacc'));
  });

  document.getElementById('voucherForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('vName').value.trim();
    var amount = money(document.getElementById('vAmount').value);
    var balRaw = document.getElementById('vBalance').value;
    if (!name || !(amount > 0)){ toast('Informe o nome e quanto cai por mês no vale.'); return; }
    var dayRaw = String(document.getElementById('vDay').value || '').trim(), day = Math.floor(Number(dayRaw));
    if (dayRaw !== '' && !(day >= 1 && day <= 31)){ toast('O dia em que o vale cai vai de 1 a 31.'); return; }
    var v = {name:name, amount:amount, carryOver: document.getElementById('vCarry').checked, initialBalance: balRaw === '' ? null : money(balRaw), startDate: todayKey(), createdAt: Date.now()};
    if (dayRaw !== '') v.creditDay = day;
    var saved = await Store.add(k(), 'vouchers', v);
    State.vouchers.push(saved);
    e.target.reset();
    document.getElementById('vCarry').checked = true;
    renderVouchers(); populatePaymentSelect();
    toast('Vale “' + name + '” adicionado.');
  });
}
