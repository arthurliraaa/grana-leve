/*
 * Lançamento: popup do botão +, edição, estorno, compra parcelada inteira e adiantamento de parcelas.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, monthKeyOf, formatDateBr, formatDateFull, validDateStr, monthBounds, shiftMonthKey} from '../domain/dates.js';
import {money, sumMoney, fmtMoney, splitAmount} from '../domain/money.js';
import {findById, sum} from '../domain/util.js';
import * as Cats from '../domain/categories.js';
import {CUSTOM_COLORS} from '../domain/categories.js';
import * as Tx from '../domain/transactions.js';
import {clampInstall, isPersonal, reversalsOf, myShare} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import {invoiceKeyFor, invoiceLabel} from '../domain/cards.js';
import {Store} from '../data/store.js';

import {qs, qsa, escapeHtml, optionsHtml, icon, resolveVar, toast} from './dom.js';
import {openModal} from './modal.js';
import {openQuickEntry} from './chat.js';
import {paymentLabel} from './home-tab.js';
import {renderAll} from './shell.js';
import {State, accountName, budgetLimit, catBadge, catLabel, catOptions, categoryNameProblem, expandInstallments, expenseCategoryTotals, expenseCats, incomeCats, installmentGroups, invoiceStatus, k, sortTransactions} from './state.js';
import {accountSelectHtml, addCategory, applyPayment, installExtrasHtml, installStepperHtml, installSummary, paymentOptions, paymentValue, populateCategorySelect, readInstallExtras} from './tx-list.js';

/* ---------- Popup de lançamento (botão + e edição) ---------- */
export function txModalBody(t, isEdit){
  var inst = isEdit && t.installment;
  var type = t.type || 'expense';
  function typeBtn(id, label){ return '<button type="button" data-type="' + id + '"' + (type === id ? ' class="active"' : '') + (inst ? ' disabled' : '') + '>' + label + '</button>'; }
  return '<div class="type-toggle" id="mType" role="group" aria-label="Tipo de lançamento">' + typeBtn('expense', 'Gasto') + typeBtn('income', 'Ganho') + '</div>' +
    '<div class="field"><label for="mAmount">' + (inst ? 'Valor da parcela' : 'Valor') + '</label><span class="money-input"><span>R$</span><input id="mAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + (t.amount || '') + '"></span></div>' +
    '<div class="field"><label for="mCategory">Categoria</label><select id="mCategory" name="category"></select></div>' +
    '<div class="field" id="mNewCatField" hidden><label for="mNewCat">Nome da nova categoria</label><input id="mNewCat" name="newCat" type="text" maxlength="30" placeholder="Ex: Pets, Academia"></div>' +
    '<div class="field"><label for="mDate">Data</label><input id="mDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + escapeHtml(t.date || todayKey()) + '"' + (inst ? ' disabled' : '') + '></div>' +
    '<div class="field" id="mPayField"><label for="mPay">Forma de pagamento</label><select id="mPay" name="pay"' + (inst ? ' disabled' : '') + '></select></div>' +
    accountSelectHtml('mAcc', 'acc', 'Entrou em', isEdit ? (t.type === 'income' ? t.accountId : undefined) : undefined) +
    (isEdit ? '' : '<div class="field" id="mInstallField" hidden><label for="mInstall">Parcelas</label>' + installStepperHtml('mInstall', 'install') + '<span class="field-hint tabular" id="mInstallHint">À vista</span>' + installExtrasHtml('mIx') + '</div>') +
    '<div class="field"><label for="mDesc">Descrição (opcional)</label><input id="mDesc" name="desc" type="text" maxlength="80" placeholder="Ex: mercado da semana" value="' + escapeHtml(inst ? t.installment.baseDescription : (t.description || '')) + '"></div>' +
    (inst ? '<p class="field-hint">Parcela ' + t.installment.n + ' de ' + t.installment.total + '. Categoria e descrição mudam em todas as parcelas; o valor muda só nesta (ex.: juros). Para mudar o total, o número de parcelas, o cartão ou a data, ou para dividir os valores igualmente de novo, use o botão abaixo.</p>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-m-group style="justify-self:start">' + icon('edit') + 'Editar a compra inteira</button>' : '') +
    (isEdit && t.type === 'expense' && !t.writeOff ? '<button type="button" class="btn btn-ghost btn-sm" data-m-reversal style="justify-self:start">' + icon('swap') + 'Registrar estorno</button>' : '') +
    (isEdit ? '' : '<button type="button" class="linklike" data-m-chat style="justify-self:start">Prefere escrever? Lance pelo chat</button>');
}

