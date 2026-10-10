/*
 * Captcha (Cloudflare Turnstile) para cadastro, login e "Esqueci minha senha". Só carrega se houver
 * TURNSTILE_SITE_KEY em js/config.js. O widget fica invisível e só aparece se a Cloudflare precisar
 * de uma confirmação; cada ação pede um token novo (cada token vale uma vez).
 */
import {TURNSTILE_SITE_KEY} from '../config.js';

var SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
var loading = null, widgetId = null, box = null;

function load(){
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = SCRIPT; s.async = true;
    s.onload = resolve;
    s.onerror = function(){ loading = null; reject(new Error('captcha indisponível')); };
    document.head.appendChild(s);
  });
  return loading;
}
function ensureBox(){
  if (box) return box;
  box = document.createElement('div');
  box.className = 'captcha-box';
  box.innerHTML = '<p>Confirme que você não é um robô:</p><div class="captcha-slot"></div>';
  document.body.appendChild(box);
  return box;
}

export function captchaEnabled(siteKey){ return !!(siteKey === undefined ? TURNSTILE_SITE_KEY : siteKey); }

export async function getCaptchaToken(siteKey){
  siteKey = siteKey === undefined ? TURNSTILE_SITE_KEY : siteKey;
  if (!siteKey) return undefined;
  await load();
  var b = ensureBox();
  return new Promise(function(resolve, reject){
    var done = false;
    function finish(fn, v){ if (done) return; done = true; b.classList.remove('show'); fn(v); }
    if (widgetId !== null){ try { window.turnstile.remove(widgetId); } catch(e){ /* já removido */ } }
    widgetId = window.turnstile.render(b.querySelector('.captcha-slot'), {
      sitekey: siteKey, appearance: 'interaction-only', language: 'pt-br', theme: 'auto',
      callback: function(token){ finish(resolve, token); },
      'before-interactive-callback': function(){ b.classList.add('show'); },
      'error-callback': function(){ finish(reject, new Error('captcha falhou')); },
      'timeout-callback': function(){ finish(reject, new Error('captcha expirou')); }
    });
    setTimeout(function(){ finish(reject, new Error('captcha demorou')); }, 90000);
  });
}
