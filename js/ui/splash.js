/*
 * Tela de carregamento do Grana Leve: o Grana pulando, o nome e uns pontinhos. Aparece quando a página abre (o HTML já traz uma
 * pronta em #splash, para pintar antes de qualquer JavaScript) e rapidinho quando a pessoa entra na conta (enquanto os dados
 * carregam). Some com um esmaecer suave. Para quem pede menos movimento ela nem aparece (CSS) e some na hora.
 * Trava de segurança no CSS: se o JavaScript falhar, ela se esconde sozinha em 15 s.
 */
import {mascotSvg} from './mascot-art.js';

var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
var shownAt = 0;   // 0 = desde que a página abriu (a tela do HTML)

export function splashHtml(msg, svg){
  return '<div class="splash-in"><div class="splash-mascot">' + (svg || mascotSvg('wave')) + '</div>' +
    '<div class="splash-brand">grana <b>leve</b></div><p class="splash-msg" id="splashMsg">' + msg + '</p>' +
    '<div class="splash-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>';
}
function leave(el){
  if (!el || !el.isConnected) return;
  if (reduce){ el.remove(); return; }
  el.classList.add('is-leaving');
  setTimeout(function(){ el.remove(); }, 420);
}

// Mostra a tela de carregamento (de novo) com a mensagem.
export function showSplash(msg){
  if (reduce) return;
  var el = document.getElementById('splash');
  if (!el){
    el = document.createElement('div'); el.id = 'splash'; el.className = 'splash'; el.setAttribute('role', 'status');
    el.innerHTML = splashHtml(msg); document.body.appendChild(el);
  } else {
    el.classList.remove('is-leaving');
    var m = el.querySelector('.splash-msg'); if (m) m.textContent = msg;
  }
  shownAt = performance.now();
}
// Esconde depois de pelo menos minMs desde que apareceu (para a animação não piscar). Pode ser chamada de novo sem problema.
export function hideSplash(minMs){
  var el = document.getElementById('splash');
  if (!el) return;
  var wait = reduce ? 0 : Math.max(0, (minMs || 0) - (performance.now() - shownAt));
  clearTimeout(el._hideT);
  el._hideT = setTimeout(function(){ leave(el); }, wait);
}
// Primeira abertura da sessão: um pouquinho mais de tempo para a animação ser vista; nas seguintes, só o necessário.
export function firstLoadMin(){
  try { var first = !sessionStorage.getItem('gl_splash'); sessionStorage.setItem('gl_splash', '1'); return first ? 800 : 250; } catch(e){ return 400; }
}
