// Benefícios que caem separado do salário (auxílio home office antes do dia do pagamento): previsão própria, “Recebi” antes, sem contar duas vezes.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const profile = {regime: 'clt', gross: 3000, weeklyHours: 44, dependents: 0, rpps: 14, meiKind: 'services', inssKind: 'normal', simplesRate: 6, otherPct: 0, discounts: [], bonuses: []};
  await page.evaluate((key, p) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.workProfile = p; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase(), profile);
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(300);

  L.section('Na calculadora: “Cai separado do salário”');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(400);
  await page.$eval('[data-sp-calc]', e => e.click()); await L.sleep(500);
  await page.$eval('.sc-sec[data-sec="bonus"] summary', e => e.click()); await L.sleep(200);
  await page.$eval('[data-add-bonus]', e => e.click()); await L.sleep(200);
  await page.type('#scBonusList .sc-d-value', '150'); await L.sleep(200);
  L.ok(!!(await page.$('#scBonusList .sc-d-sep')) && await page.$eval('#scBonusList .sc-d-dayl', e => e.hidden), 'o ganho tem “Cai separado do salário” (o dia só aparece ao marcar)');
  await page.$eval('#scBonusList .sc-d-sep', e => e.click()); await L.sleep(200);
  L.ok(await page.$eval('#scBonusList .sc-d-dayl', e => !e.hidden), 'marcando, pede o dia');
  await page.$eval('#scBonusList .sc-d-day', e => { e.value = '1'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(400);
  const res = await L.text(page, '#scResult');
  L.ok(/Líquido do salário[^]*2\.751,40/.test(res) && /Auxílio home office[^]*cai separado, no dia 1[^]*150,00/.test(res) && /Total do mês[^]*2\.901,40/.test(res), 'o resultado separa: salário 2.751,40, auxílio 150 no dia 1 e total 2.901,40');
  await L.submitModal(page); await L.sleep(600);
  L.ok(/Cai separado/.test(await L.text(page, '#modalRoot')), '“Meu salário” avisa o que cai separado');
  await L.submitModal(page); await L.sleep(900);
  await L.closeModal(page); await L.sleep(300);
  let d = await L.db(page);
  const sal = d.forecasts.find(f => f.salary), ben = d.forecasts.find(f => f.benefit);
  L.ok(sal && sal.amount === 2751.4, 'a previsão do salário é só o salário (2.751,40)');
  L.ok(ben && ben.amount === 150 && ben.recurring && ben.date === '2026-11-01' && ben.category === 'outros_receita', 'o auxílio vira uma previsão própria, no dia 1, na categoria Outros');

  L.section('Registrar o benefício antes do salário');
  await L.tab(page, 'dashboard'); await L.sleep(400);
  const card = await L.text(page, '#salaryCard');
  L.ok(/Auxílio home office/.test(card) && /Recebi/.test(card), 'o cartão do salário lista o benefício com “Recebi”');
  await page.$eval('#salaryCard [data-fc-receive]', e => e.click()); await L.sleep(400);
  L.ok(/Registrar recebimento/.test(await L.modalTitle(page)), 'pede confirmação do valor e da conta');
  await L.submitModal(page); await L.sleep(600);
  d = await L.db(page);
  L.ok(d.transactions.filter(t => t.type === 'income' && t.amount === 150).length === 1 && d.transactions[0].category === 'outros_receita', 'registrou R$ 150 como ganho, sem o salário');
  L.ok(!d.transactions.some(t => t.category === 'salario'), 'o salário ainda não foi lançado');
  L.ok(/recebido/.test(await L.text(page, '#salaryCard')), 'e o benefício aparece como recebido neste mês');

  L.section('Confirmar o salário não conta o benefício de novo');
  await page.$eval('#salaryCard [data-salary-confirm]', e => e.click()); await L.sleep(600);
  L.ok(/Auxílio home office[^]*cai separado/.test(await L.text(page, '#scResult')), 'na confirmação o auxílio continua marcado como separado');
  await L.submitModal(page); await L.sleep(900);
  d = await L.db(page);
  const inc = d.transactions.filter(t => t.type === 'income');
  L.ok(inc.length === 2 && inc.some(t => t.category === 'salario' && t.amount === 2751.4) && inc.reduce((s, t) => s + t.amount, 0) === 2901.4, 'o salário entra só com 2.751,40; total do mês 2.901,40, sem duplicar o auxílio');

  L.section('Desmarcar volta a somar no salário');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(400);
  await page.$eval('[data-sp-calc]', e => e.click()); await L.sleep(500);
  await page.$eval('#scBonusList .sc-d-sep', e => e.click()); await L.sleep(400);
  L.ok(/Líquido estimado[^]*2\.901,40/.test(await L.text(page, '#scResult')), 'desmarcado, o líquido volta a incluir o auxílio');
  await L.submitModal(page); await L.sleep(500); await L.submitModal(page); await L.sleep(900);
  await L.closeModal(page); await L.sleep(300);
  d = await L.db(page);
  L.ok(!d.forecasts.some(f => f.benefit) && d.forecasts.find(f => f.salary).salary.steps.some(s => s.net === 2901.4), 'a previsão separada some e o salário passa a 2.901,40');
  L.ok(d.transactions.filter(t => t.type === 'income').length === 2, 'e os ganhos já registrados continuam');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800, isMobile: true, hasTouch: true});
  await L.tab(page, 'dashboard'); await L.sleep(300);
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(400);
  await page.$eval('[data-sp-calc]', e => e.click()); await L.sleep(500);
  await page.$eval('#scBonusList .sc-d-sep', e => e.click()); await L.sleep(300);
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('#scBonusList .sc-d-day', e => e.getBoundingClientRect().height >= 40), 'a opção cabe no celular, com o campo do dia grande o bastante');
});
