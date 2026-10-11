/*
 * Lançamento por mensagem (chat).
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, formatDateFull} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import * as Cats from '../domain/categories.js';

import {clampInstall} from '../domain/transactions.js';
import {parse as parseMessage} from '../domain/parser.js';

import {Store} from '../data/store.js';
import {validateNewTransaction} from '../domain/validate.js';

import {getPrefs, setPref} from '../data/session.js';
import {qs, escapeHtml, optionsHtml, icon} from './dom.js';
import {openModal} from './modal.js';
import {paymentLabel} from './home-tab.js';
import {track} from './online.js';
import {renderAll, showTab} from './shell.js';
import {State, catLabel, catOptions, expandInstallments, expenseCats, incomeCats, k} from './state.js';
import {saveTransactions} from './tx-edit.js';
import {accountOptions, applyPayment, installStepperHtml, paymentOptions} from './tx-list.js';

/* ---------- Lançamento por mensagem (chat) ---------- */
// O leitor de mensagens (domain/parser.js) é baseado em regras. Por isso nada é salvo direto:
// cada item vira um rascunho editável, com destaque no que foi suposto, e só grava ao confirmar.
// Grava lançamentos vindos de fora do formulário. Hoje: o chat. No futuro: WhatsApp e Open Finance
// (basta o servidor entregar itens no mesmo formato do parser de mensagens (domain/parser.js) e indicar a origem em `source`).
export async function importTransactions(items, source){
  var saved = [];
  for (var i=0;i<items.length;i++){
    var it = items[i];
    var tx = {type: it.type, amount: money(it.amount), category: it.category, categoryLabel: catLabel(it.category, it.type),
      date: it.date || todayKey(), description: it.description || '', paymentMethod: null, source: source, createdAt: Date.now() + i};
    if (validateNewTransaction(Object.assign({}, tx, {paymentMethod: it.type === 'expense' ? (it.paymentMethod || 'conta') : null}))) continue;
    if (it.type === 'expense'){
      tx.paymentMethod = it.paymentMethod || 'conta';
      if (tx.paymentMethod === 'cartao'){
        if (State.cards.length) tx.cardId = State.cards[0].id;
        else tx.paymentMethod = 'conta';
      }
      if (tx.paymentMethod === 'vale' && State.vouchers.length) tx.voucherId = State.vouchers[0].id;
    }
    var list = await saveTransactions(expandInstallments(tx, it.installments || 1));
    saved.push(list[0]);
  }
  renderAll();
  return saved;
}

export function bubble(who, html){ return '<div class="bubble ' + who + '">' + html + '</div>'; }

export function describeSaved(t){
  var cat = catLabel(t.category, t.type, t.categoryLabel);
  var pay = paymentLabel(t);
  var inst = t.installment;
  return '<strong>' + (t.type === 'income' ? 'Ganho' : 'Gasto') + ' de ' + fmtMoney(inst ? inst.totalAmount : t.amount) + (inst ? ' em ' + inst.total + 'x' : '') + '</strong> em ' + escapeHtml(cat) +
    (inst ? ' (' + escapeHtml(inst.baseDescription) + ')' : (t.description && t.description.toLowerCase() !== cat.toLowerCase() ? ' (' + escapeHtml(t.description) + ')' : '')) +
    (pay ? ' · ' + escapeHtml(pay) : '') + (t.date !== todayKey() ? ' · ' + formatDateFull(t.date) : '') +
    ' <button type="button" class="linklike" data-undo-tx="' + escapeHtml(t.id) + '">Desfazer</button>';
}

// Rascunho de um item lido da mensagem, com as escolhas padrão do app.
export function draftFromItem(it){
  var opts = paymentOptions(), pay = opts[0].id;
  if (it.type === 'expense'){
    if (it.paymentMethod === 'cartao' && State.cards.length) pay = 'card:' + State.cards[0].id;
    else if (it.paymentMethod === 'vale') pay = State.vouchers.length ? 'vale:' + State.vouchers[0].id : 'vale';
  }
  var rec = Object.assign({type: true, category: true, payment: true, date: true}, it.recognized || {});
  // Pediu cartão mas não há cartão cadastrado: o pagamento precisa ser conferido.
  if (it.paymentMethod === 'cartao' && !State.cards.length) rec.payment = false;
  return {type: it.type, amount: it.amount, date: it.date || todayKey(), category: it.category, desc: it.description || '',
    pay: pay, acc: State.accounts.length ? State.accounts[0].id : '', install: clampInstall(it.installments || 1), recognized: rec, removed: false};
}

