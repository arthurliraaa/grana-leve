/*
 * Seletor de "Cor e ícone" de cartões e contas: banco (automático pelo nome, da lista ou nenhum),
 * cor e ícone personalizados, com prévia ao vivo. Usado nos formulários de adicionar e editar.
 */
import {BANKS, lookOf, cleanMark, validColor} from '../domain/brands.js';
import {escapeHtml} from './dom.js';

var DEFAULT_COLOR = '#0e6b5c';

// Selo com o ícone na cor do banco (sem cor definida, usa a cor do app pelo CSS).
export function badgeHtml(item, extraClass){
  var l = lookOf(item);
  return '<span class="bank-badge' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true"' +
    (l.color ? ' style="background:' + l.color + ';color:' + l.text + '"' : '') + '>' + escapeHtml(l.mark) + '</span>';
}

export function pickerHtml(p, item){
  item = item || {};
  var custom = validColor(item.color);
  return '<div class="brand-picker" data-picker="' + p + '">' +
    '<div class="field"><label for="' + p + 'Bank">Banco</label><select id="' + p + 'Bank" name="bank">' +
      '<option value="">Automático (pelo nome)</option>' +
      BANKS.map(function(b){ return '<option value="' + b.id + '"' + (item.bank === b.id ? ' selected' : '') + '>' + escapeHtml(b.name) + '</option>'; }).join('') +
      '<option value="none"' + (item.bank === 'none' ? ' selected' : '') + '>Outro / sem banco</option></select></div>' +
    '<div class="field brand-color"><label for="' + p + 'Color">Cor</label><input id="' + p + 'Color" name="color" type="color" value="' + (custom ? item.color : DEFAULT_COLOR) + '"' + (custom ? ' data-custom="1"' : '') + '></div>' +
    '<div class="field"><label for="' + p + 'Mark">Ícone</label><input id="' + p + 'Mark" name="mark" type="text" maxlength="16" placeholder="Ex: Nu, 💳, 🛒" value="' + escapeHtml(item.mark || '') + '"></div>' +
    '<div class="brand-foot"><span class="field-hint" id="' + p + 'Hint" aria-live="polite"></span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-picker-reset>Usar o padrão</button></div>' +
    '</div>';
}

export function readPicker(root, p){
  var color = root.querySelector('#' + p + 'Color');
  return {
    bank: root.querySelector('#' + p + 'Bank').value || null,
    color: color.dataset.custom ? color.value : null,
    mark: cleanMark(root.querySelector('#' + p + 'Mark').value) || null
  };
}

// Liga o seletor: atualiza a prévia (elemento `preview`) conforme o nome, o banco, a cor e o ícone.
export function wirePicker(root, p, nameInput, preview){
  var bank = root.querySelector('#' + p + 'Bank'), color = root.querySelector('#' + p + 'Color');
  var mark = root.querySelector('#' + p + 'Mark'), hint = root.querySelector('#' + p + 'Hint');
  function update(){
    var v = readPicker(root, p);
    v.name = nameInput.value;
    var l = lookOf(v);
    if (!color.dataset.custom) color.value = l.color || DEFAULT_COLOR;
    preview.innerHTML = badgeHtml(v, 'brand-preview');
    hint.textContent = l.auto ? 'Reconhecemos: ' + l.bank.name + '.' : (l.bank ? '' : (v.color || v.mark ? '' : 'Sem banco: usamos a cor do app e as iniciais.'));
  }
  color.addEventListener('input', function(){ color.dataset.custom = '1'; update(); });
  [bank, mark].forEach(function(el){ el.addEventListener('input', update); el.addEventListener('change', update); });
  nameInput.addEventListener('input', update);
  root.querySelector('[data-picker="' + p + '"] [data-picker-reset]').addEventListener('click', function(){ resetPicker(root, p); update(); });
  update();
  return {reset: function(){ resetPicker(root, p); update(); }};
}

function resetPicker(root, p){
  root.querySelector('#' + p + 'Bank').value = '';
  root.querySelector('#' + p + 'Mark').value = '';
  delete root.querySelector('#' + p + 'Color').dataset.custom;
}
