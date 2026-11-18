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

  L.section('Horas extras');
  await page.type('#scH50', '10'); await page.type('#scH100', '4'); await L.sleep(250);
  r = await net();
  L.ok(/Horas extras 50% \(10 h\)/.test(r) && /Horas extras 100% \(4 h\)/.test(r) && /Descanso semanal/.test(r), 'mostra as horas extras (50% e 100%) e o reflexo no descanso semanal');
  L.ok(/líquido fixo é de R\$\s?2\.751,40/.test(r) && !(await page.$eval('[data-use=total]', e => e.hidden)), 'diz o líquido fixo (sem as extras) e oferece usar o líquido com elas');

  L.section('Jeito de trabalhar');
  await L.setVal(page, '#scRegime', 'mei'); await L.sleep(250);
  L.ok(await page.$eval('[data-for="clt,servidor"]', e => e.hidden) && /DAS do MEI\s*− R\$\s?86,05/.test(await net()), 'MEI: some a parte de CLT e entra o DAS (serviços R$ 86,05)');
  await L.setVal(page, '#scRegime', 'pj'); await L.sleep(250);
  L.ok(/Simples \(6%\)\s*− R\$\s?180,00/.test(await net()), 'PJ no Simples: 6% de imposto');
  await L.setVal(page, '#scRegime', 'clt'); await L.sleep(250);

  L.section('Usar o líquido');
  await page.$eval('#modalRoot form', f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', {cancelable: true}))); await L.sleep(400);
  L.ok(Number(await page.$eval('#fcAmount', e => e.value)) === 2751.4, '“Usar o líquido fixo” preenche o valor de Previstas (2.751,40)');

  L.section('Lembra do jeito de trabalhar');
  await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(300);
  L.ok(await page.$eval('#scRegime', e => e.value) === 'clt', 'a escolha fica salva para a próxima vez');
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
