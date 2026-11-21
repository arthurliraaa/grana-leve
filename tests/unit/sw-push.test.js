import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Carrega o sw.js com um "self" falso e dispara os eventos de push e de clique.
function loadSw(){
  const listeners = {}, shown = [], opened = [], focused = [];
  const clients = [];
  const self = {
    registration: {scope: 'https://grana.exemplo.com/', showNotification: (title, opts) => { shown.push({title, opts}); return Promise.resolve(); }},
    clients: {matchAll: () => Promise.resolve(clients), openWindow: url => { opened.push(url); return Promise.resolve(); }, claim: () => Promise.resolve()},
    addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: () => Promise.resolve()
  };
  vm.runInNewContext(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), {self, URL, caches: {}, fetch: () => {}, Promise});
  return {listeners, shown, opened, focused, clients, self};
}
const pushEvent = obj => ({data: obj === undefined ? null : {json: () => { if (obj instanceof Error) throw obj; return obj; }}, waitUntil(p){ this.p = p; }});

test('push: mostra o aviso com o texto recebido e a rota do app', async () => {
  const sw = loadSw(), e = pushEvent({title: 'Fatura do cartão', body: 'A fatura do Nubank vence amanhã.', url: './#/contas', tag: 'invoice:c1:2026-12'});
  sw.listeners.push(e); await e.p;
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, 'Fatura do cartão');
  assert.equal(sw.shown[0].opts.body, 'A fatura do Nubank vence amanhã.');
  assert.equal(sw.shown[0].opts.data.url, './#/contas');
  assert.equal(sw.shown[0].opts.tag, 'invoice:c1:2026-12');
  assert.equal(sw.shown[0].opts.icon, 'icons/icon-192.png');
});

test('push: endereço de fora do app vira a tela inicial; sem dados ou com erro ainda mostra um aviso genérico', async () => {
  let sw = loadSw(), e = pushEvent({title: 'x', body: 'y', url: 'https://golpe.exemplo.com/login'});
  sw.listeners.push(e); await e.p;
  assert.equal(sw.shown[0].opts.data.url, './#/inicio');
  sw = loadSw(); e = pushEvent(undefined); sw.listeners.push(e); await e.p;
  assert.equal(sw.shown[0].title, 'Grana Leve');
  sw = loadSw(); e = pushEvent(new Error('json ruim')); sw.listeners.push(e); await e.p;
  assert.equal(sw.shown.length, 1, 'o navegador exige mostrar um aviso a cada push');
  sw = loadSw(); e = pushEvent({title: 'T'.repeat(300), body: 'B'.repeat(500)}); sw.listeners.push(e); await e.p;
  assert.ok(sw.shown[0].title.length <= 80 && sw.shown[0].opts.body.length <= 160, 'texto longo é cortado');
});

test('clique: abre a rota; se o app já está aberto, usa a janela dele', async () => {
  let sw = loadSw(), closed = false;
  let e = {notification: {data: {url: './#/contas'}, close(){ closed = true; }}, waitUntil(p){ this.p = p; }};
  sw.listeners.notificationclick(e); await e.p;
  assert.equal(closed, true);
  assert.deepEqual(sw.opened, ['https://grana.exemplo.com/#/contas']);
  sw = loadSw();
  const navigated = [];
  sw.clients.push({url: 'https://grana.exemplo.com/', focus(){ return Promise.resolve(this); }, navigate(u){ navigated.push(u); return Promise.resolve(); }});
  e = {notification: {data: {url: './#/inicio'}, close(){}}, waitUntil(p){ this.p = p; }};
  sw.listeners.notificationclick(e); await e.p;
  assert.deepEqual(navigated, ['https://grana.exemplo.com/#/inicio']);
  assert.equal(sw.opened.length, 0, 'não abre outra janela');
});
