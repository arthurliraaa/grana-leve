/*
 * Página inicial (antes de entrar): os blocos surgem ao rolar e os números da pesquisa contam até
 * o valor quando aparecem. Sem JavaScript ou para quem pede menos movimento, tudo já aparece pronto.
 */
var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function countUp(el){
  var target = Number(el.getAttribute('data-count')), suffix = el.textContent.replace(/[\d.,\s]/g, '');
  if (reduce || !isFinite(target)) return;
  var start = null, dur = 1200;
  function step(ts){
    if (start === null) start = ts;
    var p = Math.min(1, (ts - start) / dur), eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  el.textContent = '0' + suffix;
  requestAnimationFrame(step);
}

export function initLanding(){
  var root = document.getElementById('viewLanding');
  if (!root) return;
  var items = Array.prototype.slice.call(root.querySelectorAll('[data-reveal]'));
  var counters = Array.prototype.slice.call(root.querySelectorAll('[data-count]'));
  if (reduce || typeof IntersectionObserver !== 'function') return;   // aparece tudo, sem animar
  document.documentElement.classList.add('js-reveal');
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
      Array.prototype.forEach.call(e.target.querySelectorAll('[data-count]'), function(c){ if (counters.indexOf(c) >= 0) countUp(c); });
    });
  }, {rootMargin: '0px 0px -8% 0px', threshold: 0.12});
  items.forEach(function(el){ io.observe(el); });
}
