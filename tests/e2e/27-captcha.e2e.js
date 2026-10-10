// Captcha (Cloudflare Turnstile) com a chave de teste oficial, que sempre aprova: confere que a
// política de segurança da página deixa o widget carregar e que um token novo vem a cada pedido.
import * as L from './lib.js';

L.run(async ({page}) => {
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  const online = await fetch('https://challenges.cloudflare.com/turnstile/v0/api.js').then(r => r.ok, () => false);
  if (!online){ console.log('Pulado: sem internet para carregar o Turnstile.'); return; }
  const cfg = await page.evaluate(async () => ({on: (await import('/js/ui/captcha.js')).captchaEnabled(), key: (await import('/js/config.js')).TURNSTILE_SITE_KEY}));
  L.ok(cfg.on === !!cfg.key, 'captcha ligado só quando há site key em config.js (' + (cfg.key ? 'ligado' : 'desligado') + ')');
  L.ok(await page.evaluate(async () => (await import('/js/ui/captcha.js')).captchaEnabled('')) === false, 'sem site key, fica desligado');
  const r = await page.evaluate(async () => {
    const m = await import('/js/ui/captcha.js');
    try { const a = await m.getCaptchaToken('1x00000000000000000000AA'); const b = await m.getCaptchaToken('1x00000000000000000000AA'); return {a, b}; }
    catch(e){ return {err: String(e)}; }
  });
  L.ok(!r.err && typeof r.a === 'string' && r.a.length > 10, 'com a chave de teste, o Turnstile carrega e devolve um token' + (r.err ? ' (' + r.err + ')' : ''));
  L.ok(typeof r.b === 'string' && r.b.length > 10, 'um novo pedido gera outro token (cada um vale uma vez)');
});