export async function openTxModal(t){
  var isEdit = !!(t && t.id);
  t = t || {type: 'expense'};
  var inst = isEdit && t.installment;
  var mType = t.type || 'expense';
  await openModal({
    title: isEdit ? 'Editar lançamento' : 'Novo lançamento',
    body: txModalBody(t, isEdit),
    submitLabel: isEdit ? 'Salvar alterações' : 'Adicionar lançamento',
    onOpen: function(modal, close){
      var catSel = qs('#mCategory', modal), paySel = qs('#mPay', modal), instSel = qs('#mInstall', modal);
      function syncNewCat(){ qs('#mNewCatField', modal).hidden = catSel.value !== '__new'; }
      function fillCats(selected){
        var list = mType === 'income' ? incomeCats() : expenseCats();
        catSel.innerHTML = optionsHtml(catOptions(list), selected) + '<option value="__new">+ Nova categoria…</option>';
        if (!findById(list, selected)) catSel.value = list[0].id;
        syncNewCat();
      }
      function fillInstall(){
        if (instSel) qs('#mInstallHint', modal).textContent = installSummary(modal, 'mIx', clampInstall(instSel.value), money(qs('#mAmount', modal).value));
      }
      function sync(){
        var isExp = mType === 'expense';
        qs('#mPayField', modal).hidden = !isExp;
        if (qs('#mAccField', modal)) qs('#mAccField', modal).hidden = isExp;
        if (!instSel) return;
        var onCard = isExp && paySel.value.indexOf('card:') === 0 && paySel.value !== 'card:none';
        qs('#mInstallField', modal).hidden = !onCard;
        if (!onCard){ instSel.value = '1'; fillInstall(); }
      }
      var payOpts = paymentOptions();
      paySel.innerHTML = optionsHtml(payOpts, isEdit ? paymentValue(t) : payOpts[0].id);
      fillCats(t.category); fillInstall(); sync();
      qs('#mType', modal).addEventListener('click', function(e){
        var b = e.target.closest('button[data-type]');
        if (!b || b.disabled) return;
        mType = b.getAttribute('data-type');
        qsa('button', qs('#mType', modal)).forEach(function(x){ x.classList.toggle('active', x === b); });
        fillCats(); sync();
      });
      catSel.addEventListener('change', syncNewCat);
      paySel.addEventListener('change', function(){
        if (paySel.value.indexOf('vale') === 0 && mType === 'expense') catSel.value = 'alimentacao';
        syncNewCat(); sync();
      });
      qs('#mAmount', modal).addEventListener('input', fillInstall);
      if (instSel){ instSel.addEventListener('input', fillInstall); modal.addEventListener('input', function(e){ if (e.target.name === 'mIxStart') fillInstall(); }); modal.addEventListener('change', function(e){ if (e.target.name === 'mIxMode') fillInstall(); }); }
      var revBtn = qs('[data-m-reversal]', modal);
      if (revBtn) revBtn.addEventListener('click', function(){ close(null); reverseTx(t.id); });
      var grp = qs('[data-m-group]', modal);
      if (grp) grp.addEventListener('click', function(){ close(null); editInstallmentGroup(t.installment.group); });
      var chat = qs('[data-m-chat]', modal);
      if (chat) chat.addEventListener('click', function(){ close(null); openQuickEntry(false); });
    },
    onSubmit: async function(form){
      var amount = money(form.amount.value);
      if (!(amount > 0)) return {error:'Informe um valor maior que zero.'};
      var date = inst ? t.date : (form.date.value || todayKey());
      if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
      var category = form.category.value;
      if (category === '__new'){
        var made = await addCategory(form.newCat.value, mType);
        if (made.error) return made;
        category = made.id;
      }
      var tx = {type: mType, amount: amount, category: category, categoryLabel: catLabel(category, mType), date: date, description: form.desc.value.trim()};
      if (mType === 'income'){ tx.paymentMethod = null; tx.cardId = null; tx.voucherId = null; tx.accountId = form.acc ? (form.acc.value || null) : null; }
      else if (!inst){
        if (form.pay.value === 'card:none') return {error:'Cadastre um cartão em “Contas e cartões” primeiro.'};
        applyPayment(tx, form.pay.value);
      }
      if (isEdit){ await saveTxEdit(t, tx); return true; }
      tx.createdAt = Date.now();
      var n = tx.paymentMethod === 'cartao' ? clampInstall(form.install.value) : 1;
      var ex = readInstallExtras(form, 'mIx', n);
      tx.amount = Tx.purchaseTotal(amount, n, ex.per);
      await saveTransactions(expandInstallments(tx, n, ex.start));
      renderAll();
      toast((mType === 'expense' ? 'Gasto' : 'Ganho') + ' de ' + fmtMoney(tx.amount) + (n > 1 ? ' em ' + n + 'x' + (ex.start > 1 ? ' (a partir da ' + ex.start + 'ª)' : '') : '') + ' registrado.');
      return true;
    }
  });
}

