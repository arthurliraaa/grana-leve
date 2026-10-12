/*
 * Campos de dinheiro (inputs com data-money). São campos de texto com teclado numérico: o campo
 * type="number" do navegador lê "1.500" como 1,5 (o ponto vira vírgula decimal), e quem digita no
 * jeito brasileiro perdia o valor sem perceber.
 *
 * O texto digitado é lido por parseMoneyText ("1.500,00" -> "1500.00"), então o resto do app
 * continua usando Number(campo.value) como antes. Ao gravar um número no campo (editar um
 * lançamento, por exemplo), ele aparece formatado ("1.500,00"); ao sair do campo, também.
 */
import {parseMoneyText, formatMoneyInput} from '../domain/money.js';

var native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function isMoney(el){ return el.hasAttribute('data-money'); }

export function installMoneyInputs(){
  if (HTMLInputElement.prototype.__moneyInputs) return;
  Object.defineProperty(HTMLInputElement.prototype, '__moneyInputs', {value: true});
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    configurable: true, enumerable: native.enumerable,
    get: function(){
      var v = native.get.call(this);
      if (!isMoney(this)) return v;
      var n = parseMoneyText(v);
      // Número sem zeros sobrando ("1500", "32.5"), como o campo de número devolvia. Texto que não é
      // valor conta como vazio (o formulário pede o valor).
      return n === 'NaN' || n === '' ? '' : String(Number(n));
    },
    set: function(v){ native.set.call(this, isMoney(this) ? formatMoneyInput(v) : v); }
  });
  // Ao sair do campo, mostra o valor no formato brasileiro (só se der para entender o que foi digitado).
  document.addEventListener('focusout', function(e){
    var el = e.target;
    if (!(el instanceof HTMLInputElement) || !isMoney(el)) return;
    var v = parseMoneyText(native.get.call(el));
    var bad = v === 'NaN';
    el.classList.toggle('is-invalid', bad);
    el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    el.title = bad ? 'Valor não reconhecido. Use números, por exemplo 1.500,00' : '';
    if (v !== '' && !bad) native.set.call(el, formatMoneyInput(v));
  });
  // Campos criados com value="1500.5" (popups de edição) já aparecem como "1.500,50".
  function tidy(root){
    var list = root.matches && root.matches('input[data-money]') ? [root] : root.querySelectorAll ? root.querySelectorAll('input[data-money]') : [];
    Array.prototype.forEach.call(list, function(el){
      var v = parseMoneyText(native.get.call(el));
      if (v !== '' && v !== 'NaN') native.set.call(el, formatMoneyInput(v));
    });
  }
  tidy(document);
  new MutationObserver(function(records){
    records.forEach(function(r){ Array.prototype.forEach.call(r.addedNodes, function(n){ if (n.nodeType === 1) tidy(n); }); });
  }).observe(document.body, {childList: true, subtree: true});
  // Só deixa digitar números, vírgula, ponto, sinal de menos e "R$".
  document.addEventListener('beforeinput', function(e){
    var el = e.target;
    if (!(el instanceof HTMLInputElement) || !isMoney(el) || !e.data) return;
    if (!/^[\d.,\s\-R$r]+$/.test(e.data)) e.preventDefault();
  });
}
// Texto exatamente como a pessoa digitou (para mensagens e testes).
export function rawMoneyText(el){ return native.get.call(el); }
