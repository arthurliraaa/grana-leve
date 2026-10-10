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
export function setThemePref(v){
  try{ if (v === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch(e){}
  if (v === 'system') document.documentElement.removeAttribute('data-theme');
  applyTheme(v === 'system' ? null : v);
  if (State.session) renderAll();
}
export function toggleTheme(){
  var next = currentTheme() === 'dark' ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); } catch(e){}
  applyTheme(next);
  if (State.session) renderAll();
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
