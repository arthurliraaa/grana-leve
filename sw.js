/*
 * Service worker do Grana Leve: permite abrir o app sem internet.
 * Estratégia "rede primeiro": com internet, sempre busca a versão mais nova
 * (não atrapalha o desenvolvimento); sem internet, usa a última cópia salva.
 */
var CACHE = 'grana-leve-v170';
// Todos os módulos de js/ precisam estar aqui para o app abrir sem internet (tests/unit/sw.test.js confere).
var SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/config.js', 'js/data/auth.js', 'js/data/backup.js', 'js/data/migrations.js', 'js/data/rates.js', 'js/data/session.js', 'js/data/store.js', 'js/data/supabase.js', 'js/domain/accounts.js', 'js/domain/advice.js', 'js/domain/bills.js', 'js/domain/brands.js', 'js/domain/budgets.js', 'js/domain/cards.js', 'js/domain/categories.js', 'js/domain/contact.js', 'js/domain/dates.js', 'js/domain/forecasts.js', 'js/domain/goals.js', 'js/domain/investments.js', 'js/domain/money.js', 'js/domain/parser.js', 'js/domain/receivables.js', 'js/domain/research.js', 'js/domain/salary.js', 'js/domain/simulate.js', 'js/domain/terms.js', 'js/domain/transactions.js', 'js/domain/urgency.js', 'js/domain/util.js', 'js/domain/validate.js', 'js/domain/vouchers.js', 'js/ui/accounts-tab.js', 'js/ui/admin.js', 'js/ui/advice-tab.js', 'js/ui/app.js', 'js/ui/bills.js', 'js/ui/brand-picker.js', 'js/ui/calendar.js', 'js/ui/captcha.js', 'js/ui/cards-tab.js', 'js/ui/charts.js', 'js/ui/chat.js', 'js/ui/commitments-tab.js', 'js/ui/constants.js', 'js/ui/dash-charts.js', 'js/ui/dash-data.js', 'js/ui/dash-details.js', 'js/ui/dom.js', 'js/ui/feedback.js', 'js/ui/home-tab.js', 'js/ui/landing.js', 'js/ui/learn-tab.js', 'js/ui/modal.js', 'js/ui/money-input.js', 'js/ui/my-data.js', 'js/ui/online.js', 'js/ui/password.js', 'js/ui/pdf.js', 'js/ui/planning-tab.js', 'js/ui/profile.js', 'js/ui/pwa.js', 'js/ui/reports.js', 'js/ui/research-term.js', 'js/ui/salary-calc.js', 'js/ui/share-charge.js', 'js/ui/shared-sync.js', 'js/ui/shell.js', 'js/ui/simulator.js', 'js/ui/state.js', 'js/ui/theme.js', 'js/ui/tutorial.js', 'js/ui/tx-edit.js', 'js/ui/tx-list.js', 'js/vendor/supabase.umd.js'];

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
