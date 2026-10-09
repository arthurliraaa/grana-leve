// Dicas (tooltip) dos gráficos SVG, com mouse e teclado.
import {qsa} from './dom.js';

export function wireTooltips(wrap, selector){
  var tip = null;
  function hide(){ if (tip){ tip.remove(); tip = null; } }
  qsa(selector, wrap).forEach(function(seg){
    var text = seg.getAttribute('data-label') + ': ' + seg.getAttribute('data-value');
    seg.addEventListener('mouseenter', function(e){ hide(); tip = showChartTip(wrap, e.clientX, e.clientY, text); });
    seg.addEventListener('mousemove', function(e){ if (tip) positionTip(wrap, tip, e.clientX, e.clientY); });
    seg.addEventListener('mouseleave', hide);
    seg.addEventListener('focus', function(){ hide(); tip = showChartTip(wrap, null, null, text, seg); });
    seg.addEventListener('blur', hide);
  });
}
function showChartTip(wrap, clientX, clientY, text, refEl){
  var tip = document.createElement('div');
  tip.className = 'chart-tooltip';
  tip.textContent = text;
  wrap.appendChild(tip);
  if (refEl){
    var r = refEl.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.style.left = (r.left - w.left + r.width/2) + 'px';
    tip.style.top = (r.top - w.top) + 'px';
  } else {
    positionTip(wrap, tip, clientX, clientY);
  }
  return tip;
}
function positionTip(wrap, tip, clientX, clientY){
  var w = wrap.getBoundingClientRect();
  tip.style.left = (clientX - w.left) + 'px';
  tip.style.top = (clientY - w.top) + 'px';
}
