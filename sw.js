/*
 * Service worker do Grana Leve: permite abrir o app sem internet.
 * Estratégia "rede primeiro": com internet, sempre busca a versão mais nova
 * (não atrapalha o desenvolvimento); sem internet, usa a última cópia salva.
 */
var CACHE = 'grana-leve-v2';
// Todos os módulos de js/ precisam estar aqui para o app abrir sem internet (tests/unit/sw.test.js confere).
var SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/data/auth.js', 'js/data/session.js', 'js/data/store.js', 'js/domain/accounts.js', 'js/domain/budgets.js', 'js/domain/cards.js', 'js/domain/categories.js', 'js/domain/dates.js', 'js/domain/forecasts.js', 'js/domain/money.js', 'js/domain/parser.js', 'js/domain/receivables.js', 'js/domain/transactions.js', 'js/domain/util.js', 'js/domain/vouchers.js', 'js/ui/app.js', 'js/ui/charts.js', 'js/ui/dom.js', 'js/ui/modal.js', 'js/ui/pdf.js'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  var cacheable = url.origin === self.location.origin || /(^|\.)(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(
    fetch(e.request).then(function(res){
      if (res && (res.ok || res.type === 'opaque')){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(hit){ return hit || caches.match('index.html'); });
    })
  );
});