export function draftHtml(pid, i, d){
  var rec = d.recognized, id = 'd' + pid + '_' + i + '_';
  var cats = d.type === 'income' ? incomeCats() : expenseCats();
  var onCard = d.type === 'expense' && d.pay.indexOf('card:') === 0 && d.pay !== 'card:none';
  function flag(ok, text){ return ok ? '' : ' <span class="review-flag">' + text + '</span>'; }
  function cls(ok){ return ok ? '' : ' class="needs-review"'; }
  function field(label, f, control){ return '<div class="field"><label for="' + id + f + '">' + label + '</label>' + control + '</div>'; }
  return '<fieldset class="draft" data-draft="' + i + '">' +
    '<legend class="sr-only">Item ' + (i + 1) + '</legend>' +
    '<div class="draft-head">' +
      '<select id="' + id + 'type" data-f="type" aria-label="Gasto ou ganho"' + cls(rec.type) + '>' + optionsHtml([{id:'expense', label:'Gasto'}, {id:'income', label:'Ganho'}], d.type) + '</select>' +
      '<span class="money-input sm"><span>R$</span><input id="' + id + 'amount" data-f="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + d.amount + '" aria-label="Valor"></span>' +
      '<button type="button" class="tx-del" data-draft-del aria-label="Remover este item" title="Remover">' + icon('trash') + '</button>' +
    '</div>' +
    '<div class="draft-grid">' +
      field('Descrição', 'desc', '<input id="' + id + 'desc" data-f="desc" type="text" maxlength="80" value="' + escapeHtml(d.desc) + '">') +
      field('Categoria' + flag(rec.category, 'não reconheci'), 'category', '<select id="' + id + 'category" data-f="category"' + cls(rec.category) + '>' + optionsHtml(catOptions(cats), d.category) + '</select>') +
      field('Data' + flag(rec.date, d.date === todayKey() ? 'suposto: hoje' : 'confira'), 'date', '<input id="' + id + 'date" data-f="date" type="date" min="1900-01-01" max="3000-12-31" value="' + escapeHtml(d.date) + '"' + cls(rec.date) + '>') +
      (d.type === 'expense' ?
        field('Pagamento' + flag(rec.payment, 'confira'), 'pay', '<select id="' + id + 'pay" data-f="pay"' + cls(rec.payment) + '>' + optionsHtml(paymentOptions(), d.pay) + '</select>') :
        (State.accounts.length ? field('Entrou em', 'acc', '<select id="' + id + 'acc" data-f="acc">' + optionsHtml(accountOptions(), d.acc) + '</select>') : '')) +
      (onCard ? '<div class="field"><label for="' + id + 'install">Parcelas</label>' + installStepperHtml(id + 'install', 'install').replace('<input ', '<input data-f="install" value="' + d.install + '" ').replace(' value="1"', '') + '</div>' : '') +
    '</div>' +
    '<p class="form-error" data-draft-error role="alert"></p>' +
    '</fieldset>';
}

export function previewHtml(pid, drafts){
  var n = drafts.filter(function(d){ return !d.removed; }).length;
  var guessed = drafts.some(function(d){ var r = d.recognized; return !d.removed && (!r.category || !r.payment || !r.date || !r.type); });
  return '<p class="chat-preview-title"><strong>Confira antes de salvar.</strong>' + (guessed ? ' Os campos marcados foram supostos por mim.' : '') + '</p>' +
    drafts.map(function(d, i){ return d.removed ? '' : draftHtml(pid, i, d); }).join('') +
    '<div class="card-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-preview-save>' + (n === 1 ? 'Salvar lançamento' : 'Salvar ' + n + ' lançamentos') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-preview-discard>Descartar</button>' +
    '</div>';
}

// Converte o rascunho em lançamento. Retorna {tx, n} ou {error}.
export function draftToTx(d, i){
  var tx = {type: d.type, amount: money(d.amount), category: d.category, categoryLabel: catLabel(d.category, d.type), date: d.date,
    description: d.desc.trim(), paymentMethod: null, accountId: null, cardId: null, voucherId: null, source: 'chat', createdAt: Date.now() + i};
  if (d.type === 'expense'){
    if (d.pay === 'card:none') return {error: 'Cadastre um cartão em “Contas e cartões” ou escolha outra forma de pagamento.'};
    applyPayment(tx, d.pay);
  } else tx.accountId = d.acc || null;
  var problem = validateNewTransaction(tx);
  if (problem) return {error: problem === 'valor inválido' ? 'Informe um valor maior que zero.' : problem === 'data inválida' ? 'Confira a data.' : 'Confira este item.'};
  return {tx: tx, n: tx.paymentMethod === 'cartao' ? clampInstall(d.install) : 1};
}