// Estorno de uma compra: crédito (valor negativo) ligado à compra, sem apagar nada.
// Cartão: a pessoa escolhe em qual fatura o crédito aparece (fatura fechada → costuma vir na próxima).
// Parcelada: pode estornar também as parcelas futuras, cada uma na fatura dela.
export async function reverseTx(id){
  var t = findById(State.transactions, id);
  if (!t) return;
  var today = todayKey(), card = t.paymentMethod === 'cartao' ? findById(State.cards, t.cardId) : null;
  var group = t.installment ? State.transactions.filter(function(x){ return x.installment && x.installment.group === t.installment.group; }) : [t];
  var already = sumMoney(group, function(x){ return -sumMoney(reversalsOf(State.transactions, x.id), function(r){ return r.amount; }); });
  var charged = group.filter(function(x){ return x.date <= today && !reversalsOf(State.transactions, x.id).length; });
  var future = group.filter(function(x){ return x.date > today && !reversalsOf(State.transactions, x.id).length; });
  var base = sumMoney(t.installment ? charged : [t], function(x){ return x.amount; }) - (t.installment ? 0 : already);
  if (!(base > 0) && !future.length){ toast('Esta compra já foi estornada por completo.'); return; }
  var name = t.installment ? t.installment.baseDescription : (t.description || catLabel(t.category, 'expense'));
  var keys = [];
  if (card){
    var k0 = Cards.txInvoiceKey(t.installment ? (charged[0] || t) : t, card), open = invoiceKeyFor(today, card);
    for (var key = k0; key <= shiftMonthKey(open, 1); key = shiftMonthKey(key, 1)){
      var st = invoiceStatus(card, key);
      keys.push({id: key, label: 'Fatura de ' + invoiceLabel(key, card) + ' (' + st + ')'});
    }
  }
  var a = await openModal({
    title: 'Registrar estorno',
    body: '<p><strong>' + escapeHtml(name) + '</strong> · ' + formatDateBr(t.date) + ' · ' + escapeHtml(paymentLabel(t) || 'sem forma de pagamento') +
        (t.installment ? ' · ' + t.installment.total + 'x' : '') + (already ? ' · já estornado ' + fmtMoney(already) : '') + '</p>' +
      (t.installment ? '<p class="card-sub">Parcelas já cobradas: ' + charged.length + ' (' + fmtMoney(sumMoney(charged, function(x){ return x.amount; })) + ') · futuras: ' + future.length +
        ' (' + fmtMoney(sumMoney(future, function(x){ return x.amount; })) + ')</p>' : '') +
      '<div class="field"><label for="rvAmount">Valor estornado' + (t.installment ? ' das parcelas já cobradas' : '') + '</label><span class="money-input"><span>R$</span><input id="rvAmount" name="amount" type="number" step="0.01" min="0" max="' + Math.max(0, base) + '" inputmode="decimal" value="' + money(Math.max(0, base)) + '"></span>' +
        '<span class="field-hint">Estorno parcial? Informe só o que voltou.</span></div>' +
      '<div class="field"><label for="rvDate">Data do estorno</label><input id="rvDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + today + '"></div>' +
      (card ? '<div class="field"><label for="rvInv">Em qual fatura o estorno aparece?</label><select id="rvInv" name="inv">' + optionsHtml(keys, invoiceKeyFor(today, card)) + '</select>' +
        '<span class="field-hint">Fatura ainda aberta: o crédito abate nela. Fatura já fechada: o banco costuma lançar o crédito na próxima. Escolha como aparece no app do banco.</span></div>' : '') +
      (future.length ? '<label class="check"><input type="checkbox" name="future" checked> Estornar também as ' + future.length + ' parcela(s) futura(s) (' + fmtMoney(sumMoney(future, function(x){ return x.amount; })) + '), cada uma na sua fatura</label>' : '') +
      '<p class="field-hint">' + (card ? 'O crédito abate na fatura escolhida e libera o limite.' : t.paymentMethod === 'conta' && t.accountId ? 'O valor volta para o saldo de ' + escapeHtml(accountName(t.accountId)) + '.' : 'O valor volta para onde saiu.') +
        ' A compra continua no histórico, marcada como estornada, e o estorno abate os gastos do mês em que entrou.</p>',
    submitLabel: 'Registrar estorno',
    onSubmit: function(form){
      var v = money(form.amount.value), withFuture = !!(form.future && form.future.checked);
      if (!(v > 0) && !withFuture) return {error: 'Informe o valor estornado.'};
      if (v > base + 0.001) return {error: 'O estorno não pode passar de ' + fmtMoney(base) + '.'};
      if (!validDateStr(form.date.value)) return {error: 'Use uma data entre 1900 e 3000.'};
      return {amount: v, date: form.date.value, inv: form.inv ? form.inv.value : null, future: withFuture};
    }
  });
  if (!a) return;
  function credit(of, amount, date, invKey, label){
    var r = {type: 'expense', amount: -money(amount), category: of.category, categoryLabel: catLabel(of.category, 'expense'), date: date,
      description: 'Estorno: ' + label, paymentMethod: of.paymentMethod, accountId: of.accountId || null, cardId: of.cardId || null, voucherId: of.voucherId || null,
      reversal: {of: of.id}, createdAt: Date.now()};
    if (invKey) r.invoiceKey = invKey;
    if (of.forOther) r.forOther = of.forOther;
    if (of.split) r.split = of.split;
    return r;
  }
  var list = [];
  if (a.amount > 0) list.push(credit(t.installment ? (charged[charged.length - 1] || t) : t, a.amount, a.date, a.inv, name));
  if (a.future) future.forEach(function(x){ list.push(credit(x, x.amount, x.date, null, name + ' (' + x.installment.n + '/' + x.installment.total + ')')); });
  await saveTransactions(list);
  renderAll();
  toast('Estorno de ' + fmtMoney(sumMoney(list, function(r){ return -r.amount; })) + ' registrado' + (card && a.inv ? ' na fatura de ' + invoiceLabel(a.inv, card) : '') + '.');
}

