// Usabilidade no celular: alvos de toque de 44 px, campos com fonte de 16 px (sem zoom no iPhone) e
// janelas em folha, com os botões sempre à vista.
import * as L from './lib.js';

L.run(async ({page}) => {
  await page.setViewport({width: 390, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
  await L.signup(page);
  const small = () => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.btn, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), textarea, .modal-x, .segmented button, .month-switch button').forEach(e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || e.closest('[hidden]') || e.offsetParent === null) return;
      if (r.height < 43.5) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.height) + 'px');
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && parseFloat(cs.fontSize) < 16) out.push((e.id || e.tagName) + ' fonte ' + cs.fontSize);
    });
    return out;
  });
  L.section('Alvos de toque e fonte dos campos');
  for (const t of ['dashboard', 'lancamentos', 'cartoes', 'limites', 'metas', 'dividas', 'receber', 'perfil']){
    await L.tab(page, t); await L.sleep(200);
    const s = await small();
    L.ok(s.length === 0, t + ': botões e campos com 44 px e fonte 16 px' + (s.length ? ' → ' + s.slice(0, 5).join(', ') : ''));
  }

  L.section('Janela em folha');
  await page.click('#fabAdd'); await L.sleep(350);
  const g = await page.evaluate(() => { const m = document.querySelector('#modalRoot .modal').getBoundingClientRect(), a = document.querySelector('#modalRoot .modal-actions').getBoundingClientRect();
    return {bottom: Math.round(m.bottom), vh: innerHeight, width: Math.round(m.width), vw: innerWidth, actionsInView: a.bottom <= innerHeight + 1 && a.top >= 0, x: document.querySelector('#modalRoot .modal-x').getBoundingClientRect().width}; });
  L.ok(g.bottom >= g.vh - 1 && g.width === g.vw, 'a janela encosta embaixo e ocupa a largura toda (folha)');
  L.ok(g.actionsInView, 'os botões Cancelar / Adicionar ficam sempre à vista');
  L.ok(g.x >= 44, 'botão de fechar com 44 px');
  // Formulário comprido (cartão com parcelas): os botões continuam à vista e o corpo rola.
  await L.setVal(page, '#mAmount', 300);
  const scrolls = await page.$eval('#modalRoot .modal > form', f => f.scrollHeight >= f.clientHeight);
  L.ok(scrolls, 'o corpo da janela rola por dentro, sem empurrar os botões');
  await L.closeModal(page);
  L.ok(await L.noHorizontalScroll(page), 'sem rolagem lateral');
});
