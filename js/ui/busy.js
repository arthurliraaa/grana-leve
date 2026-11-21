/*
 * Toque repetido não grava duas vezes. Com internet lenta, quem toca em “Salvar” e não vê nada acontecer toca de novo, e cada toque gravava
 * um lançamento. Duas travas, no documento inteiro:
 *   1. Formulário: enquanto um envio não terminou, outro envio do mesmo formulário é ignorado e o botão mostra que está salvando.
 *      Termina quando passam ~150 ms e não há gravação em andamento (Store.inflight), no máximo em 12 s.
 *   2. Botão: tocar de novo no mesmo botão em menos de ~1 s, com uma gravação em andamento, é ignorado (cobre “Salvar” do chat, “Recebi”…).
 */
import {Store} from '../data/store.js';

var MIN_MS = 150, MAX_MS = 12000;

function submitButtons(form){ return Array.prototype.slice.call(form.querySelectorAll('button[type=submit], input[type=submit]')); }
function lock(form){
  var t0 = Date.now(), btns = submitButtons(form);
  form.__busy = true;
  btns.forEach(function(b){ b.classList.add('is-busy'); b.setAttribute('aria-busy', 'true'); b.__wasDisabled = b.disabled; b.disabled = true; });
  var iv = setInterval(function(){
    var waited = Date.now() - t0;
    if ((waited > MIN_MS && !(Store.inflight > 0)) || waited > MAX_MS){
      clearInterval(iv);
      form.__busy = false;
      btns.forEach(function(b){ b.classList.remove('is-busy'); b.removeAttribute('aria-busy'); if (document.contains(b)) b.disabled = !!b.__wasDisabled; });
    }
  }, 50);
}

export function wireBusyGuard(){
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.__busy){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    lock(form);
  }, true);

  var last = {el: null, t: 0};
  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('button, [role=button]');
    if (!el || el.closest('.bottomnav, .sidenav')) return;
    var now = Date.now();
    if (el === last.el && now - last.t < 1000 && Store.inflight > 0){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    last = {el: el, t: now};
  }, true);
}
