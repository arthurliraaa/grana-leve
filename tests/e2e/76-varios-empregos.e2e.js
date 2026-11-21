// Mais de um emprego: cada um com o seu salário, descontos e previsão; a calculadora soma o líquido fixo de todos.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  const abrir = async () => { await L.tab(page, 'lancamentos'); await page.$eval('#forecastToggle', e => { if (e.getAttribute('aria-expanded') !== 'true') e.click(); }); await L.sleep(250); await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(500); };
  const soma = () => L.text(page, '#scJobsSum');
  const prefs = () => page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^granaleve_prefs_/.test(x)); return JSON.parse(localStorage.getItem(k) || '{}'); });

  L.section('Calculadora: o segundo emprego');
  await abrir();
  L.ok(!!(await page.$('[data-job-add]')) && !(await page.$('#scJob')), 'com um emprego só, a calculadora oferece “Tenho mais de um emprego” e não mostra seletor');
  await page.type('#scGross', '3000'); await L.sleep(300);
  await page.$eval('[data-job-add]', e => e.click()); await L.sleep(700);
  L.ok(!!(await page.$('#scJob')) && (await page.$$eval('#scJob option', o => o.length)) === 3 && await page.$eval('#scJobName', e => e.value) === 'Emprego 2', 'adicionar cria o “Emprego 2” (já ativo) e abre o seletor com os dois e “Adicionar outro”');
  L.ok(await page.$eval('#scGross', e => e.value) === '', 'o novo emprego começa vazio (o primeiro continua guardado)');
  await page.type('#scGross', '2000'); await L.sleep(300);
  await page.$eval('#scJobName', e => { e.value = ''; }); await page.type('#scJobName', 'Escola'); await L.sleep(300);
  const t = await soma();
  L.ok(/Emprego principal/.test(t) && /Escola/.test(t) && /R\$\s?2\.751,40/.test(t) && /R\$\s?1\.844,31/.test(t) && /R\$\s?4\.595,71/.test(t), 'mostra o líquido fixo de cada emprego e o total somado (2.751,40 + 1.844,31 = 4.595,71)');
  L.ok(/à parte/.test(t) && /estimativa/.test(t), 'avisa que cada emprego é calculado à parte e que é estimativa');

  L.section('Trocar de emprego');
  await L.setVal(page, '#scJob', 'j1'); await L.sleep(800);
  L.ok(await page.$eval('#scGross', e => e.value) === '3000' && await page.$eval('#scJobName', e => e.value) === 'Emprego principal', 'trocar para o primeiro emprego traz o salário dele de volta');
  L.ok(!(await page.$eval('[data-use=jobs]', e => e.hidden)), 'com dois empregos calculados aparece “Usar o total dos empregos”');
  await page.$eval('[data-use=jobs]', e => e.click()); await L.sleep(500);
  L.ok(Number(await page.$eval('#fcAmount', e => e.value)) === 4595.71, 'usar o total preenche o campo com a soma (R$ 4.595,71)');
  const p = await prefs();
  L.ok(p.workJobs && p.workJobs.list.length === 2 && p.workJobs.list[1].name === 'Escola' && p.workJobs.list[1].profile.gross === 2000, 'os dois empregos ficam guardados (o segundo se chama “Escola”)');

  L.section('Início e Meu salário por emprego');
  await L.tab(page, 'dashboard'); await L.sleep(700);
  L.ok(/2 empregos somados/.test(await L.text(page, '#salaryCard')) && /4\.595,71/.test(await L.text(page, '#salaryCard')), 'o Início convida a prever o salário e diz que são 2 empregos somados');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(500);
  L.ok(/Meu salário · /.test(await L.modalTitle(page)) && !!(await page.$('#spJob')), 'Meu salário mostra de qual emprego é e o seletor');
  await page.$eval('input[name=rtype][value=day]', e => e.click()); await page.$eval('input[name=day]', e => { e.value = '28'; });
  await L.submitModal(page); await L.sleep(900);
  let d = await L.db(page);
  const planos = d.forecasts.filter(f => f.salary);
  L.ok(planos.length === 1 && planos[0].salary.jobId === 'j1' && planos[0].description === 'Salário · Emprego principal' && planos[0].amount === 2751.4, 'a previsão é do emprego (só dele: R$ 2.751,40, todo dia 28)');
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(500);
  await L.setVal(page, '#spJob', 'j2'); await L.sleep(700);
  L.ok(/Escola/.test(await L.modalTitle(page)), 'trocar o emprego em Meu salário reabre a tela do outro');
  await page.$eval('input[name=rtype][value=day]', e => e.click()); await page.$eval('input[name=day]', e => { e.value = '10'; });
  await L.submitModal(page); await L.sleep(900);
  d = await L.db(page);
  const dois = d.forecasts.filter(f => f.salary);
  L.ok(dois.length === 2 && dois.find(f => f.salary.jobId === 'j2').amount === 1844.31, 'cada emprego tem a sua previsão (Escola: R$ 1.844,31, todo dia 10)');
  L.ok(/\(Escola\) deveria ter caído/.test(await L.text(page, '#salaryCard')) && await page.$eval('[data-salary-confirm]', e => e.getAttribute('data-salary-confirm')) === dois.find(f => f.salary.jobId === 'j2').id, 'o dia 10 já passou: o Início pergunta “já caiu?” do salário certo (Escola), com o nome do emprego');
  await page.$eval('[data-salary-confirm]', e => e.click()); await L.sleep(900);
  L.ok(/O salário de .* \(Escola\) caiu\?/.test(await L.modalTitle(page)) && await page.$eval('#scGross', e => e.value) === '2000', 'a confirmação abre com o emprego e o salário certos (R$ 2.000)');
  await L.closeModal(page); await L.sleep(300);

  L.section('Remover um emprego');
  await abrir();
  await L.setVal(page, '#scJob', 'j2'); await L.sleep(800);
  await page.$eval('[data-job-del]', e => e.click()); await L.sleep(500);
  await page.$eval('#modalRoot [type=submit]', e => e.click()); await L.sleep(900);
  const p2 = await prefs();
  L.ok(p2.workJobs.list.length === 1 && p2.workJobs.list[0].id === 'j1', 'remover o emprego tira só ele da calculadora');
  L.ok(!!(await page.$('[data-job-add]')) && !(await page.$('#scJob')), 'e volta ao modo de um emprego só');
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela');
});
