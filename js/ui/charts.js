// Dicas (tooltip) dos gráficos, com mouse, teclado e toque.
// Cada elemento traz data-label + data-value ("Alimentação: R$ 10,00") ou data-tip, com linhas
// separadas por "||" (a primeira é o título; as demais, os valores).
import {qsa} from './dom.js';

function linesOf(el){
  var tip = el.getAttribute('data-tip');
  if (tip) return tip.split('||');
  return [el.getAttribute('data-label'), el.getAttribute('data-value')];
}
export function wireTooltips(wrap, selector){
  var tip = null, timer = null;
  function hide(){ clearTimeout(timer); if (tip){ tip.remove(); tip = null; } }
  function show(el, x, y){
    hide();
    var lines = linesOf(el);
    tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.setAttribute('role', 'tooltip');
    lines.forEach(function(l, i){
      var s = document.createElement(i === 0 ? 'strong' : 'span');
      s.textContent = l;
      tip.appendChild(s);
    });
    wrap.appendChild(tip);
    place(tip, x, y, el);
  }
  qsa(selector, wrap).forEach(function(seg){
    seg.addEventListener('mouseenter', function(e){ show(seg, e.clientX, e.clientY); });
    seg.addEventListener('mousemove', function(e){ if (tip) place(tip, e.clientX, e.clientY, seg); else show(seg, e.clientX, e.clientY); });
    seg.addEventListener('mouseleave', hide);
    // Elemento que abre um detalhe ao tocar/clicar (data-open-detail) não precisa de dica no toque nem no foco:
    // o popup já mostra tudo. No computador a dica continua ao passar o mouse.
    var opens = !!seg.closest('[data-open-detail]');
    seg.addEventListener('click', hide);
    if (opens) return;
    seg.addEventListener('focus', function(){ show(seg, null, null); });
    seg.addEventListener('blur', hide);
    // Toque: mostra por alguns segundos (no celular não existe "passar o mouse").
    seg.addEventListener('touchstart', function(){ show(seg, null, null); timer = setTimeout(hide, 3200); }, {passive: true});
  });
}
// Fica logo acima do ponteiro (ou do elemento, no teclado), sem sair da tela e sem depender de qual
// elemento é a referência de posição: a conta usa o próprio pai posicionado da dica.
function place(tip, clientX, clientY, el){
  var x = clientX, y = clientY;
  if (x === null || x === undefined){ var r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  var w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth;
  var left = Math.max(8, Math.min(x - w / 2, vw - w - 8));
  var top = y - h - 14;
  if (top < 8) top = y + 18;   // sem espaço em cima: vai para baixo do ponteiro
  var op = tip.offsetParent || document.body, o = op.getBoundingClientRect();
  tip.style.left = (left - o.left - op.clientLeft + op.scrollLeft) + 'px';
  tip.style.top = (top - o.top - op.clientTop + op.scrollTop) + 'px';
}