// Compra parcelada inteira: valor (total ou por parcela), número de parcelas, parcela atual, cartão, data,
// categoria e descrição. As parcelas são refeitas com valores iguais (isso também "redefine" valores
// mudados um a um). Compras com parcelas adiantadas não podem ser refeitas, para não perder o adiantamento.
export async function editInstallmentGroup(groupId){
  var g = installmentGroups().filter(function(x){ return x.id === groupId; })[0];
  if (!g) return;
  if (g.advanced){ toast('Esta compra tem parcelas adiantadas. Para mudar valor ou parcelas, exclua e lance de novo.'); return; }
  var first = g.items[0], sumNow = sumMoney(g.items, function(t){ return t.amount; });
  var cards = State.cards.map(function(c){ return {id: c.id, label: c.name}; });
  var equalNow = splitAmountEqual(g.totalAmount, g.total, g.items);
  await openModal({
    title: 'Editar compra parcelada',
    body: '<div class="field"><label for="gDesc">Descrição</label><input id="gDesc" name="desc" type="text" maxlength="80" value="' + escapeHtml(g.name) + '"></div>' +
      '<div class="field"><label for="gCat">Categoria</label><select id="gCat" name="cat">' + optionsHtml(catOptions(expenseCats()), g.category) + '</select></div>' +
      '<div class="field"><label for="gCard">Cartão</label><select id="gCard" name="card">' + optionsHtml(cards, g.cardId) + '</select></div>' +
      '<div class="field"><label for="gAmount">Valor</label><span class="money-input"><span>R$</span><input id="gAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + g.totalAmount + '"></span></div>' +
      '<div class="field"><label for="gInstall">Parcelas</label>' + installStepperHtml('gInstall', 'install') + '<span class="field-hint tabular" id="gHint"></span>' + installExtrasHtml('gIx') + '</div>' +
      '<div class="field"><label for="gDate">Data da parcela atual</label><input id="gDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + escapeHtml(first.date) + '"></div>' +
      (equalNow ? '' : '<p class="tip-box">Algumas parcelas têm valores diferentes (soma atual: ' + fmtMoney(sumNow) + '). Salvar divide o valor igualmente de novo.</p>') +
      '<p class="field-hint">As parcelas desta compra são refeitas com valores iguais. Pagamentos de fatura já marcados não mudam.</p>',
    submitLabel: 'Salvar compra',
    onOpen: function(modal){
      qs('#gInstall', modal).value = g.total;
      qs('#gIxStart', modal).value = first.installment.n;
      function hint(){ qs('#gHint', modal).textContent = installSummary(modal, 'gIx', clampInstall(qs('#gInstall', modal).value), money(qs('#gAmount', modal).value)); }
      modal.addEventListener('input', hint); modal.addEventListener('change', hint); hint();
    },
    onSubmit: async function(form){
      var n = clampInstall(form.install.value), typed = money(form.amount.value);
      if (!(typed > 0)) return {error: 'Informe um valor maior que zero.'};
      if (n < 2) return {error: 'Uma compra parcelada tem pelo menos 2 parcelas. Para à vista, exclua e lance de novo.'};
      if (!validDateStr(form.date.value)) return {error: 'Use uma data entre 1900 e 3000.'};
      var ex = readInstallExtras(form, 'gIx', n);
      var base = form.desc.value.trim() || catLabel(form.cat.value, 'expense');
      var tx = {type: 'expense', amount: Tx.purchaseTotal(typed, n, ex.per), category: form.cat.value, categoryLabel: catLabel(form.cat.value, 'expense'),
        date: form.date.value, description: base, paymentMethod: 'cartao', cardId: form.card.value, accountId: null, voucherId: null, createdAt: first.createdAt || Date.now()};
      if (first.forOther) tx.forOther = first.forOther;
      var fresh = Tx.expandInstallments(tx, n, groupId, base, ex.start);
      for (var i = 0; i < g.items.length; i++){ await Store.remove(k(), 'transactions', g.items[i].id); }
      State.transactions = State.transactions.filter(function(t){ return !(t.installment && t.installment.group === groupId); });
      for (var j = 0; j < fresh.length; j++){ State.transactions.unshift(await Store.add(k(), 'transactions', fresh[j])); }
      if (first.forOther){
        var r = findById(State.receivables, first.forOther.receivableId);
        if (r){
          var patch = {totalAmount: sumMoney(fresh, function(t){ return t.amount; }), installments: fresh.length, installmentAmount: fresh[fresh.length - 1].amount, cardId: tx.cardId};
          await Store.update(k(), 'receivables', r.id, patch); Object.assign(r, patch);
        }
      }
      sortTransactions(); renderAll();
      toast('Compra atualizada: ' + n + 'x' + (ex.start > 1 ? ' a partir da ' + ex.start + 'ª' : '') + '.');
      return true;
    }
  });
}
export function splitAmountEqual(total, n, items){
  var parts = splitAmount(total, n);
  return items.every(function(t){ return Math.abs(t.amount - parts[t.installment.n - 1]) < 0.005; });
}

