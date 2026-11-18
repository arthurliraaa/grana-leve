// Celular: arrastar a janela para baixo fecha, PDF com ações à vista, datas e botão da média dentro das caixas.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await page.setViewport({width: 390, height: 800, isMobile: true, hasTouch: true});
  const swipe = (sel, from, to) => page.evaluate((sel, from, to) => {
    const el = document.querySelector(sel);
    const touch = y => new Touch({identifier: 7, target: el, clientX: 120, clientY: y});
    const fire = (type, y) => el.dispatchEvent(new TouchEvent(type, {bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch(y)], changedTouches: [touch(y)]}));
    fire('touchstart', from); fire('touchmove', from + 30); fire('touchmove', to); fire('touchend', to);
  }, sel, from, to);

  L.section('Arrastar para baixo fecha a janela');
  await L.tab(page, 'limites');
  await page.$eval('#budgetManageCats', e => e.click()); await L.sleep(300);
  L.ok(!(await page.$eval('#modalRoot', e => e.hidden)) && !!(await page.$('#modalRoot .sheet-grip')), 'a janela abre como folha, com a alça no topo');
  await swipe('#modalRoot .modal-head', 300, 330); await L.sleep(300);
  L.ok(!(await page.$eval('#modalRoot', e => e.hidden)), 'um arrasto curto não fecha');
  await swipe('#modalRoot .modal-head', 300, 520); await L.sleep(500);
  L.ok(await page.$eval('#modalRoot', e => e.hidden), 'arrastar para baixo fecha a janela');

  L.section('Datas das metas dentro das caixas');
  await page.setViewport({width: 360, height: 780, isMobile: true, hasTouch: true});
  await L.tab(page, 'metas'); await L.sleep(200);
  const inside = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(), f = e.closest('.field').getBoundingClientRect(); return r.left >= f.left - 1 && r.right <= f.right + 1; });
  L.ok(await inside('#goalDate') && await inside('#goalReminder'), 'Prazo e Me avise em ficam dentro das caixas');

  L.section('Média dos últimos 3 meses dentro da caixa');
  const mk = o => { const x = new Date(); const y = new Date(x.getFullYear(), x.getMonth() + o, 10); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-10'; };
  await L.patchDb(page, `u.transactions = [
    {id: 'h1', type: 'expense', amount: 300, category: 'lazer', date: arg.a, description: 'Cinema', paymentMethod: 'conta', createdAt: 1},
    {id: 'h2', type: 'expense', amount: 500, category: 'alimentacao', date: arg.b, description: 'Mercado', paymentMethod: 'conta', createdAt: 1}];`, {a: mk(-1), b: mk(-2)});
  await L.tab(page, 'limites'); await L.sleep(300);
  const fillIn = await page.$eval('[data-budget-fill]', e => { const r = e.getBoundingClientRect(), f = e.closest('.budget-summary').getBoundingClientRect(); return r.right <= f.right + 1 && r.left >= f.left - 1; }).catch(() => null);
  L.ok(fillIn === true, 'o botão “Usar a média dos últimos 3 meses” cabe na caixa');

  L.section('PDF com as ações à vista');
  await L.addCard(page, 'Inter', 3000, 5, 12);
  const d = await L.db(page);
  await L.addTx(page, {amount: 120, pay: 'card:' + d.cards[0].id, desc: 'Mercado', category: 'alimentacao'});
  await L.tab(page, 'cartoes'); await L.sleep(200);
  const top = await page.$eval('#walletSummary .ws-actions', e => e.getBoundingClientRect().top);
  const eq = await page.$eval('#walletSummary .ws-eq', e => e.getBoundingClientRect().top);
  L.ok(top < eq, 'os botões de PDF ficam acima da conta “Nas contas − Faturas = Sobra”');
  for (const off of ['0', '1']){
    await page.$eval('#walletSummary [data-allinv-pdf="' + off + '"]', e => e.click()); await L.sleep(900);
    if (/Faturas/.test(await L.modalTitle(page).catch(() => '') || '')) break;
  }
  const vis = await page.$eval('#modalRoot [data-pdf="download"]', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).catch(() => false);
  L.ok(vis && !(await page.$('#modalRoot iframe')), 'no celular o PDF mostra Abrir/Baixar à vista, sem a pré-visualização em branco');
  await L.closeModal(page);
  await page.setViewport({width: 1280, height: 900});
});
