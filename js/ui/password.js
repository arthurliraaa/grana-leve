// Lista de regras da senha que muda enquanto a pessoa digita: vermelho com ✗ até cumprir,
// verde com ✓ depois. Usada no cadastro, na troca de senha do perfil e na tela de nova senha.
import {PASSWORD_RULES} from '../data/auth.js';
import {escapeHtml} from './dom.js';

export function passwordRulesHtml(id){
  return '<ul class="pw-rules" id="' + id + '">' + PASSWORD_RULES.map(function(r){
    return '<li data-rule="' + r.id + '" class="bad"><span class="pw-mark" aria-hidden="true">✗</span>' + escapeHtml(r.label) +
      '<span class="sr-only pw-state">: falta</span></li>';
  }).join('') + '</ul>';
}
export function updatePasswordRules(list, pw){
  PASSWORD_RULES.forEach(function(r){
    var li = list.querySelector('[data-rule="' + r.id + '"]');
    var ok = r.test(pw);
    li.classList.toggle('ok', ok);
    li.classList.toggle('bad', !ok);
    li.querySelector('.pw-mark').textContent = ok ? '✓' : '✗';
    li.querySelector('.pw-state').textContent = ok ? ': ok' : ': falta';
  });
}
// Liga o campo à lista (e a lista ao campo, para o leitor de tela ler as regras junto).
export function wirePasswordRules(input, list){
  input.setAttribute('aria-describedby', list.id);
  var update = function(){ updatePasswordRules(list, input.value); };
  input.addEventListener('input', update);
  update();
}
