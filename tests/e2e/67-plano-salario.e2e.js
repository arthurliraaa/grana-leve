// Meu salário: prever o salário todo mês (dia útil ou dia fixo), perguntar “já caiu?” com os valores do mês,
// reajustes e evolução; o líquido calculado também serve de salário de costume no simulador.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const profile = {regime: 'clt', gross: 3000, weeklyHours: 44, dependents: 0, rpps: 14, meiKind: 'services', inssKind: 'normal', simplesRate: 6, otherPct: 0, discounts: [{type: 'vt', mode: 'fixed', value: 90, varies: false}], bonuses: []};
  await page.evaluate((key, p) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.workProfile = p; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase(), profile);
  await L.reload(page);

  L.section('Simular: usa o líquido calculado');
  await page.$eval('.sidenav [data-tab="lancamentos"]', e => e.click()); await L.sleep(150);
  await page.$eval('#segbtn-simular', e => e.click()); await L.sleep(300);
  const simSal = await page.$eval('input[name=usesal]', e => e.closest('label').textContent.replace(/\s+/g, ' ')).catch(() => '');
  L.ok(/líquido que você calculou na calculadora do salário/.test(simSal) && /2\.661,40/.test(simSal), 'sem meses de salário lançados, o simulador usa o líquido calculado (R$ 2.661,40) e diz de onde vem');

  L.section('Início: convite para prever o salário');
  await L.tab(page, 'dashboard'); await L.sleep(200);
  L.ok(!(await page.$eval('#salaryCard', e => e.hidden)) && /Você calculou o seu salário líquido: R\$\s?2\.661,40/.test(await L.text(page, '#salaryCard')), 'o Início convida a prever o salário calculado');

  L.section('Quando cai');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  L.ok(/Meu salário/.test(await L.modalTitle(page)) && await page.$eval('input[name=rtype][value=workday]', e => e.checked) && await page.$eval('input[name=n]', e => e.value) === '5', 'abre “Meu salário” com o 5º dia útil como padrão');
  await L.submitModal(page); await L.sleep(900);

  L.section('Já caiu?');
  L.ok(/O salário de novembro de 2026 caiu\?/.test(await L.modalTitle(page)), 'a data (5º dia útil = 06/11) já passou: pergunta se o salário caiu');
  L.ok(/no 5º dia útil \(06\/11\/2026\)/.test(await L.text(page, '.sc-confirm-intro')), 'diz a regra e a data prevista');
  L.ok(!!(await page.$('#scSa')) && !!(await page.$('[data-add-disc]')), 'dá para acrescentar sobreaviso, extras e descontos do mês');
  await page.type('#scSa', '30');
  await page.$eval('[data-add-disc]', e => e.click()); await L.sleep(150);
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-d-type', e => { e.value = 'saude'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await page.type('#scDiscList .sc-disc-row:nth-child(2) .sc-d-value', '40'); await L.sleep(300);
  const res = await L.text(page, '#scResult');
  L.ok(/Sobreaviso \(30 h\)/.test(res) && /Plano de saúde\s*− R\$\s?40,00/.test(res), 'o líquido do mês traz o sobreaviso e a parte usada do plano de saúde');
  const month = Number((await page.$eval('#scResult tr.net:not(.fixed) td:last-child', e => e.textContent)).replace(/[^\d,]/g, '').replace(',', '.'));
  await L.submitModal(page); await L.sleep(600);
  const d = await L.db(page);
  const inc = d.transactions.filter(t => t.type === 'income' && t.category === 'salario');
  L.ok(inc.length === 1 && inc[0].amount === month && month > 2661.4, 'registrou o ganho com o líquido do mês (R$ ' + month + ')');
  const f = d.forecasts.find(x => x.salary);
  L.ok(f && f.received['2026-11'] === month && f.salary.months['2026-11'].gross === 3000 && f.salary.steps.length === 1, 'a previsão ficou como recebida e o mês entrou na evolução');

  L.section('Próximo salário');
  L.ok(/próximo no 5º dia útil: 05\/12\/2026/.test(await L.text(page, '#salaryCard')), 'o Início mostra o próximo salário (05/12/2026)');
  L.ok(await page.$eval('#salaryCard', e => !/Já caiu/.test(e.textContent)), 'não pergunta de novo: já foi confirmado');

  L.section('Reajuste e evolução');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  L.ok(/Evolução do salário/.test(await L.text(page, '#modalRoot')) && /novembro\/2026/.test(await L.text(page, '.sp-evo')), 'a evolução lista o mês recebido');
  await page.$eval('[data-sp-calc]', e => e.click()); await L.sleep(400);
  await page.$eval('#scGross', e => { e.value = '3300'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(250);
  await L.submitModal(page); await L.sleep(400);
  L.ok(/Meu salário/.test(await L.modalTitle(page)), 'depois de recalcular volta para “Meu salário”');
  await L.submitModal(page); await L.sleep(500);
  const d2 = await L.db(page), f2 = d2.forecasts.find(x => x.salary);
  L.ok(f2.salary.steps.length === 2 && f2.salary.steps[1].from === '2026-12' && f2.salary.steps[1].gross === 3300, 'o reajuste vale a partir de dezembro (novembro já foi recebido e não muda)');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  L.ok(/Reajuste em dezembro\/2026/.test(await L.text(page, '.sp-raises')) && /\+10%/.test(await L.text(page, '.sp-raises')), 'o reajuste aparece na evolução (+10%)');
  await L.closeModal(page);

  L.section('Outro aparelho');
  await page.evaluate(key => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); delete cur.workProfile; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase());
  await L.reload(page); await L.sleep(300);
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(300);
  L.ok(/Salário bruto R\$\s?3\.300,00/.test(await L.text(page, '#spCalc')), 'sem o perfil neste aparelho, ele volta da previsão (que sincroniza com a conta): salário bruto de R$ 3.300,00');
  await L.closeModal(page);

  L.section('Celular');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