// Na compra parcelada, categoria e descrição mudam em todas as parcelas; o valor muda só na parcela editada.
export async function saveTxEdit(t, patch){
  if (t.installment){
    var base = patch.description || catLabel(patch.category, 'expense');
    var group = State.transactions.filter(function(x){ return x.installment && x.installment.group === t.installment.group; });
    var delta = money(patch.amount - t.amount);
    for (var i=0;i<group.length;i++){
      var x = group[i];
      var p = {category: patch.category, categoryLabel: patch.categoryLabel, description: base + ' (' + x.installment.n + '/' + x.installment.total + ')',
        installment: Object.assign({}, x.installment, {baseDescription: base, totalAmount: money(Number(x.installment.totalAmount) + delta)})};
      if (x.id === t.id) p.amount = patch.amount;
      await Store.update(k(), 'transactions', x.id, p);
      Object.assign(x, p);
    }
  } else {
    await Store.update(k(), 'transactions', t.id, patch);
    Object.assign(t, patch);
  }
  sortTransactions();
  renderAll();
  toast('Lançamento atualizado.');
}

// Personalizar categorias: nome, emoji e cor de todas (padrão e criadas), criar e excluir.
// As padrão personalizadas ficam salvas com o mesmo id (isDefault) e podem voltar ao original.
export function firstEmoji(text){
  text = String(text || '').trim();
  if (!text) return '';
  if (window.Intl && Intl.Segmenter){ var it = new Intl.Segmenter('pt-BR', {granularity: 'grapheme'}).segment(text)[Symbol.iterator]().next(); return it.value ? it.value.segment : ''; }
  return Array.from(text)[0];
}
export function toHex(color){
  var v = resolveVar(color);
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#6b7280';
}
export async function manageCategories(){
  var editing = null;   // {id, type, label, emoji, color, isNew, isDefault}
  function saved(id){ return findById(State.categories, id); }
  function rowHtml(c, type){
    var custom = !c.isDefault;
    return '<div class="list-row cat-row">' + catBadge(c.id, type) +
      '<div class="tx-main"><div class="tx-desc">' + escapeHtml(c.label) + '</div><div class="tx-meta">' + (custom ? 'Criada por você' : (saved(c.id) ? 'Padrão personalizada' : 'Padrão')) + '</div></div>' +
      '<button class="tx-del tx-edit" type="button" data-cat-edit="' + escapeHtml(c.id) + '" data-type="' + type + '" aria-label="Personalizar ' + escapeHtml(c.label) + '" title="Personalizar">' + icon('edit') + '</button>' +
      (custom ? '<button class="tx-del" type="button" data-cat-del="' + escapeHtml(c.id) + '" aria-label="Excluir ' + escapeHtml(c.label) + '" title="Excluir">' + icon('trash') + '</button>' : '<span class="tx-del-space" aria-hidden="true"></span>') +
      '</div>';
  }
  function editorHtml(){
    var e = editing;
    return '<div class="cat-editor" role="group" aria-label="' + (e.isNew ? 'Nova categoria' : 'Personalizar ' + escapeHtml(e.label)) + '">' +
      '<div class="cat-editor-head"><span class="cat-badge cat-badge-lg" id="cePreview" style="--cat:' + escapeHtml(e.color) + '" aria-hidden="true">' + escapeHtml(e.emoji) + '</span>' +
        '<div class="field"><label for="ceName">Nome</label><input id="ceName" type="text" maxlength="30" value="' + escapeHtml(e.label) + '" placeholder="Ex: Pets, Academia"></div></div>' +
      '<fieldset class="picker"><legend>Emoji</legend><div class="emoji-grid">' + Cats.PICKER_EMOJIS.map(function(em){
          return '<button type="button" class="emoji-opt" data-emoji="' + em + '" aria-pressed="' + (em === e.emoji) + '" aria-label="Usar ' + em + '">' + em + '</button>';
        }).join('') + '</div>' +
        '<label class="emoji-custom" for="ceEmoji">Ou digite qualquer emoji:</label><input id="ceEmoji" class="emoji-input" type="text" maxlength="16" value="' + escapeHtml(e.emoji) + '"></fieldset>' +
      '<fieldset class="picker"><legend>Cor</legend><div class="color-grid">' + Cats.PICKER_COLORS.map(function(col){
          return '<button type="button" class="color-opt" data-color="' + col + '" style="--swatch:' + col + '" aria-pressed="' + (col === toHex(e.color)) + '" aria-label="Cor ' + col + '"></button>';
        }).join('') + '<label class="color-custom"><input type="color" id="ceColor" value="' + toHex(e.color) + '"> Outra cor</label></div></fieldset>' +
      '<div class="card-actions">' +
        '<button class="btn btn-primary btn-sm" type="button" data-cat-save>' + (e.isNew ? 'Criar categoria' : 'Salvar') + '</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-cat-cancel>Cancelar</button>' +
        (e.isDefault && saved(e.id) ? '<button class="btn btn-ghost btn-sm" type="button" data-cat-reset>Voltar ao padrão</button>' : '') +
      '</div></div>';
  }
  function section(type, title){
    var list = type === 'income' ? incomeCats() : expenseCats();
    return '<section class="cat-section"><h4>' + title + '</h4>' +
      list.map(function(c){ return editing && !editing.isNew && editing.id === c.id && editing.type === type ? editorHtml() : rowHtml(c, type); }).join('') +
      (editing && editing.isNew && editing.type === type ? editorHtml() :
        '<button class="btn btn-ghost btn-sm cat-new" type="button" data-cat-new="' + type + '">' + icon('plus') + 'Nova categoria de ' + (type === 'income' ? 'ganho' : 'gasto') + '</button>') +
      '</section>';
  }
  function bodyHtml(){
    return section('expense', 'Gastos') + section('income', 'Ganhos') +
      '<p class="field-hint">A mesma categoria vale em “Ganhos e gastos” e em “Planejar gastos”. Ao excluir uma categoria criada por você, os lançamentos continuam guardados com o nome dela.</p>';
  }
  await openModal({
    title: 'Personalizar categorias', wide: true,
    body: '<div id="catManageBody">' + bodyHtml() + '</div>',
    submitLabel: null, cancelLabel: 'Fechar',
    onOpen: function(root){
      var body = qs('#catManageBody', root);
      var err = qs('[data-modal-error]', root);
      function redraw(focusSel){
        body.innerHTML = bodyHtml();
        var f = focusSel && qs(focusSel, body);
        if (f){ f.focus(); if (f.select) f.select(); }
      }
      function setLook(patch){
        Object.assign(editing, patch);
        var prev = qs('#cePreview', body);
        prev.textContent = editing.emoji;
        prev.style.setProperty('--cat', editing.color);
        qsa('.emoji-opt', body).forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-emoji') === editing.emoji)); });
        qsa('.color-opt', body).forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-color') === toHex(editing.color))); });
      }
      async function save(){
        var name = qs('#ceName', body).value.trim();
        var problem = categoryNameProblem(name, editing.type, editing.isNew ? undefined : editing.id);
        if (problem){ err.textContent = problem; qs('#ceName', body).focus(); return; }
        if (!editing.emoji){ err.textContent = 'Escolha um emoji.'; return; }
        err.textContent = '';
        var look = {emoji: editing.emoji, color: editing.color};
        if (editing.isNew){
          await addCategory(name, editing.type, look);
        } else if (editing.isDefault){
          var doc = {label: name, type: editing.type, emoji: look.emoji, color: look.color, isDefault: true, updatedAt: Date.now()};
          await Store.put(k(), 'categories', editing.id, doc);
          State.categories = State.categories.filter(function(c){ return c.id !== editing.id; }).concat([Object.assign({id: editing.id}, doc)]);
        } else {
          var patch = {label: name, emoji: look.emoji, color: look.color};
          await Store.update(k(), 'categories', editing.id, patch);
          Object.assign(saved(editing.id), patch);
        }
        var msg = editing.isNew ? 'Categoria “' + name + '” criada.' : 'Categoria “' + name + '” atualizada.';
        editing = null;
        redraw();
        populateCategorySelect(document.getElementById('txCategory').value);
        renderAll();
        toast(msg);
      }
      root.addEventListener('click', async function(e){
        var b;
        if ((b = e.target.closest('[data-cat-edit]'))){
          var c = findById(b.getAttribute('data-type') === 'income' ? incomeCats() : expenseCats(), b.getAttribute('data-cat-edit'));
          editing = {id: c.id, type: b.getAttribute('data-type'), label: c.label, emoji: c.emoji, color: c.color, isDefault: !!c.isDefault};
          err.textContent = ''; redraw('#ceName'); return;
        }
        if ((b = e.target.closest('[data-cat-new]'))){
          var type = b.getAttribute('data-cat-new');
          editing = {type: type, label: '', emoji: Cats.DEFAULT_EMOJI, color: CUSTOM_COLORS[State.categories.length % CUSTOM_COLORS.length], isNew: true};
          err.textContent = ''; redraw('#ceName'); return;
        }
        if ((b = e.target.closest('[data-emoji]'))){ setLook({emoji: b.getAttribute('data-emoji')}); qs('#ceEmoji', body).value = editing.emoji; return; }
        if ((b = e.target.closest('[data-color]'))){ setLook({color: b.getAttribute('data-color')}); qs('#ceColor', body).value = editing.color; return; }
        if (e.target.closest('[data-cat-cancel]')){ editing = null; err.textContent = ''; redraw(); return; }
        if (e.target.closest('[data-cat-save]')){ await save(); return; }
        if (e.target.closest('[data-cat-reset]')){
          var id = editing.id;
          await Store.remove(k(), 'categories', id);
          State.categories = State.categories.filter(function(x){ return x.id !== id; });
          editing = null; redraw(); populateCategorySelect(document.getElementById('txCategory').value); renderAll();
          toast('Categoria voltou ao padrão.');
          return;
        }
        if ((b = e.target.closest('[data-cat-del]'))){
          var del = b.getAttribute('data-cat-del');
          await Store.remove(k(), 'categories', del);
          State.categories = State.categories.filter(function(x){ return x.id !== del; });
          redraw(); populateCategorySelect(); renderAll();
        }
      });
      root.addEventListener('input', function(e){
        if (!editing) return;
        if (e.target.id === 'ceEmoji'){ var em = firstEmoji(e.target.value); if (em) setLook({emoji: em}); }
        if (e.target.id === 'ceColor') setLook({color: e.target.value});
      });
      // Enter no nome salva, em vez de enviar o formulário do popup.
      root.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && editing && (e.target.id === 'ceName' || e.target.id === 'ceEmoji')){ e.preventDefault(); save(); }
      });
    }
  });
}

