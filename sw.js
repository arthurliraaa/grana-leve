/*
 * Service worker do Grana Leve: permite abrir o app sem internet.
 * Estratégia "rede primeiro": com internet, sempre busca a versão mais nova
 * (não atrapalha o desenvolvimento); sem internet, usa a última cópia salva.
 */
var CACHE = 'grana-leve-v198';
// Todos os módulos de js/ precisam estar aqui para o app abrir sem internet (tests/unit/sw.test.js confere).
var SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/outfit-latin.woff2', 'fonts/ibm-plex-sans-latin.woff2',
  'js/app.js', 'js/config.js', 'js/data/auth.js', 'js/data/backup.js', 'js/data/migrations.js', 'js/data/rates.js', 'js/data/session.js', 'js/data/store.js', 'js/data/supabase.js', 'js/domain/accounts.js', 'js/domain/advice.js', 'js/domain/bills.js', 'js/domain/brands.js', 'js/domain/budgets.js', 'js/domain/cards.js', 'js/domain/categories.js', 'js/domain/changelog.js', 'js/domain/contact.js', 'js/domain/dates.js', 'js/domain/forecasts.js', 'js/domain/goals.js', 'js/domain/investments.js', 'js/domain/mascot.js', 'js/domain/money.js', 'js/domain/parser.js', 'js/domain/receivables.js', 'js/domain/reminders.js', 'js/domain/research.js', 'js/domain/salary-plan.js', 'js/domain/salary.js', 'js/domain/simulate.js', 'js/domain/statement.js', 'js/domain/terms.js', 'js/domain/transactions.js', 'js/domain/urgency.js', 'js/domain/util.js', 'js/domain/validate.js', 'js/domain/vouchers.js', 'js/ui/accounts-tab.js', 'js/ui/admin.js', 'js/ui/advice-tab.js', 'js/ui/app.js', 'js/ui/bills.js', 'js/ui/brand-picker.js', 'js/ui/busy.js', 'js/ui/calendar.js', 'js/ui/captcha.js', 'js/ui/cards-tab.js', 'js/ui/charts.js', 'js/ui/chat.js', 'js/ui/commitments-tab.js', 'js/ui/constants.js', 'js/ui/dash-charts.js', 'js/ui/dash-data.js', 'js/ui/dash-details.js', 'js/ui/dom.js', 'js/ui/feedback.js', 'js/ui/home-tab.js', 'js/ui/import-statement.js', 'js/ui/landing.js', 'js/ui/learn-tab.js', 'js/ui/mascot-art.js', 'js/ui/mascot-chat.js', 'js/ui/mascot.js', 'js/ui/modal.js', 'js/ui/money-input.js', 'js/ui/my-data.js', 'js/ui/online.js', 'js/ui/password.js', 'js/ui/pdf-read.js', 'js/ui/pdf.js', 'js/ui/planning-tab.js', 'js/ui/profile.js', 'js/ui/push.js', 'js/ui/pwa.js', 'js/ui/reports.js', 'js/ui/research-term.js', 'js/ui/salary-calc.js', 'js/ui/salary-plan.js', 'js/ui/share-charge.js', 'js/ui/shared-sync.js', 'js/ui/shell.js', 'js/ui/simulator.js', 'js/ui/splash.js', 'js/ui/state.js', 'js/ui/theme.js', 'js/ui/tutorial.js', 'js/ui/tx-edit.js', 'js/ui/tx-list.js', 'js/ui/whats-new.js', 'js/vendor/supabase.umd.js'];

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
  var cacheable = url.origin === self.location.origin || /(^|\.)cdnjs\.cloudflare\.com$/.test(url.hostname);
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

// Avisos (Web Push): o servidor manda {title, body, url, tag} cifrado. O texto é genérico (nunca tem valores) e o aviso só abre
// rotas do próprio app (mesma regra do banco: ./#/nome).
self.addEventListener('push', function(e){
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch(err){ d = {}; }
  var url = /^\.\/#\/[a-z-]{1,30}$/.test(String(d.url || '')) ? d.url : './#/inicio';
  e.waitUntil(self.registration.showNotification(String(d.title || 'Grana Leve').slice(0, 80), {
    body: String(d.body || '').slice(0, 160), icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: String(d.tag || 'grana-leve').slice(0, 120), data: {url: url}
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './#/inicio', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(list){
    var open = list.filter(function(c){ return c.url.indexOf(self.registration.scope) === 0; })[0];
    if (open && open.focus) return open.focus().then(function(c){ return c && c.navigate ? c.navigate(url) : null; }).catch(function(){ return self.clients.openWindow(url); });
    return self.clients.openWindow(url);
  }));
});
