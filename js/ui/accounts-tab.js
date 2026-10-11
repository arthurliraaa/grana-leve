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
import {escapeHtml, icon, optionsHtml, qs, qsa, toast} from './dom.js';
import {openModal} from './modal.js';
import {cardHtml, readCardFields, renderCards, renderWalletSummary} from './cards-tab.js';
import {renderStatTiles, txRowHtml} from './home-tab.js';
import {renderAll} from './shell.js';
import {State, accountBalance, accountMoves, accountName, invoiceItems, k, voucherBalance, voucherTx} from './state.js';
import {fold, populatePaymentSelect} from './tx-list.js';

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
// Uma conta: saldo em destaque, entradas e saídas do mês, movimentações recolhidas; transferir à
// frente, editar/excluir separados no fim.
export function accountHtml(a){
  var cur = monthBounds(0).key, bal = accountBalance(a), moves = accountMoves(a);
  var month = moves.filter(function(m){ return monthKeyOf(m.date) === cur; });
  var inM = sum(month.filter(function(m){ return m.amount > 0; }), function(m){ return m.amount; });
  var outM = -sum(month.filter(function(m){ return m.amount < 0; }), function(m){ return m.amount; });
  return '<div class="goal-card account-card">' +
    '<div class="budget-top"><h4>' + badgeHtml(a) + '<span class="acc-name">' + escapeHtml(a.name) + '</span></h4><span class="pill">Conta</span></div>' +
    '<div class="account-kpis">' +
      '<div class="kpi kpi-main"><span class="kpi-lbl">Saldo hoje</span><strong class="tabular account-balance ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
      '<div class="kpi"><span class="kpi-lbl">Entrou no mês</span><strong class="tabular pos-text">' + fmtMoney(inM) + '</strong></div>' +
      '<div class="kpi"><span class="kpi-lbl">Saiu no mês</span><strong class="tabular">' + fmtMoney(outM) + '</strong></div>' +
    '</div>' +
    (moves.length ? '<details class="budget-details"><summary>Ver movimentações (' + moves.length + ')</summary>' + moves.slice(0, 40).map(moveRowHtml).join('') + '</details>' : '<p class="tx-meta">Nenhuma movimentação desde o cadastro.</p>') +
    '<div class="card-actions split-actions">' +
      (State.accounts.length > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-acc-transfer="' + a.id + '">' + icon('swap') + 'Transferir</button>' : '') +
      '<span class="actions-gap" aria-hidden="true"></span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-acc-edit="' + a.id + '">Editar conta</button>' +
      '<button class="btn btn-danger btn-sm" type="button" data-acc-del="' + a.id + '">Excluir conta</button>' +
    '</div></div>';
}
export function renderBanks(){
  document.getElementById('transferBtn').hidden = State.accounts.length < 2;
  var wrap = document.getElementById('bankList');
  var groups = bankGroups();
  if (!groups.length){ wrap.innerHTML = '<p class="empty-state">Nenhum banco cadastrado. Adicione acima a conta e, se tiver, o cartão de crédito.</p>'; return; }
  wrap.innerHTML = groups.map(function(g){
    var first = g.acc || g.cards[0];
    return '<section class="bank-block" aria-label="' + escapeHtml(first.name) + '">' +
      (g.acc ? accountHtml(g.acc) :
        '<div class="bank-only-card"><span class="tx-meta">Só cartão, sem conta neste banco.</span>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-bank-addacc="' + g.cards[0].id + '">' + icon('plus') + 'Adicionar a conta</button></div>') +
      g.cards.map(cardHtml).join('') +
      (g.acc && !g.cards.length ? '<button class="btn btn-ghost btn-sm bank-add-card" type="button" data-bank-addcard="' + g.acc.id + '">' + icon('plus') + 'Adicionar cartão de crédito deste banco</button>' : '') +
      '</section>';
  }).join('');
}
// Cartão novo num banco que já tem conta: mesmo nome, mesmo visual e ligado à conta.
export async function addCardToBank(accId){
  var a = findById(State.accounts, accId);
  await openModal({
    title: 'Cartão de crédito · ' + a.name,
    body: '<div class="field"><label for="bcLimit">Limite</label><span class="money-input"><span>R$</span><input id="bcLimit" name="limit" type="number" step="0.01" min="0" max="99999999"></span></div>' +
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
    body: '<div class="field"><label for="baBalance">Saldo atual da conta</label><span class="money-input"><span>R$</span><input id="baBalance" name="balance" type="number" step="0.01" min="-99999999" max="99999999" placeholder="0,00"></span></div>',
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
  if (card.accountId && findById(State.accounts, card.accountId)) return card.accountId;
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
    var v = {name:name, amount:amount, carryOver: document.getElementById('vCarry').checked, initialBalance: balRaw === '' ? null : money(balRaw), startDate: todayKey(), createdAt: Date.now()};
    var saved = await Store.add(k(), 'vouchers', v);
    State.vouchers.push(saved);
    e.target.reset();
    document.getElementById('vCarry').checked = true;
    renderVouchers(); populatePaymentSelect();
    toast('Vale “' + name + '” adicionado.');
  });
}
