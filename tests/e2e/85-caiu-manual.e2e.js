// “Já caiu” à mão: registrar o salário e os benefícios antes da data prevista, sem esperar o app perguntar.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const profile = {regime: 'clt', gross: 3000, weeklyHours: 44, dependents: 0, rpps: 14, meiKind: 'services', inssKind: 'normal', simplesRate: 6, otherPct: 0, discounts: [],
    bonuses: [{type: 'homeoffice', mode: 'fixed', value: 150, separate: true, day: 25}]};
  await page.evaluate((key, p) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.workProfile = p; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase(), profile);
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(300);

  L.section('Salário previsto para depois (dia 25)');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(400);
  await page.$eval('input[name=rtype][value=day]', e => e.click());
  await page.$eval('input[name=day]', e => { e.value = '25'; });
  await L.submitModal(page); await L.sleep(900);
  L.ok(!(await L.modalOpen(page)), 'como o dia 25 não chegou, o app não pergunta sozinho');
  await L.tab(page, 'dashboard'); await L.sleep(400);
  let card = await L.text(page, '#salaryCard');
  L.ok(/25\/11\/2026/.test(card) && !!(await page.$('#salaryCard [data-salary-confirm]')) && /Já caiu/.test(card), 'o cartão mostra “Já caiu” mesmo antes da data');
  L.ok(!!(await page.$('#salaryCard [data-fc-receive]')), 'e o benefício separado tem “Recebi”');

  L.section('Registrar o salário antes da data');
  await page.$eval('#salaryCard [data-salary-confirm]', e => e.click()); await L.sleep(600);
  L.ok(/O salário de novembro de 2026 caiu\?/.test(await L.modalTitle(page)), 'abre a confirmação do salário de novembro');
  L.ok(await page.$eval('#scCaiu', e => e.value) === '2026-11-17', 'com o dia de hoje (a data prevista ainda não chegou)');
  await L.submitModal(page); await L.sleep(900);
  let d = await L.db(page);
  L.ok(d.transactions.filter(t => t.category === 'salario' && t.date === '2026-11-17').length === 1, 'o salário é registrado hoje');
  card = await L.text(page, '#salaryCard');
  L.ok(/25\/12\/2026/.test(card) && !(await page.$('#salaryCard [data-salary-confirm]')), 'o próximo (25/12) está longe: o cartão não mostra o botão (evita registrar por engano)');

  L.section('E o benefício também');
  await page.$eval('#salaryCard [data-fc-receive]', e => e.click()); await L.sleep(400);
  await L.submitModal(page); await L.sleep(700);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => t.amount === 150).length === 1, 'o auxílio é registrado antes do dia');
  card = await L.text(page, '#salaryCard');
  L.ok(/recebido/.test(card) && !(await page.$('#salaryCard [data-fc-receive]')), 'fica como recebido, sem botão do mês que vem enquanto a data está longe');

  L.section('Pelo “Meu salário”');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(400);
  L.ok(!!(await page.$('[data-sp-got]')) && /Registrar que caiu \(dezembro\)/.test(await L.text(page, '#modalRoot')), '“Meu salário” também tem o botão para registrar');
  await page.$eval('[data-sp-got]', e => e.click()); await L.sleep(600);
  L.ok(/O salário de dezembro de 2026 caiu\?/.test(await L.modalTitle(page)), 'abre a confirmação de dezembro');
  await L.closeModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => t.category === 'salario').length === 1, 'fechar sem confirmar não registra nada');

  L.section('Perto da data, o botão do mês que vem aparece');
  await L.patchDb(page, `u.forecasts.forEach(function(f){ if (f.salary){ f.salary.rule = {type: 'day', day: 5}; f.date = '2026-11-05'; f.received = {'2026-11': 2751.4}; } });`, {});
  // Avança o relógio 12 dias (de 17/11 para 29/11): o salário de dezembro (dia 5) fica a 6 dias.
  await page.evaluateOnNewDocument(() => { const D = Date, off = 12 * 86400000; window.Date = class extends D { constructor(...a){ if (a.length) super(...a); else super(D.now() + off); } static now(){ return D.now() + off; } }; });
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(500);
  if (await L.modalOpen(page)) await L.closeModal(page);
  const perto = await L.text(page, '#salaryCard');
  L.ok(/Já caiu \(dezembro\)/.test(perto), 'a 6 dias do salário de dezembro, o cartão mostra “Já caiu (dezembro)”');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800, isMobile: true, hasTouch: true});
  await L.tab(page, 'dashboard'); await L.sleep(300);
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('#salaryCard [data-salary-confirm]', e => e.getBoundingClientRect().height >= 40), 'o botão cabe no celular, com tamanho de toque');
});
