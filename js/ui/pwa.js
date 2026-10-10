/*
 * App instalável (PWA).
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */

import {renderConnections} from './learn-tab.js';
import {State} from './state.js';

/* ============ App instalável (PWA) ============ */
// Pedido de instalação guardado pelo navegador (beforeinstallprompt) fica em State.installPrompt.
export function isStandalone(){ return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches; }

// Instalação do app e service worker (modo offline).
export function wirePwa(){
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    State.installPrompt = e;
    if (State.session) renderConnections();
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }
}
