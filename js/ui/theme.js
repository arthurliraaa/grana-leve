/*
 * Tema claro, escuro ou automático.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */

import {icon} from './dom.js';
import {renderAll} from './shell.js';
import {State} from './state.js';

/* ============ Tema claro/escuro ============ */
export var THEME_KEY = 'granaleve_theme';
export function currentTheme(){
  var t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(t){
  if (t) document.documentElement.setAttribute('data-theme', t);
  var btn = document.getElementById('themeToggle');
  var isDark = currentTheme() === 'dark';
  btn.innerHTML = icon(isDark ? 'sun' : 'moon');
  btn.setAttribute('aria-label', isDark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
  btn.title = isDark ? 'Modo claro' : 'Modo escuro';
}
// 'system' segue o aparelho; 'light' e 'dark' ficam fixos.
export function themePref(){
  var saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); } catch(e){}
  return saved === 'dark' || saved === 'light' ? saved : 'system';
}
// Centro de um elemento (de onde a troca de tema se espalha); sem elemento, o meio da tela.
function centerOf(el){
  if (el && el.getBoundingClientRect){ var r = el.getBoundingClientRect(); if (r.width || r.height) return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }
  return {x: window.innerWidth / 2, y: window.innerHeight / 2};
}
// Troca de tema com animação: o tema novo nasce do botão em que se tocou e se espalha em círculo por toda a tela (View Transitions).
// Sem esse recurso do navegador, as cores esmaecem aos poucos; com “reduzir movimento” ligado, troca na hora.
function smoothly(apply, originEl){
  var root = document.documentElement;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ apply(); return; }
  if (document.startViewTransition){
    var o = centerOf(originEl), radius = Math.hypot(Math.max(o.x, window.innerWidth - o.x), Math.max(o.y, window.innerHeight - o.y));
    root.classList.add('theme-vt');
    var t = document.startViewTransition(apply);
    t.ready.then(function(){
      root.animate({clipPath: ['circle(0px at ' + o.x + 'px ' + o.y + 'px)', 'circle(' + radius + 'px at ' + o.x + 'px ' + o.y + 'px)']},
        {duration: 750, easing: 'cubic-bezier(.45,.05,.2,1)', pseudoElement: '::view-transition-new(root)'});
    }, function(){});
    t.finished.then(function(){ root.classList.remove('theme-vt'); }, function(){ root.classList.remove('theme-vt'); });
    return;
  }
  root.classList.add('theme-fade');
  apply();
  setTimeout(function(){ root.classList.remove('theme-fade'); }, 700);
}
export function setThemePref(v, originEl){
  try{ if (v === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch(e){}
  smoothly(function(){
    if (v === 'system') document.documentElement.removeAttribute('data-theme');
    applyTheme(v === 'system' ? null : v);
    if (State.session) renderAll();
  }, originEl);
}
export function toggleTheme(e){
  var next = currentTheme() === 'dark' ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); } catch(e){}
  var btn = document.getElementById('themeToggle');
  smoothly(function(){ applyTheme(next); if (State.session) renderAll(); }, btn);
  // O ícone gira junto (sol e lua trocam de lugar).
  btn.classList.remove('theme-spin'); void btn.offsetWidth; btn.classList.add('theme-spin');
  setTimeout(function(){ btn.classList.remove('theme-spin'); }, 700);
}

// Aplica o tema salvo e liga o botão de tema.
export function wireTheme(){
  (function initTheme(){
    var saved = null;
    try{ saved = localStorage.getItem(THEME_KEY); } catch(e){}
    applyTheme(saved === 'dark' || saved === 'light' ? saved : null);
  })();
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}