/* ---------- Compras parceladas ---------- */
export async function saveTransactions(list){
  var saved = [];
  for (var i=0;i<list.length;i++){
    var s = await Store.add(k(), 'transactions', list[i]);
    State.transactions.unshift(s);
    saved.push(s);
  }
  sortTransactions();
  checkBudgetAlerts(saved);
  return saved;
}

// Avisa na hora quando um gasto do mês atual faz a categoria chegar a 80% ou passar do planejado.
export function checkBudgetAlerts(newTx){
  var cur = monthBounds(0).key, added = {};
  newTx.forEach(function(t){ if (t.type === 'expense' && isPersonal(t) && monthKeyOf(t.date) === cur) added[t.category] = (added[t.category]||0) + myShare(t); });
  var spentNow = expenseCategoryTotals(cur);
  Object.keys(added).forEach(function(cat){
    var limit = budgetLimit(cur, cat);
    if (!limit) return;
    var after = spentNow[cat] || 0, before = after - added[cat];
    var name = catLabel(cat, 'expense');
    if (after > limit && before <= limit){
      toast('Atenção: você passou ' + fmtMoney(after - limit) + ' do planejado para ' + name + ' neste mês.');
    } else if (after >= 0.8 * limit && before < 0.8 * limit){
      toast('Você já usou ' + Math.round(100 * after / limit) + '% do planejado para ' + name + '. Restam ' + fmtMoney(limit - after) + '.');
    }
  });
}
export function installmentRowHtml(g, withCard){
  var pct = g.total > 0 ? g.done / g.total : 0;
  return '<div class="debt-card">' +
    '<div class="budget-top"><h4>' + escapeHtml(g.name) + '</h4><span class="pill">' + g.total + 'x' + (withCard && g.card ? ' · ' + escapeHtml(g.card.name) : '') + '</span></div>' +
    '<div class="progress"><span style="width:' + (pct*100) + '%; background:var(--good)"></span></div>' +
    '<div class="debt-figs"><span class="tabular">Parcela ' + Math.min(g.total, g.done) + ' de ' + g.total + ' · ' + fmtMoney(g.perInstallment) + '</span><span class="tabular">Falta: ' + fmtMoney(g.remaining) + '</span></div>' +
    '<span class="tx-meta">Compra de ' + fmtMoney(g.totalAmount) + (g.before ? ' · ' + g.before + ' paga(s) antes do cadastro' : '') + (g.advanced ? ' · ' + g.advanced + ' parcela(s) adiantada(s)' : '') + (g.future.length ? ' · última parcela em ' + formatDateFull(g.lastDate) : '') + '</span>' +
    '<div class="card-actions">' + (g.future.length ? '<button class="btn btn-ghost btn-sm" type="button" data-adv-group="' + escapeHtml(g.id) + '">Adiantar pagamento</button>' : '<span class="status-pill good">Quitada</span>') + '</div>' +
    '</div>';
}

