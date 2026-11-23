// 13º salário registrado à parte (antes do salário do mês) e “pular o salário deste mês” (já recebido: não pergunta nem conta).
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const profile = {regime: 'clt', gross: 3000, weeklyHours: 44, dependents: 0, rpps: 14, meiKind: 'services', inssKind: 'normal', simplesRate: 6, otherPct: 0, discounts: [], bonuses: []};
  await page.evaluate((key, p) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.workProfile = p; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase(), profile);
  await L.reload(page);
  const cur = '2026-11';

  L.section('“Já recebi este mês”: não pergunta nem conta');
  await L.tab(page, 'dashboard'); await L.sleep(200);
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  L.ok(!!(await page.$('input[name=skipNow]')) && /já recebi/i.test(await L.text(page, '.sp-skip')), 'Meu salário oferece “O salário deste mês eu já recebi”');
  L.ok(!!(await page.$('[data-sp-13]')), 'e tem um botão só para o 13º');
  await page.$eval('input[name=skipNow]', e => e.click());
  await L.submitModal(page); await L.sleep(900);
  L.ok(!(await L.modalOpen(page)), 'com a opção marcada, não pergunta “já caiu?” (a data de novembro já passou)');
  let d = await L.db(page);
  const f = d.forecasts.find(x => x.salary);
  L.ok(f && f.received && f.received[cur] > 0, 'o mês de novembro fica como recebido na previsão');
  L.ok(d.transactions.filter(t => t.type === 'income').length === 0, 'e nada é lançado nos ganhos');
  await L.tab(page, 'dashboard'); await L.sleep(300);
  const card = await L.text(page, '#salaryCard');
  L.ok(!/deveria ter caído/.test(card) && /05\/12\/2026/.test(card), 'o Início mostra o próximo salário (05/12), não o de novembro');

  L.section('13º salário, antes do salário do mês');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  L.ok(!(await page.$('input[name=skipNow]')), 'com o mês já pulado, a opção não aparece de novo');
  await page.$eval('[data-sp-13]', e => e.click()); await L.sleep(500);
  L.ok(/Registrar o 13º salário/.test(await L.modalTitle(page)), 'o botão abre a calculadora do 13º');
  L.ok(await page.$eval('.sc-extra', e => e.open), 'já na parte do 13º, aberta');
  L.ok(!(await page.$('#modalRoot .modal-actions [type=submit]')), 'sem botão de salvar o salário: só as parcelas');
  await page.$eval('[data-use=third1]', e => e.click()); await L.sleep(500);
  L.ok(/13º salário · 1ª parcela/.test(await L.modalTitle(page)), 'escolher a 1ª parcela pede a confirmação do valor');
  L.ok(Number(await page.$eval('#askAmount', e => e.value.replace(',', '.'))) === 1500, 'sugere metade do 13º (R$ 1.500)');
  L.ok(!!(await page.$('#thAcc')) || !!(await page.$('#askAcc')) || !!(await page.$('[name=askdate]')), 'pede o dia e a conta');
  await L.submitModal(page); await L.sleep(600);
  d = await L.db(page);
  const t13 = d.transactions.find(t => /13º salário/.test(t.description || ''));
  L.ok(t13 && t13.type === 'income' && t13.amount === 1500 && t13.description === '13º salário · 1ª parcela', 'registrou o ganho de R$ 1.500 como “13º salário · 1ª parcela”');
  L.ok(t13.category === 'outros_receita', 'fora da categoria Salário (não puxa o “salário de costume” do simulador)');
  L.ok(!d.transactions.some(t => t.category === 'salario'), 'e o salário do mês continua sem lançamento');

  L.section('Registrar de novo pede confirmação');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  await page.$eval('[data-sp-13]', e => e.click()); await L.sleep(500);
  await page.$eval('[data-use=third1]', e => e.click()); await L.sleep(500);
  L.ok(/Já está registrado/.test(await L.modalTitle(page)), 'a mesma parcela no mesmo ano pergunta se é para registrar de novo');
  await L.closeModal(page); await L.sleep(200);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => /13º salário/.test(t.description || '')).length === 1, 'e fechar não duplica');

  L.section('“Pular este mês” no cartão do Início');
  await L.patchDb(page, `u.forecasts.forEach(function(f){ if (f.salary) f.received = {}; });`, {});
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(400);
  L.ok(/deveria ter caído/.test(await L.text(page, '#salaryCard')) && !!(await page.$('[data-salary-skip]')), 'sem o mês marcado, o cartão pergunta e oferece “Pular este mês”');
  await page.$eval('[data-salary-skip]', e => e.click()); await L.sleep(400);
  L.ok(/Pular o salário de novembro/.test(await L.modalTitle(page)), 'pede confirmação');
  await L.submitModal(page); await L.sleep(700);
  d = await L.db(page);
  L.ok(d.forecasts.find(x => x.salary).received[cur] > 0 && !/deveria ter caído/.test(await L.text(page, '#salaryCard')), 'pulado: o cartão deixa de cobrar o salário de novembro');
});
