/*
 * Contas bancárias, transferências e vale-alimentação.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, monthKeyOf, formatDateBr, validDateStr, monthBounds, monthLabelOf} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import {invoiceLabel} from '../domain/cards.js';

import {badgeHtml, pickerHtml, readPicker, wirePicker} from './brand-picker.js';
import {lookOf} from '../domain/brands.js';
import {Store} from '../data/store.js';
import {qs, escapeHtml, optionsHtml, icon, toast} from './dom.js';
import {openModal} from './modal.js';
import {readCardFields, renderCards, renderWalletSummary} from './cards-tab.js';
import {renderStatTiles, txRowHtml} from './home-tab.js';
import {renderAll} from './shell.js';
import {State, accountBalance, accountMoves, accountName, invoiceItems, k, voucherBalance, voucherTx} from './state.js';
import {populatePaymentSelect} from './tx-list.js';

/* ---------- Contas bancárias ---------- */

export function moveRowHtml(m){
  var pos = m.amount >= 0;
  return '<div class="tx-row">' +
    '<span class="tx-cat-dot" style="background:' + (pos ? 'var(--good)' : 'var(--text-muted)') + '"></span>' +
    '<div class="tx-main"><div class="tx-desc">' + escapeHtml(m.label) + '</div><div class="tx-meta">' + m.kind + ' · ' + formatDateBr(m.date) + '</div></div>' +
    '<span class="tx-amount tabular ' + (pos ? 'income' : 'expense') + '">' + (pos ? '+ ' : '- ') + fmtMoney(Math.abs(m.amount)) + '</span>' +
    (m.transferId ? '<button class="tx-del" type="button" data-transfer-del="' + escapeHtml(m.transferId) + '" aria-label="Excluir transferência" title="Excluir transferência">' + icon('trash') + '</button>' : '') +
    '</div>';
}

