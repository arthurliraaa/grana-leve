// Troca de tema animada: o tema novo nasce do botão e se espalha em círculo pela tela (View Transitions); sem movimento, troca na hora.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  L.section('Com “reduzir movimento”: troca na hora');
  const before = await theme();
  await page.click('#themeToggle'); await L.sleep(120);
  L.ok(await theme() !== before && !(await page.evaluate(() => document.documentElement.classList.contains('theme-vt'))), 'o tema muda na hora, sem animação');
  await page.click('#themeToggle'); await L.sleep(120);

  L.section('Com movimento: espalha a partir do botão');
  if (!(await page.evaluate(() => !!document.startViewTransition))){ console.log('Pulado: este navegador não tem View Transitions.'); return; }
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'no-preference'}]);
  await page.evaluate(() => {
    window.__anims = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function(kf, opts){ window.__anims.push({kf: JSON.stringify(kf), pseudo: opts && opts.pseudoElement}); return orig.call(this, kf, opts); };
  });
  const box = await page.$eval('#themeToggle', e => { const r = e.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
  const t0 = await theme();
  await page.click('#themeToggle'); await L.sleep(300);
  L.ok(await page.evaluate(() => document.documentElement.classList.contains('theme-vt')), 'durante a troca a página está em transição');
  const a = await page.evaluate(() => window.__anims.filter(x => x.pseudo === '::view-transition-new(root)')[0] || null);
  L.ok(!!a, 'o tema novo é revelado por uma animação própria (círculo crescendo)');
  const m = a && a.kf.match(/circle\(0px at ([\d.]+)px ([\d.]+)px\)/);
  L.ok(!!m && Math.abs(Number(m[1]) - box.x) < 2 && Math.abs(Number(m[2]) - box.y) < 2, 'o círculo começa no centro do botão do tema (' + Math.round(box.x) + ', ' + Math.round(box.y) + ')');
  const big = a && a.kf.match(/circle\(([\d.]+)px at/g);
  L.ok(!!big && Number(big[1].match(/([\d.]+)px/)[1]) >= Math.hypot(Math.max(box.x, 1280 - box.x), Math.max(box.y, 900 - box.y)) - 2, 'e termina grande o bastante para cobrir a tela inteira');
  await L.sleep(1000);
  L.ok(await theme() !== t0 && !(await page.evaluate(() => document.documentElement.classList.contains('theme-vt'))), 'no fim o tema mudou e a transição terminou');
  L.ok(await page.$eval('#themeToggle', e => !e.classList.contains('theme-spin')), 'o ícone do botão também gira e volta ao normal');
});