export async function advanceInstallments(groupId){
  var g = installmentGroups().filter(function(x){ return x.id === groupId; })[0];
  if (!g || !g.future.length) return;
  var R = g.future.length;
  var counts = [];
  for (var i=R;i>=1;i--) counts.push({id: String(i), label: i === R ? 'Todas as ' + R + ' restantes' : i + ' parcela(s)'});
  function totalFor(n){ return sum(g.future.slice(R - n), function(t){ return t.amount; }); }
  var r = await openModal({
    title: 'Adiantar pagamento',
    body: '<p>“' + escapeHtml(g.name) + '”: faltam ' + R + ' parcela(s) de ' + fmtMoney(g.perInstallment) + ', total de ' + fmtMoney(g.remaining) + '. As últimas parcelas são as adiantadas.</p>' +
      '<div class="field"><label for="advCount">Quantas parcelas quer adiantar?</label><select id="advCount" name="count">' + optionsHtml(counts, String(R)) + '</select></div>' +
      '<p>Valor sem desconto: <strong id="advTotal" class="tabular">' + fmtMoney(g.remaining) + '</strong></p>' +
      '<fieldset class="radio-group"><legend>Teve desconto adiantando o pagamento?</legend>' +
        '<label class="check"><input type="radio" name="disc" value="sim"> Sim</label>' +
        '<label class="check"><input type="radio" name="disc" value="nao" checked> Não</label>' +
      '</fieldset>' +
      '<div class="field" id="advPaidField" hidden><label for="advPaid">Quanto você pagou?</label><span class="money-input"><span>R$</span><input id="advPaid" name="paid" type="number" step="0.01" min="0.01" max="99999999"></span></div>' +
      '<div class="tip-box" id="advTip"><strong>Dica: veja se compensa.</strong> Sem desconto, adiantar não gera economia: o dinheiro sai antes e deixa de render até a data das parcelas. Costuma valer a pena só se você precisa liberar limite do cartão. Se a compra tem juros, peça o abatimento: o Código de Defesa do Consumidor (art. 52, §2º) garante a redução proporcional dos juros para quem antecipa o pagamento.</div>' +
      '<p class="field-hint">O valor pago entra na fatura atual do cartão' + (g.card ? ' ' + escapeHtml(g.card.name) : '') + '.</p>',
    submitLabel: 'Adiantar',
    onOpen: function(modal){
      function sync(){
        var n = Number(qs('#advCount', modal).value);
        qs('#advTotal', modal).textContent = fmtMoney(totalFor(n));
        var yes = qs('input[name=disc][value=sim]', modal).checked;
        qs('#advPaidField', modal).hidden = !yes;
        qs('#advTip', modal).hidden = yes;
      }
      modal.addEventListener('change', sync);
      sync();
    },
    onSubmit: function(form){
      var n = Number(form.count.value);
      var total = money(totalFor(n));
      var yes = form.disc.value === 'sim';
      var paid = yes ? money(form.paid.value) : total;
      if (yes && !(paid > 0)) return {error:'Informe quanto você pagou com o desconto.'};
      if (yes && paid >= total) return {error:'Com desconto, o valor pago precisa ser menor que ' + fmtMoney(total) + '. Se não teve desconto, marque “Não”.'};
      return {n: n, total: total, paid: paid};
    }
  });
  if (!r || !r.n) return;
  var toRemove = g.future.slice(R - r.n);
  for (var j=0;j<toRemove.length;j++){ await Store.remove(k(), 'transactions', toRemove[j].id); }
  var ids = toRemove.map(function(t){ return t.id; });
  State.transactions = State.transactions.filter(function(t){ return ids.indexOf(t.id) < 0; });
  await saveTransactions([{type:'expense', amount: r.paid, category: g.category, categoryLabel: catLabel(g.category, 'expense'), date: todayKey(),
    description: g.name + ' (adiantamento de ' + r.n + ' parcela' + (r.n > 1 ? 's' : '') + ')', paymentMethod:'cartao', cardId: g.cardId,
    installmentAdvance: {group: g.id, count: r.n, original: r.total, discount: money(r.total - r.paid)}, createdAt: Date.now()}]);
  renderAll();
  toast(r.total > r.paid ? 'Adiantamento registrado. Você economizou ' + fmtMoney(r.total - r.paid) + '!' : 'Adiantamento de ' + fmtMoney(r.paid) + ' registrado.');
}