export async function openQuickEntry(welcome){
  var first = escapeHtml(State.session.name.split(' ')[0]);
  var closeFn = null, rootEl = null, warned = false;
  var previews = {}, seq = 0;   // previews[pid] = {drafts, state: 'pending' | 'saved' | 'discarded'}
  function log(){ return qs('#chatLog', rootEl || document); }
  function say(who, html){
    var l = log(); if (!l) return null;
    l.insertAdjacentHTML('beforeend', bubble(who, html));
    l.scrollTop = l.scrollHeight;
    return l.lastElementChild;
  }
  function pending(){ return Object.keys(previews).filter(function(pid){ return previews[pid].state === 'pending'; }); }
  function previewEl(pid){ return qs('[data-preview="' + pid + '"]', rootEl); }
  function redraw(pid, focusSel){
    var el = previewEl(pid);
    el.innerHTML = previewHtml(pid, previews[pid].drafts);
    if (focusSel){ var f = qs(focusSel, el); if (f) f.focus(); }
  }
  function handle(text){
    say('me', escapeHtml(text));
    track('usou:chat');
    var r = parseMessage(text);
    if (r.nothing){
      if (pending().length){ say('bot', 'Tudo bem. Ainda faltam os itens acima: salve ou descarte antes de sair.'); return; }
      say('bot', 'Beleza! Então é só usar o Grana Leve à vontade.');
      setTimeout(function(){ if (closeFn) closeFn(true); }, 900);
      return;
    }
    if (r.error){ say('bot', escapeHtml(r.error)); return; }
    var pid = String(++seq);
    previews[pid] = {drafts: r.items.map(draftFromItem), state: 'pending'};
    warned = false;
    var b = say('bot preview', '');
    b.setAttribute('data-preview', pid);
    redraw(pid);
    log().scrollTop = b.offsetTop - log().offsetTop - 8;  // mostra a prévia desde o começo
  }
  async function save(pid){
    var p = previews[pid], el = previewEl(pid), built = [], ok = true;
    p.drafts.forEach(function(d, i){
      if (d.removed) return;
      var r = draftToTx(d, i);
      var err = qs('[data-draft="' + i + '"] [data-draft-error]', el);
      err.textContent = r.error || '';
      if (r.error){ ok = false; return; }
      built.push(r);
    });
    if (!ok || !built.length) return;
    var saved = [];
    for (var j = 0; j < built.length; j++){ var list = await saveTransactions(expandInstallments(built[j].tx, built[j].n)); saved.push(list[0]); }
    p.state = 'saved';
    track('salvou:chat');
    renderAll();
    el.innerHTML = 'Anotei:<ul class="chat-list">' + saved.map(function(t){ return '<li data-chat-tx="' + escapeHtml(t.id) + '">' + describeSaved(t) + '</li>'; }).join('') + '</ul>' +
      '<span class="chat-hint">Mais alguma coisa? Quando terminar, é só fechar.</span>';
    qs('#chatInput', rootEl).focus();
  }
  await openModal({
    title: welcome ? 'Antes de começar…' : 'Chat de lançamento',
    wide: true,
    body: '<div class="chat-log" id="chatLog" aria-live="polite">' +
        bubble('bot', (welcome ? 'Oi, ' + first + '! Teve algum gasto ou ganho desde a última vez?' : 'Me conta o que entrou ou saiu.') +
          '<br><span class="chat-hint">Escreva do seu jeito: “gastei 30 no mercado”, “recebi 1.500 de salário ontem”, “paguei 120 de luz e 80 de internet”. Antes de salvar, eu mostro o que entendi para você conferir.</span>') +
      '</div>' +
      '<div class="chips" id="chatChips">' +
        '<button type="button" class="chip" data-chip-send="Não, nada">Não, nada</button>' +
        '<button type="button" class="chip" data-chip="gastei ">Gastei…</button>' +
        '<button type="button" class="chip" data-chip="recebi ">Recebi…</button>' +
      '</div>' +
      '<input id="chatInput" class="chat-input" name="msg" type="text" maxlength="200" autocomplete="off" placeholder="Ex: gastei 25 no almoço" aria-label="Mensagem">' +
      '<button type="button" class="linklike" data-chat-form style="justify-self:start">Prefiro preencher o formulário completo</button>' +
      (welcome ? '<label class="check"><input type="checkbox" name="off"' + (getPrefs().quickEntryOff ? ' checked' : '') + '> Não perguntar ao entrar</label>' : ''),
    submitLabel: 'Enviar', cancelLabel: welcome ? 'Pular' : 'Fechar',
    // Itens ainda não salvos: avisa uma vez antes de deixar fechar (e descartar).
    beforeClose: function(){
      var n = pending().length;
      if (!n || warned) return true;
      warned = true;
      say('bot', '<strong>Ainda não salvei os itens acima.</strong> Toque em “Salvar” ou “Descartar”. Se fechar de novo, eles serão descartados.');
      return false;
    },
    onOpen: function(root, close){
      closeFn = close; rootEl = root;
      root.addEventListener('click', async function(e){
        var b;
        if ((b = e.target.closest('[data-chip-send]'))){ handle(b.getAttribute('data-chip-send')); return; }
        if (e.target.closest('[data-chat-form]')){ close(null); showTab('lancamentos'); document.getElementById('txAmount').focus(); return; }
        if ((b = e.target.closest('[data-chip]'))){ var inp = qs('#chatInput', root); inp.value = b.getAttribute('data-chip'); inp.focus(); return; }
        var box = e.target.closest('[data-preview]');
        if (box){
          var pid = box.getAttribute('data-preview');
          if (e.target.closest('[data-preview-save]')){ await save(pid); return; }
          if (e.target.closest('[data-preview-discard]')){
            previews[pid].state = 'discarded';
            box.innerHTML = '<span class="chat-hint">Descartado. Nada foi salvo.</span>';
            qs('#chatInput', root).focus();
            return;
          }
          var del = e.target.closest('[data-draft-del]');
          if (del){
            var i = Number(del.closest('[data-draft]').getAttribute('data-draft'));
            previews[pid].drafts[i].removed = true;
            if (!previews[pid].drafts.some(function(d){ return !d.removed; })){ previews[pid].state = 'discarded'; box.innerHTML = '<span class="chat-hint">Todos os itens foram removidos. Nada foi salvo.</span>'; }
            else redraw(pid, '[data-preview-save]');
            return;
          }
        }
        if ((b = e.target.closest('[data-undo-tx]'))){
          var id = b.getAttribute('data-undo-tx');
          await Store.remove(k(), 'transactions', id);
          State.transactions = State.transactions.filter(function(x){ return x.id !== id; });
          renderAll();
          var li = b.closest('[data-chat-tx]');
          li.innerHTML = '<s>' + li.textContent.replace('Desfazer','').trim() + '</s> · desfeito';
        }
      });
      // Edição dos rascunhos: o campo alterado deixa de ser "suposto".
      function onEdit(e){
        var f = e.target.getAttribute && e.target.getAttribute('data-f');
        var row = f && e.target.closest('[data-draft]');
        if (!row) return;
        var pid = row.closest('[data-preview]').getAttribute('data-preview');
        var d = previews[pid].drafts[Number(row.getAttribute('data-draft'))];
        d[f] = e.target.value;
        var recKey = {category:'category', date:'date', pay:'payment', type:'type'}[f];
        // Estudo: o que a pessoa corrigiu no que o leitor entendeu (só o nome do campo).
        if (e.type === 'change' && !d['tracked_' + f]){
          d['tracked_' + f] = true;
          track('corrigiu:chat', {type:'type', amount:'amount', category:'category', date:'date', pay:'payment', desc:'description'}[f]);
        }
        if (recKey && e.type === 'change'){ d.recognized[recKey] = true; e.target.classList.remove('needs-review'); var flagEl = row.querySelector('label[for="' + e.target.id + '"] .review-flag'); if (flagEl) flagEl.remove(); }
        if (e.type === 'change' && (f === 'type' || f === 'pay')){
          if (f === 'type'){ d.category = Cats.FALLBACK_CATEGORY[d.type]; d.recognized.category = false; }
          redraw(pid, '[data-draft="' + row.getAttribute('data-draft') + '"] [data-f="' + f + '"]');
        }
      }
      root.addEventListener('input', onEdit);
      root.addEventListener('change', onEdit);
      var off = root.querySelector('input[name=off]');
      if (off) off.addEventListener('change', function(){ setPref('quickEntryOff', off.checked); });
    },
    onSubmit: function(form){
      var text = form.msg.value.trim();
      form.msg.value = '';
      if (text) handle(text);
      form.msg.focus();
      return {keepOpen: true};
    }
  });
}

// Ao entrar no app, pergunta uma vez por dia (dá para desligar no próprio chat).
// Só logo depois de entrar na conta (login, cadastro ou link do e-mail): recarregar a página ou
// reabrir o app com a conta já aberta não pergunta de novo.
export function maybeWelcome(){
  var p = getPrefs(), fresh = State.freshLogin;
  State.freshLogin = false;
  if (p.quickEntryOff || !fresh) return;
  setTimeout(function(){ if (State.session && document.getElementById('modalRoot').hidden) openQuickEntry(true); }, 350);
}