export function renderAccounts(){
  document.getElementById('transferBtn').hidden = State.accounts.length < 2;
  var wrap = document.getElementById('accountList');
  if (!State.accounts.length){ wrap.innerHTML = '<p class="empty-state">Nenhuma conta cadastrada. Adicione acima para acompanhar o saldo de cada banco.</p>'; return; }
  var cur = monthBounds(0).key;
  wrap.innerHTML = State.accounts.map(function(a){
    var bal = accountBalance(a);
    var moves = accountMoves(a);
    var month = moves.filter(function(m){ return monthKeyOf(m.date) === cur; });
    return '<div class="goal-card account-card">' +
      '<div class="budget-top"><h4>' + badgeHtml(a) + '<span class="acc-name">' + escapeHtml(a.name) + '</span></h4></div>' +
      '<div class="goal-figs"><span>Saldo hoje</span><strong class="tabular account-balance ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
      '<div class="meta-line"><span>Entrou no mês: ' + fmtMoney(sum(month.filter(function(m){ return m.amount > 0; }), function(m){ return m.amount; })) + '</span>' +
        '<span>Saiu no mês: ' + fmtMoney(-sum(month.filter(function(m){ return m.amount < 0; }), function(m){ return m.amount; })) + '</span></div>' +
      (moves.length ? '<details class="budget-details"><summary>Ver movimentações (' + moves.length + ')</summary>' + moves.slice(0, 40).map(moveRowHtml).join('') + '</details>' : '<p class="tx-meta">Nenhuma movimentação desde o cadastro.</p>') +
      '<div class="card-actions">' +
        (State.accounts.length > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-acc-transfer="' + a.id + '">' + icon('swap') + 'Transferir</button>' : '') +
        '<button class="btn btn-ghost btn-sm" type="button" data-acc-edit="' + a.id + '">Editar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-acc-del="' + a.id + '">Excluir</button>' +
      '</div></div>';
  }).join('');
}

export async function editAccount(id){
  var a = findById(State.accounts, id);
  var current = accountBalance(a);
  await openModal({
    title: 'Editar conta',
    body: '<div class="field"><label for="eaName">Nome da conta</label><input id="eaName" name="name" type="text" maxlength="40" value="' + escapeHtml(a.name) + '"></div>' +
      '<div class="field"><label for="eaBalance">Saldo hoje</label><span class="money-input"><span>R$</span><input id="eaBalance" name="balance" type="number" step="0.01" min="-99999999" max="99999999" value="' + current + '"></span>' +
      '<span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do banco. O app passa a contar a partir de agora.</span></div>' +
      '<fieldset class="brand-fieldset"><legend><span id="eaPreview"></span>Cor e ícone</legend>' + pickerHtml('eaP', a) + '</fieldset>',
    onOpen: function(modal){ wirePicker(modal, 'eaP', qs('#eaName', modal), qs('#eaPreview', modal)); },
    onSubmit: async function(form){
      var name = form.name.value.trim();
      if (!name) return {error:'Dê um nome para a conta.'};
      var patch = Object.assign({name: name}, readPicker(form, 'eaP'));
      var bal = money(form.balance.value);
      if (form.balance.value !== '' && bal !== current){ patch.initialBalance = bal; patch.baseDate = todayKey(); patch.baseAt = Date.now(); }
      await Store.update(k(), 'accounts', id, patch);
      Object.assign(a, patch);
      renderAll();
      toast('Conta atualizada.');
    }
  });
}

export async function openTransfer(fromId){
  var opts = State.accounts.map(function(a){ return {id: a.id, label: a.name + ' (' + fmtMoney(accountBalance(a)) + ')'}; });
  var from = fromId || State.accounts[0].id;
  var to = State.accounts.filter(function(a){ return a.id !== from; })[0].id;
  var r = await openModal({
    title: 'Transferir entre contas',
    body: '<div class="field"><label for="trFrom">De</label><select id="trFrom" name="from">' + optionsHtml(opts, from) + '</select></div>' +
      '<div class="field"><label for="trTo">Para</label><select id="trTo" name="to">' + optionsHtml(opts, to) + '</select></div>' +
      '<div class="field"><label for="trAmount">Valor</label><span class="money-input"><span>R$</span><input id="trAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal"></span></div>' +
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
  var bank = lookOf(card).bank;
  var same = bank && State.accounts.filter(function(a){ var b = lookOf(a).bank; return b && b.id === bank.id; })[0];
  return same ? same.id : (State.accounts[0] ? State.accounts[0].id : '');
}
export async function toggleInvoicePaid(cardId, key){
  var card = findById(State.cards, cardId);
  var paid = (card.paidInvoices || []).slice();
  var pays = Object.assign({}, card.invoicePayments || {});
  var idx = paid.indexOf(key);
  if (idx >= 0){ paid.splice(idx, 1); delete pays[key]; }
  else {
    var total = money(sum(invoiceItems(card, key), function(t){ return t.amount; }));
    if (State.accounts.length){
      var opts = State.accounts.map(function(a){ return {id: a.id, label: a.name + ' (saldo ' + fmtMoney(accountBalance(a)) + ')'}; }).concat([{id:'', label:'Não descontar de nenhuma conta'}]);
      var choice = await openModal({
        title: 'Pagar fatura',
        body: '<p>Fatura de ' + invoiceLabel(key, card) + ' do ' + escapeHtml(card.name) + ': <strong class="tabular">' + fmtMoney(total) + '</strong>.</p>' +
          '<div class="field"><label for="ipAcc">Paguei com a conta</label><select id="ipAcc" name="acc">' + optionsHtml(opts, payAccountFor(card)) + '</select></div>' +
          '<div class="field"><label for="ipDate">Data do pagamento</label><input id="ipDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + todayKey() + '"></div>' +
          '<p class="field-hint">Pode ser a conta de outro banco: o valor sai do saldo da conta escolhida.</p>',
        submitLabel: 'Marcar como paga',
        onSubmit: function(form){
          var date = form.date.value || todayKey();
          if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
          return {accountId: form.acc.value, date: date};
        }
      });
      if (!choice) return;
      if (choice.accountId) pays[key] = {accountId: choice.accountId, amount: total, date: choice.date, createdAt: Date.now()};
    }
    paid.push(key);
  }
  await Store.update(k(), 'cards', card.id, {paidInvoices: paid, invoicePayments: pays});
  card.paidInvoices = paid; card.invoicePayments = pays;
  renderCards(); renderAccounts(); renderStatTiles(); renderWalletSummary();
  toast(idx >= 0 ? 'Fatura marcada como em aberto.' : 'Fatura marcada como paga' + (pays[key] ? ' com a conta ' + accountName(pays[key].accountId) : '') + '.');
}

/* ---------- Vale-alimentação / refeição ---------- */

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
      '<div class="field"><label for="evAmount">Valor que cai por mês</label><span class="money-input"><span>R$</span><input id="evAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" value="' + v.amount + '"></span></div>' +
      '<div class="field"><label for="evBalance">Saldo atual</label><span class="money-input"><span>R$</span><input id="evBalance" name="balance" type="number" step="0.01" min="0" max="99999999" value="' + voucherBalance(v) + '"></span><span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do cartão.</span></div>' +
      '<label class="check"><input type="checkbox" name="carry"' + (v.carryOver ? ' checked' : '') + '> Saldo acumula de um mês para o outro</label>',
    onSubmit: async function(form){
      var name = form.name.value.trim(), amount = money(form.amount.value);
      if (!name || !(amount > 0)) return {error:'Informe o nome e o valor mensal do vale.'};
      var patch = {name:name, amount:amount, carryOver: form.carry.checked};
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
  document.getElementById('cardPickerWrap').innerHTML = pickerHtml('ncP');
  document.getElementById('accPickerWrap').innerHTML = pickerHtml('naP');
  var newCardPicker = wirePicker(document.getElementById('cardForm'), 'ncP', document.getElementById('cardName'), document.getElementById('cardNewPreview'));
  var newAccPicker = wirePicker(document.getElementById('accountForm'), 'naP', document.getElementById('accName'), document.getElementById('accNewPreview'));
  document.getElementById('accountForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('accName').value.trim();
    var raw = document.getElementById('accBalance').value;
    if (!name){ toast('Dê um nome para a conta.'); return; }
    var a = Object.assign({name: name, initialBalance: raw === '' ? 0 : money(raw), baseDate: todayKey(), baseAt: Date.now(), createdAt: Date.now()}, readPicker(e.target, 'naP'));
    var saved = await Store.add(k(), 'accounts', a);
    State.accounts.push(saved);
    e.target.reset(); newAccPicker.reset();
    renderAll();
    toast('Conta “' + name + '” adicionada com saldo de ' + fmtMoney(a.initialBalance) + '.');
  });
  document.getElementById('transferBtn').addEventListener('click', function(){ openTransfer(); });

  document.getElementById('cardForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var v = readCardFields(document.getElementById('cardName').value, document.getElementById('cardLimit').value, document.getElementById('cardClosing').value, document.getElementById('cardDue').value);
    if (v.error){ toast(v.error); return; }
    v.paidInvoices = []; v.createdAt = Date.now();
    Object.assign(v, readPicker(e.target, 'ncP'));
    var saved = await Store.add(k(), 'cards', v);
    State.cards.push(saved);
    e.target.reset(); newCardPicker.reset();
    renderCards(); populatePaymentSelect();
    toast('Cartão “' + v.name + '” adicionado.');
  });

  document.getElementById('voucherForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('vName').value.trim();
    var amount = money(document.getElementById('vAmount').value);
    var balRaw = document.getElementById('vBalance').value;
    if (!name || !(amount > 0)){ toast('Informe o nome e quanto cai por mês no vale.'); return; }
    var v = {name:name, amount:amount, carryOver: document.getElementById('vCarry').checked, initialBalance: balRaw === '' ? null : money(balRaw), startDate: todayKey(), createdAt: Date.now()};
    var saved = await Store.add(k(), 'vouchers', v);
    State.vouchers.push(saved);
    e.target.reset();
    document.getElementById('vCarry').checked = true;
    renderVouchers(); populatePaymentSelect();
    toast('Vale “' + name + '” adicionado.');
  });
}
