/*
 * Captcha (Cloudflare Turnstile) para cadastro, login, "Esqueci minha senha" e conferência de senha.
 * Só carrega se houver TURNSTILE_SITE_KEY em js/config.js.
 *
 * Visível: nos formulários de entrar e de criar conta, o widget aparece acima do botão (área
 * [data-captcha]) assim que a tela abre; normalmente a Cloudflare confirma sozinha e mostra um ✓.
 * Nas outras ações (sem formulário de login na tela), ele aparece numa caixa no rodapé.
 * Cada token vale uma vez (e por até 5 minutos): depois de usado, o widget se renova.
 */
import {TURNSTILE_SITE_KEY} from '../config.js';

var SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
var loading = null, box = null;
var mounted = null;   // widget do formulário: {slot, id, token, at, waiters}
var FRESH_MS = 4 * 60 * 1000;

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
// Erros do Turnstile com explicação (códigos em developers.cloudflare.com/turnstile/troubleshooting).
export function captchaError(code){
  var c = String(code || '');
  var msg = /^1102/.test(c) ? 'A verificação contra robôs não está liberada para este endereço. Quem cuida do app precisa incluir este domínio no Cloudflare Turnstile.' :
    /^(300|600)/.test(c) ? 'A verificação contra robôs desconfiou deste navegador. Recarregue a página e tente de novo.' :
    'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.';
  return Object.assign(new Error('captcha ' + c), {captchaCode: c, userMessage: msg});
}
function settle(w, err, token){ var list = w.waiters; w.waiters = []; list.forEach(function(x){ if (err) x.reject(err); else x.resolve(token); }); }

// A área do captcha está num formulário visível? (ela mesma começa escondida até ser montada)
function visible(slot){ return !(slot.parentElement && slot.parentElement.closest('[hidden]')); }
export function captchaEnabled(siteKey){ return !!(siteKey === undefined ? TURNSTILE_SITE_KEY : siteKey); }

// Mostra o widget no formulário visível (entrar ou criar conta). Chamado ao abrir essas telas.
export async function mountCaptcha(){
  if (!TURNSTILE_SITE_KEY) return;
  var slot = Array.prototype.filter.call(document.querySelectorAll('[data-captcha]'), visible)[0];
  if (!slot) return;
  slot.hidden = false;
  if (mounted && mounted.slot === slot) return;
  try { await load(); } catch(e){ slot.textContent = 'Não foi possível carregar a verificação. Verifique a internet.'; return; }
  if (mounted){ try { window.turnstile.remove(mounted.id); } catch(e){ /* já removido */ } settle(mounted, new Error('captcha trocado')); }
  var w = {slot: slot, token: null, at: 0, waiters: [], error: null};
  w.id = window.turnstile.render(slot, {
    sitekey: TURNSTILE_SITE_KEY, appearance: 'always', language: 'pt-br', theme: 'auto', size: 'flexible',
    callback: function(token){ w.token = token; w.at = Date.now(); w.error = null; settle(w, null, token); },
    'expired-callback': function(){ w.token = null; },
    'error-callback': function(code){ w.token = null; w.error = captchaError(code); settle(w, w.error); }
  });
  mounted = w;
}

// Token para uma ação de login. Usa o widget do formulário se ele estiver na tela; senão, a caixa.
export async function getCaptchaToken(siteKey){
  if (siteKey === undefined && mounted && visible(mounted.slot) && document.body.contains(mounted.slot)){
    var w = mounted, token;
    if (w.error && !w.token) throw w.error;   // o widget falhou: avisa na hora em vez de esperar
    if (w.token && Date.now() - w.at < FRESH_MS) token = w.token;
    else token = await new Promise(function(resolve, reject){ w.waiters.push({resolve: resolve, reject: reject}); setTimeout(function(){ reject(new Error('captcha demorou')); }, 120000); });
    // Cada token vale uma vez: renova o widget para a próxima tentativa (ex.: senha errada).
    w.token = null;
    setTimeout(function(){ try { window.turnstile.reset(w.id); } catch(e){ /* removido */ } }, 0);
    return token;
  }
  return boxToken(siteKey === undefined ? TURNSTILE_SITE_KEY : siteKey);
}

// Caixa no rodapé para ações fora dos formulários de login (nova senha, conferir senha, painel adm).
var boxId = null;
async function boxToken(siteKey){
  if (!siteKey) return undefined;
  await load();
  if (!box){
    box = document.createElement('div');
    box.className = 'captcha-box';
    box.innerHTML = '<p>Confirme que você não é um robô:</p><div class="captcha-slot"></div>';
    document.body.appendChild(box);
  }
  box.classList.add('show');
  return new Promise(function(resolve, reject){
    var done = false;
    function finish(fn, v){ if (done) return; done = true; setTimeout(function(){ box.classList.remove('show'); }, 600); fn(v); }
    if (boxId !== null){ try { window.turnstile.remove(boxId); } catch(e){ /* já removido */ } }
    boxId = window.turnstile.render(box.querySelector('.captcha-slot'), {
      sitekey: siteKey, appearance: 'always', language: 'pt-br', theme: 'auto',
      callback: function(token){ finish(resolve, token); },
      'error-callback': function(code){ finish(reject, captchaError(code)); },
      'timeout-callback': function(){ finish(reject, new Error('captcha expirou')); }
    });
    setTimeout(function(){ finish(reject, new Error('captcha demorou')); }, 120000);
  });
}
