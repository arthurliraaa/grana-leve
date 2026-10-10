// Popups (modal), confirmação de exclusão, pedido de valor e contador de caracteres.
import {qsa, escapeHtml} from './dom.js';
import {getPrefs, setPref} from '../data/session.js';
import {money, fmtMoney} from '../domain/money.js';

// opts: {title, body, submitLabel, cancelLabel, danger, wide, onOpen(root, close), onSubmit(form) -> valor | {error},
//        beforeClose() -> false para impedir que a pessoa feche (X, Cancelar, fundo ou Esc)}
export function openModal(opts){
  return new Promise(function(resolve){
    var root = document.getElementById('modalRoot');
    var prevFocus = document.activeElement;
    var submitLabel = opts.submitLabel === undefined ? 'Salvar' : opts.submitLabel;
    var cancelLabel = opts.cancelLabel === undefined ? 'Cancelar' : opts.cancelLabel;
    root.innerHTML =
      '<div class="modal-backdrop" data-modal-close></div>' +
      '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
        '<div class="modal-head"><h3 id="modalTitle">' + escapeHtml(opts.title) + '</h3>' +
        '<button type="button" class="modal-x" data-modal-close aria-label="Fechar">×</button></div>' +
        '<form class="modal-body" novalidate>' + (opts.body || '') +
          '<p class="form-error" data-modal-error role="alert"></p>' +
          '<div class="modal-actions">' +
            (cancelLabel ? '<button type="button" class="btn btn-ghost" data-modal-close>' + escapeHtml(cancelLabel) + '</button>' : '') +
            (submitLabel ? '<button type="submit" class="btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary') + '">' + escapeHtml(submitLabel) + '</button>' : '') +
          '</div>' +
        '</form>' +
      '</div>';
    root.hidden = false;
    document.body.classList.add('modal-open');
    // O resto da página fica inerte: o Tab não sai do popup e o leitor de tela não lê o fundo.
    var behind = qsa('body > *').filter(function(el){ return el !== root && el.id !== 'toastWrap' && !el.hasAttribute('inert'); });
    behind.forEach(function(el){ el.setAttribute('inert', ''); });
    var form = root.querySelector('form');
    var done = false;
    function close(val){
      if (done) return; done = true;
      root.hidden = true; root.innerHTML = '';
      document.body.classList.remove('modal-open');
      behind.forEach(function(el){ el.removeAttribute('inert'); });
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(val);
    }
    // Fechamento pedido pela pessoa; o código chama close() direto.
    function requestClose(){ if (opts.beforeClose && opts.beforeClose() === false) return; close(null); }
    function onKey(e){ if (e.key === 'Escape') requestClose(); }
    document.addEventListener('keydown', onKey);
    qsa('[data-modal-close]', root).forEach(function(el){ el.addEventListener('click', requestClose); });
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var err = form.querySelector('[data-modal-error]');
      err.textContent = '';
      if (!opts.onSubmit){ close(true); return; }
      try{
        var r = await opts.onSubmit(form);
        if (r && r.error){ err.textContent = r.error; return; }
        if (r && r.keepOpen) return;
        close(r === undefined ? true : r);
      } catch(ex){ err.textContent = (ex && ex.userMessage) || 'Algo deu errado. Tente novamente.'; }
    });
    // Os ouvintes vão no elemento .modal, que é recriado a cada abertura (o #modalRoot é reaproveitado).
    attachCounters(root);
    if (opts.onOpen) opts.onOpen(root.querySelector('.modal'), close);
    // Em confirmações de exclusão o foco começa no “Cancelar”, para um Enter acidental não apagar nada.
    var first = opts.danger ? form.querySelector('.modal-actions [data-modal-close]') : form.querySelector('input:not([type=checkbox]), select, textarea, button[type=submit]');
    if (first) first.focus();
  });
}

// Confirmação antes de excluir. Com skipKey, oferece “Não perguntar novamente”.
export async function confirmAction(opts){
  if (opts.skipKey && (getPrefs().skipConfirm || {})[opts.skipKey]) return true;
  var ok = await openModal({
    title: opts.title || 'Tem certeza?',
    body: '<p>' + escapeHtml(opts.message) + '</p>' +
      (opts.skipKey ? '<label class="check"><input type="checkbox" name="skip"> Não perguntar novamente</label>' : ''),
    submitLabel: opts.confirmLabel || 'Excluir',
    danger: opts.danger !== false,
    onSubmit: function(form){
      if (opts.skipKey && form.skip && form.skip.checked){
        var sc = getPrefs().skipConfirm || {};
        sc[opts.skipKey] = true;
        setPref('skipConfirm', sc);
      }
      return true;
    }
  });
  return ok === true;
}

// Pede um valor em reais. Retorna o número ou null.
export async function askAmount(opts){
  var r = await openModal({
    title: opts.title,
    body: (opts.message ? '<p>' + escapeHtml(opts.message) + '</p>' : '') +
      '<div class="field"><label for="askAmount">' + escapeHtml(opts.label || 'Valor') + '</label>' +
      '<span class="money-input"><span>R$</span><input id="askAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + (opts.value ? money(opts.value) : '') + '"></span></div>' +
      (opts.checkbox ? '<label class="check"><input type="checkbox" name="extra"' + (opts.checkboxDefault ? ' checked' : '') + '> ' + escapeHtml(opts.checkbox) + '</label>' : '') +
      (opts.extraHtml || ''),
    submitLabel: opts.submitLabel || 'Confirmar',
    onSubmit: function(form){
      var v = money(form.amount.value);
      if (!(v > 0)) return {error:'Informe um valor maior que zero.'};
      if (opts.max && v > opts.max + 0.001) return {error:'O valor não pode passar de ' + fmtMoney(opts.max) + '.'};
      return {amount: v, extra: !!(form.extra && form.extra.checked), accountId: form.acc ? (form.acc.value || null) : null};
    }
  });
  return r && r.amount ? r : null;
}

/* ============ Contador de caracteres ============ */
function counterText(el){ var left = Number(el.maxLength) - el.value.length; return left + (left === 1 ? ' caractere restante' : ' caracteres restantes'); }
export function attachCounters(root){
  qsa('textarea[maxlength]', root || document).forEach(function(el){
    if (el.getAttribute('data-counted')) return;
    el.setAttribute('data-counted', '1');
    var span = document.createElement('span');
    span.className = 'field-hint char-count';
    span.setAttribute('aria-live', 'polite');
    span.textContent = counterText(el);
    el.insertAdjacentElement('afterend', span);
  });
}
document.addEventListener('input', function(e){
  var el = e.target;
  if (el.tagName === 'TEXTAREA' && el.getAttribute('data-counted')){
    var span = el.nextElementSibling;
    if (span && span.classList.contains('char-count')){
      span.textContent = counterText(el);
      span.classList.toggle('low', Number(el.maxLength) - el.value.length <= 20);
    }
  }
});
// Ao limpar um formulário (reset), o contador volta ao máximo.
document.addEventListener('reset', function(e){
  setTimeout(function(){ qsa('textarea[data-counted]', e.target).forEach(function(el){ el.nextElementSibling.textContent = counterText(el); el.nextElementSibling.classList.remove('low'); }); }, 0);
});
