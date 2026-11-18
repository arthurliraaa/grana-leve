// Calculadora de salário líquido: abre de Previstas, do simulador (ganho) e do formulário de ganho; muda com o jeito de trabalhar.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const net = () => L.text(page, '#scResult');

  L.section('Previstas');
  await L.tab(page, 'lancamentos');
  await page.$eval('#forecastToggle', e => e.click()).catch(() => {}); await L.sleep(200);
  await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(300);
  L.ok(/Calcular o salário líquido/.test(await L.modalTitle(page)), 'em Previstas há “Calcular o líquido do salário”');
  await page.type('#scGross', '3.000'); await L.sleep(250);
  let r = await net();
  L.ok(/INSS\s*− R\$\s?248,60/.test(r) && /Líquido estimado\s*R\$\s?2\.751,40/.test(r), 'CLT de R$ 3.000: INSS de 248,60 e líquido de 2.751,40 (imposto de renda zerado)');
  L.ok(/FGTS/.test(r) && /Confira no seu holerite/.test(await L.text(page, '#modalRoot')), 'avisa que é estimativa e que o FGTS é da empresa');

  L.section('Descontos por tipo');
  await page.$eval('[data-add-disc]', e => e.click()); await L.sleep(200);
  await L.setVal(page, '.sc-d-type', 'vt'); await L.setVal(page, '.sc-d-mode', 'pct');
  await page.type('.sc-d-value', '3'); await L.sleep(250);
  r = await net();
  L.ok(/Vale-transporte \(3%\)\s*− R\$\s?90,00/.test(r) && /Líquido estimado\s*R\$\s?2\.661,40/.test(r), 'vale-transporte em % (3%, não os 6% fixos): desconta R$ 90,00 e o líquido é 2.661,40');
  await page.$eval('[data-add-disc]', e => e.click()); await L.sleep(200);
  await page.$eval('.sc-disc-row:nth-child(2) .sc-d-type', e => { e.value = 'adiantamento'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await page.type('.sc-disc-row:nth-child(2) .sc-d-value', '200'); await L.sleep(250);
  r = await net();
  L.ok(await page.$eval('.sc-disc-row:nth-child(2) .sc-d-var', e => e.checked), 'adiantamento já vem marcado como “varia todo mês”');
  L.ok(/Líquido deste mês\s*R\$\s?2\.461,40/.test(r) && /Líquido fixo \(todo mês\)[\s\S]*R\$\s?2\.661,40/.test(r), 'desconto que varia entra só no líquido do mês; o fixo continua 2.661,40');
  await page.$eval('.sc-disc-row:nth-child(2) .sc-d-del', e => e.click()); await L.sleep(250);
  L.ok(!/Adiantamento/.test(await net()), 'dá para remover um desconto');

  L.section('Horas extras e repouso');
  await page.type('#scH50', '10'); await page.type('#scH100', '4'); await L.sleep(250);
  r = await net();
  L.ok(/Horas extras 50% \(10 h\)/.test(r) && /Horas extras 100% \(4 h\)/.test(r) && /Descanso semanal/.test(r), 'mostra as horas extras (50% e 100%) e o repouso semanal (DSR)');
  const dsr25 = (await net()).match(/Descanso semanal[^\d]*R\$\s?([\d.,]+)/)[1];
  await page.type('#scWork', '20'); await page.type('#scRest', '10'); await L.sleep(250);
  const dsr20 = (await net()).match(/Descanso semanal[^\d]*R\$\s?([\d.,]+)/)[1];
  L.ok(dsr25 !== dsr20, 'o repouso muda com os dias de trabalho e de descanso informados (' + dsr25 + ' → ' + dsr20 + ')');
  L.ok(/Líquido deste mês/.test(r) && /Líquido fixo \(todo mês\)[\s\S]*R\$\s?2\.661,40/.test(r) && !(await page.$eval('[data-use=month]', e => e.hidden)), 'as horas extras não entram no fixo (2.661,40); oferece usar o líquido do mês só uma vez');
  await page.$eval('#scWork', e => { e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.$eval('#scRest', e => { e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.$eval('#scH50', e => { e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.$eval('#scH100', e => { e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(250);

  L.section('Jeito de trabalhar');
  await L.setVal(page, '#scRegime', 'mei'); await L.sleep(250);
  L.ok(await page.$eval('[data-for="clt,servidor"]', e => e.hidden) && /DAS do MEI\s*− R\$\s?86,05/.test(await net()), 'MEI: some a parte de CLT e entra o DAS (serviços R$ 86,05)');
  await L.setVal(page, '#scRegime', 'pj'); await L.sleep(250);
  L.ok(/Simples \(6%\)\s*− R\$\s?180,00/.test(await net()), 'PJ no Simples: 6% de imposto');
  await L.setVal(page, '#scRegime', 'clt'); await L.sleep(250);

  L.section('Usar o líquido');
  await page.$eval('#modalRoot form', f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', {cancelable: true}))); await L.sleep(400);
  L.ok(Number(await page.$eval('#fcAmount', e => e.value)) === 2661.4, '“Usar o líquido fixo” preenche o valor de Previstas (2.661,40, com o vale-transporte de 3%)');

  L.section('Lembra do jeito de trabalhar');
  await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(300);
  L.ok(await page.$eval('#scRegime', e => e.value) === 'clt' && await page.$eval('.sc-d-value', e => e.value) === '3', 'o jeito de trabalhar e os descontos ficam salvos para a próxima vez');
  await L.closeModal(page);

  L.section('Simulador e formulário de ganho');
  await page.$eval('#segbtn-simular', e => e.click()); await L.sleep(300);
  await page.click('input[name=kind][value=ganho]'); await L.sleep(150);
  L.ok(!!(await page.$('[data-salary-calc="simIncAmount"]')), 'o simulador (ganho) também tem “É salário? Calcular o líquido”');
  await page.$eval('#segbtn-lanc', e => e.click()); await L.sleep(200);
  await page.$eval('[data-type="income"]', e => e.click()); await L.sleep(150);
  L.ok(!(await page.$eval('#txSalaryLink', e => e.hidden)), 'no formulário de ganho aparece o atalho do salário');
  await page.$eval('[data-type="expense"]', e => e.click()); await L.sleep(150);
  L.ok(await page.$eval('#txSalaryLink', e => e.hidden), 'e some no formulário de gasto');
  await page.setViewport({width: 360, height: 760}); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
