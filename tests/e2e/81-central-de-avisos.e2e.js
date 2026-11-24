// Central de avisos (o sininho): próximos avisos (inclusive o do salário) e o histórico dos enviados.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  await L.patchDb(page, `u.forecasts.push({id: 'f1', description: 'Salário', amount: 3000, date: '2026-11-20', recurring: true, received: {}, category: 'salario', salary: {rule: {type: 'day', day: 20}, steps: [{from: '2026-11', gross: 3000, net: 2700}], months: {}}});`, {});
  await page.evaluate((key) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.whatsNewSeen = '9999-12-31'; cur.reminderRules = {custom: [{id: 'c1', type: 'custom', title: 'Pagar a escola', repeat: 'once', date: '2026-11-18', hour: 8, enabled: true}]}; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase());
  await L.reload(page); await L.sleep(300);

  L.section('O sininho');
  L.ok(!!(await page.$('#noticesBtn')) && await page.$eval('#noticesBtn', e => e.getBoundingClientRect().width >= 36), 'o sino aparece no topo');
  L.ok(await page.$eval('#noticesBadge', e => e.hidden), 'sem avisos novos, sem número');
  await page.$eval('#noticesBtn', e => e.click()); await L.sleep(400);
  L.ok(/Avisos/.test(await L.modalTitle(page)), 'abre a central de avisos');
  const t = await L.text(page, '#modalRoot');
  L.ok(/Chegaram/.test(t) && /conta online e os avisos ligados/.test(t), 'sem conta online explica onde ver o histórico');
  L.ok(/Próximos avisos/.test(t) && /Pagar a escola/.test(t) && /amanhã às 8h/.test(t), 'mostra o aviso programado (amanhã às 8h)');
  L.ok(/Seu salário/.test(t) && /dia 20\/11 às 9h/.test(t), 'e o aviso do salário (dia 20/11, 9h)');
  L.ok(!/R\$/.test(t), 'sem valores em reais');

  L.ok(/Novidades do app/.test(t) && /Central de avisos/.test(t), 'e a seção “Novidades do app”, com a atualização mais recente');

  L.section('Novidades do app: o sino avisa quando há atualização');
  await L.closeModal(page);
  await page.evaluate((key) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.whatsNewSeen = '2000-01-01'; delete cur.noticesNewsSeen; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase());
  await L.reload(page); await L.sleep(400);
  const nBadge = await page.$eval('#noticesBadge', e => e.hidden ? 0 : Number(e.textContent.replace('+', '')));
  L.ok(nBadge > 0, 'com novidades que a pessoa ainda não viu, o sino mostra um número (' + nBadge + ')');
  await page.$eval('#noticesBtn', e => e.click()); await L.sleep(400);
  L.ok(await page.$eval('.notice-rel', e => e.open) && !!(await page.$('[data-notice-screen]')), 'a atualização nova vem aberta, com o botão “Ver”');
  await L.closeModal(page); await L.sleep(300);
  L.ok(await page.$eval('#noticesBadge', e => e.hidden), 'depois de olhar, o número some');
  await page.$eval('#noticesBtn', e => e.click()); await L.sleep(300);
  await page.$eval('[data-notice-screen]', e => e.click()); await L.sleep(500);
  L.ok(!(await L.modalOpen(page)), '“Ver” fecha a central e abre a tela da novidade');

  L.section('Tocar leva para a tela do aviso');
  await page.evaluate(() => { location.hash = '#/metas'; }); await L.sleep(300);
  await page.$eval('#noticesBtn', e => e.click()); await L.sleep(400);
  await page.$eval('.notice-item[href="./#/inicio"]', e => e.click()); await L.sleep(500);
  L.ok(!(await L.modalOpen(page)) && /#\/inicio/.test(await page.evaluate(() => location.hash)), 'fecha a central e abre o Início');
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');

  L.section('No celular');
  await page.setViewport({width: 375, height: 800, isMobile: true, hasTouch: true});
  await L.sleep(300);
  L.ok(await page.$eval('#noticesBtn', e => { const r = e.getBoundingClientRect(); return r.width >= 36 && r.right <= 375; }), 'o sino cabe no topo do celular');
  await page.$eval('#noticesBtn', e => e.click()); await L.sleep(400);
  L.ok(await L.modalOpen(page) && await L.noHorizontalScroll(page), 'a central abre como folha e cabe na tela');
});
