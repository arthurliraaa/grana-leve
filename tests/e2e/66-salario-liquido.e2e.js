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
  L.ok(/Equivale a R\$\s?90,00 neste salário/.test(await L.text(page, '#scDiscList .sc-disc-row:nth-child(1) .sc-d-eq')), 'em % mostra quanto dá em reais (3% de R$ 3.000 = R$ 90,00)');
  await L.setVal(page, '#scDiscList .sc-disc-row:nth-child(1) .sc-d-mode', 'fixed'); await L.sleep(200);
  await page.$eval('#scDiscList .sc-disc-row:nth-child(1) .sc-d-value', e => { e.value = '60'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(200);
  L.ok(/Equivale a 2% do salário/.test(await L.text(page, '#scDiscList .sc-disc-row:nth-child(1) .sc-d-eq')), 'em reais mostra quanto dá em % do salário (R$ 60 de R$ 3.000 = 2%)');
  await L.setVal(page, '#scDiscList .sc-disc-row:nth-child(1) .sc-d-mode', 'pct'); await page.$eval('#scDiscList .sc-disc-row:nth-child(1) .sc-d-value', e => { e.value = '3'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(200);
  await page.$eval('[data-add-disc]', e => e.click()); await L.sleep(200);
  await page.$eval('.sc-disc-row:nth-child(2) .sc-d-type', e => { e.value = 'adiantamento'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await page.type('.sc-disc-row:nth-child(2) .sc-d-value', '200'); await L.sleep(250);
  r = await net();
  L.ok(await page.$eval('.sc-disc-row:nth-child(2) .sc-d-var', e => e.checked), 'adiantamento já vem marcado como “varia todo mês”');
  L.ok(/Líquido deste mês\s*R\$\s?2\.461,40/.test(r) && /Líquido fixo \(todo mês\)[\s\S]*R\$\s?2\.661,40/.test(r), 'desconto que varia entra só no líquido do mês; o fixo continua 2.661,40');
  await page.$eval('.sc-disc-row:nth-child(2) .sc-d-del', e => e.click()); await L.sleep(250);
  L.ok(!/Adiantamento/.test(await net()), 'dá para remover um desconto');

  L.section('Desconto pelo benefício');
  await page.$eval('[data-add-disc]', e => e.click()); await L.sleep(200);
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-d-type', e => { e.value = 'vt'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await L.setVal(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-mode', 'benefit'); await L.sleep(250);
  L.ok(await page.$eval('#scDiscList .sc-disc-row:nth-child(2)', e => e.classList.contains('is-benefit')) && !(await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-ben-vt', e => e.hidden)), 'em “pelo benefício” o vale-transporte pede passagem por dia, dias de uso e o % do salário');
  const days = Number(await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-b-days', e => e.value));
  L.ok(days >= 19 && days <= 23, 'os dias de uso já vêm com os dias úteis do mês (' + days + ')');
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-b-days', e => { e.value = '20'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.type('#scDiscList .sc-disc-row:nth-child(2) .sc-b-daily', '5'); await L.sleep(250);
  r = await net();
  L.ok(/Vale do mês: R\$\s?100,00\. Desconto: R\$\s?100,00/.test(await L.text(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-calc')), 'passagem de R$ 5 × 20 dias = vale de R$ 100: o desconto é só os 100 (6% do salário seria 180)');
  L.ok(/Vale-transporte \(6% do salário, até o valor do vale\)\s*− R\$\s?100,00/.test(r), 'o resultado mostra o desconto do vale-transporte pelo benefício');
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-b-daily', e => { e.value = '20'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(250);
  L.ok(/Desconto: R\$\s?180,00/.test(await L.text(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-calc')), 'com vale de R$ 400 o desconto para em 6% do salário (R$ 180)');
  await L.setVal(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-type', 'refeicao'); await L.sleep(250);
  await page.type('#scDiscList .sc-disc-row:nth-child(2) .sc-b-recv', '600'); await L.sleep(250);
  L.ok(/Desconto: R\$\s?120,00 \(20% do benefício\)/.test(await L.text(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-calc')), 'vale-refeição de R$ 600 com 20% de desconto: R$ 120');
  L.section('Desconto por dias do mês');
  await L.setVal(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-type', 'vt');
  await L.setVal(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-mode', 'perday'); await L.sleep(250);
  L.ok(!(await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-ben-day', e => e.hidden)) && await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-ben-vt', e => e.hidden), 'em “por dias do mês” pede o valor cobrado e em quantos dias de uso');
  await page.type('#scDiscList .sc-disc-row:nth-child(2) .sc-p-charged', '21');
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-p-ref', e => { e.value = '21'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-p-days', e => { e.value = '20'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(250);
  L.ok(/R\$\s?1,00 por dia\. Este mês, com 20 dias: R\$\s?20,00/.test(await L.text(page, '#scDiscList .sc-disc-row:nth-child(2) .sc-d-calc')), 'R$ 21 em 21 dias = R$ 1 por dia; num mês de 20 dias o desconto é R$ 20');
  L.ok(/Vale-transporte \(20 dias de uso\)\s*− R\$\s?20,00/.test(await net()), 'o resultado usa o valor do mês');
  await L.closeModal(page);
  await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(300);
  L.ok(await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-d-mode', e => e.value) === 'perday' && await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-p-charged', e => e.value) === '21' && await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-p-ref', e => e.value) === '21', 'o que foi cobrado fica guardado: no mês seguinte já vem preenchido');
  const nd = Number(await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-p-days', e => e.value));
  L.ok(nd >= 19 && nd <= 23, 'e os dias de uso do mês novo vêm com os dias úteis do mês (' + nd + '), então o valor acompanha o mês');
  await page.$eval('#scDiscList .sc-disc-row:nth-child(2) .sc-d-del', e => e.click()); await L.sleep(250);

  L.section('Ganhos além do salário');
  await page.$eval('[data-add-bonus]', e => e.click()); await L.sleep(200);
  await page.type('#scBonusList .sc-d-value', '150'); await L.sleep(250);
  r = await net();
  L.ok(/Auxílio home office · não tributa\s*\+ R\$\s?150,00/.test(r) && /Líquido estimado\s*R\$\s?2\.811,40/.test(r), 'auxílio home office soma ao líquido sem pagar imposto (2.661,40 + 150)');
  await page.$eval('[data-add-bonus]', e => e.click()); await L.sleep(200);
  await page.$eval('#scBonusList .sc-disc-row:nth-child(2) .sc-d-type', e => { e.value = 'bonificacao'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await page.type('#scBonusList .sc-disc-row:nth-child(2) .sc-d-value', '1000'); await L.sleep(250);
  r = await net();
  L.ok(await page.$eval('#scBonusList .sc-disc-row:nth-child(2) .sc-d-var', e => e.checked) && await page.$eval('#scBonusList .sc-disc-row:nth-child(2) .sc-d-tax', e => e.checked), 'bonificação vem como “varia todo mês” e “paga imposto”');
  L.ok(/Líquido fixo \(todo mês\)[\s\S]*R\$\s?2\.811,40/.test(r) && /Líquido deste mês\s*R\$\s?3\.691,40/.test(r), 'a bonificação entra só no líquido do mês (3.691,40); o fixo continua 2.811,40');
  await page.$eval('#scBonusList .sc-disc-row:nth-child(2) .sc-d-del', e => e.click()); await L.sleep(250);

  L.section('Horas extras e repouso');
  await page.type('#scH50', '10'); await page.type('#scH100', '4'); await L.sleep(250);
  r = await net();
  L.ok(/Horas extras 50% \(10 h\)/.test(r) && /Horas extras 100% \(4 h\)/.test(r) && /Descanso semanal/.test(r), 'mostra as horas extras (50% e 100%) e o repouso semanal (DSR)');
  const dsr25 = (await net()).match(/Descanso semanal[^\d]*R\$\s?([\d.,]+)/)[1];
  await page.type('#scWork', '20'); await page.type('#scRest', '10'); await L.sleep(250);
  const dsr20 = (await net()).match(/Descanso semanal[^\d]*R\$\s?([\d.,]+)/)[1];
  L.ok(dsr25 !== dsr20, 'o repouso muda com os dias de trabalho e de descanso informados (' + dsr25 + ' → ' + dsr20 + ')');
  L.ok(/Líquido deste mês/.test(r) && /Líquido fixo \(todo mês\)[\s\S]*R\$\s?2\.811,40/.test(r) && !(await page.$eval('[data-use=month]', e => e.hidden)), 'as horas extras não entram no fixo (2.811,40); oferece usar o líquido do mês só uma vez');
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
  L.ok(Number(await page.$eval('#fcAmount', e => e.value)) === 2811.4, '“Usar o líquido fixo” preenche o valor de Previstas (2.811,40: vale-transporte de 3% e auxílio home office)');

  L.section('Lembra do jeito de trabalhar');
  await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(300);
  L.ok(await page.$eval('#scRegime', e => e.value) === 'clt' && await page.$eval('#scDiscList .sc-d-value', e => e.value) === '3', 'o jeito de trabalhar e os descontos ficam salvos para a próxima vez');
  L.ok(/^3\.?000/.test(await page.$eval('#scGross', e => e.value)), 'o salário bruto também já vem preenchido');
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
