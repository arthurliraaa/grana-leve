// Utilitários dos testes E2E do Grana Leve (puppeteer-core + Chrome instalado no sistema).
import puppeteer from 'puppeteer-core';
import {existsSync} from 'node:fs';

export const BASE = process.env.BASE || 'http://127.0.0.1:5510/';
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => existsSync(p));

let passed = 0, failed = 0;
const failures = [];
export function ok(cond, msg){
  if (cond){ passed++; console.log('  ✓ ' + msg); }
  else { failed++; failures.push(msg); console.log('  ✗ ' + msg); }
}
export function section(t){ console.log('\n## ' + t); }
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(){
  if (!CHROME) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  const browser = await puppeteer.launch({executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=pt-BR']});
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 900});
  // Sem animações nos testes (como quem pede menos movimento no sistema): o estado é verificado na hora.
  if (!process.env.E2E_MOTION) await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource|cdnjs/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  return {browser, page, errors};
}

// Cria uma conta nova (sem o chat de boas-vindas, salvo se welcome=true) e entra no app.
export async function signup(page, opts = {}){
  const email = opts.email || ('t' + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.com');
  await page.goto(BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  if (!opts.welcome) await page.evaluate((key) => localStorage.setItem('granaleve_prefs_' + key, JSON.stringify({quickEntryOff: true})), email.toLowerCase());
  await page.goto(BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-action="go-signup"]');
  await page.click('[data-action="go-signup"]');
  await page.type('#signupName', 'Arthur Teste');
  await page.type('#signupEmail', email);
  await page.type('#signupPassword', 'senha@123');
  if (await page.$('#signupStorageOk')) await page.click('#signupStorageOk');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#viewApp:not([hidden])');
  await sleep(300);
  return email;
}
export async function reload(page){
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#viewApp:not([hidden])');
  await sleep(300);
}

// Abre uma área do app: pelo menu lateral quando ele aparece (computador) ou pelo endereço (celular).
// 'dividas' e 'receber' são as duas partes de Compromissos (Eu devo / Me devem).
const ROUTES = {dashboard: 'inicio', lancamentos: 'lancamentos', cartoes: 'contas', limites: 'planejar', metas: 'metas',
  compromissos: 'compromissos', aprenda: 'aprenda', conexoes: 'conexoes', perfil: 'perfil'};
export async function tab(page, name){
  const sub = name === 'dividas' || name === 'receber' ? name : null;
  const area = sub ? 'compromissos' : name;
  const link = '.sidenav [data-tab="' + area + '"]';
  if (await page.$eval(link, el => el.getBoundingClientRect().width > 0).catch(() => false)) await page.click(link);
  else await page.evaluate(r => { location.hash = '#/' + r; }, ROUTES[area]);
  await sleep(80);
  if (sub) await page.click('#segbtn-' + sub);
  await sleep(80);
}
export async function modalOpen(page){ return page.$eval('#modalRoot', el => !el.hidden).catch(() => false); }
export async function modalTitle(page){ return page.$eval('#modalTitle', el => el.textContent).catch(() => null); }
export async function submitModal(page){ await page.click('#modalRoot .modal-actions button[type=submit]'); await sleep(250); }
export async function closeModal(page){ if (await modalOpen(page)){ await page.click('#modalRoot .modal-x'); await sleep(150); } }
export async function modalError(page){ return page.$eval('#modalRoot [data-modal-error]', el => el.textContent).catch(() => ''); }
export async function setVal(page, sel, val){
  await page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, String(val));
}
// Texto visível normalizado (espaços colapsados).
export async function text(page, sel){ return page.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => ''); }
export async function lastToast(page){ return page.$$eval('#toastWrap .toast', els => els.length ? els[els.length - 1].textContent : ''); }
export async function allToasts(page){ return page.$$eval('#toastWrap .toast', els => els.map(e => e.textContent).join(' | ')); }
// Lê os dados salvos do usuário logado direto do localStorage.
export async function db(page){
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('granaleve_session_v1'));
    const all = JSON.parse(localStorage.getItem('granaleve_local_db_v1'));
    return all.users[s.emailKey];
  });
}
// Grava dados direto no localStorage (para simular dados antigos) e recarrega.
export async function patchDb(page, fn, arg){
  await page.evaluate((src, arg) => {
    const s = JSON.parse(localStorage.getItem('granaleve_session_v1'));
    const all = JSON.parse(localStorage.getItem('granaleve_local_db_v1'));
    new Function('u', 'arg', src)(all.users[s.emailKey], arg);
    localStorage.setItem('granaleve_local_db_v1', JSON.stringify(all));
  }, fn, arg);
  await reload(page);
}
export async function noHorizontalScroll(page){ return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }

// Novo lançamento pelo botão +.
export async function addTx(page, o){
  await page.click('#fabAdd'); await sleep(150);
  if (o.type === 'income') await page.click('#mType button[data-type="income"]');
  await setVal(page, '#mAmount', o.amount);
  if (o.category) await setVal(page, '#mCategory', o.category);
  if (o.newCat){ await setVal(page, '#mCategory', '__new'); await page.type('#mNewCat', o.newCat); }
  if (o.date) await setVal(page, '#mDate', o.date);
  if (o.pay) await setVal(page, '#mPay', o.pay);
  if (o.install) await setVal(page, '#mInstall', o.install);
  if (o.desc) await page.type('#mDesc', o.desc);
  await submitModal(page);
}
// As previsões de entrada ficam recolhidas no card de novo lançamento.
export async function openForecasts(page){
  await tab(page, 'lancamentos');
  if (await page.$eval('#forecastPanel', el => el.hidden)) await page.click('#forecastToggle');
  await sleep(80);
}
export async function addCard(page, name, limit, closing, due){
  await tab(page, 'cartoes');
  await page.type('#cardName', name); await page.type('#cardLimit', String(limit));
  await page.type('#cardClosing', String(closing)); await page.type('#cardDue', String(due));
  await page.click('#cardForm button[type=submit]'); await sleep(200);
}

// Datas relativas a hoje, no formato do app.
const pad = n => String(n).padStart(2, '0');
export const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const br = s => s.split('-').reverse().join('/');
export function monthKey(off){ const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() + off, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
export function dayOffset(n){ const t = new Date(); return iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n)); }
export function plusMonths(s, n){
  const [y, m, d] = s.split('-').map(Number); const f = new Date(y, m - 1 + n, 1);
  return iso(new Date(f.getFullYear(), f.getMonth(), Math.min(d, new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate())));
}
export const moneyOf = s => Number(String(s).replace(/[^\d,-]/g, '').replace(',', '.'));

// Executa um arquivo de teste e encerra com o código certo.
export async function run(body){
  const ctx = await launch();
  try { await body(ctx); }
  catch (e){ ok(false, 'exceção: ' + e.stack); }
  finally {
    ok(ctx.errors.length === 0, 'nenhum erro de JavaScript' + (ctx.errors.length ? ': ' + ctx.errors.join(' | ') : ''));
    await ctx.browser.close();
    console.log('\n' + passed + ' passaram, ' + failed + ' falharam');
    if (failures.length) console.log('Falhas:\n - ' + failures.join('\n - '));
    process.exit(failed ? 1 : 0);
  }
}
