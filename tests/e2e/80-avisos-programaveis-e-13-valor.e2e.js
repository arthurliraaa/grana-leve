// Avisos programáveis (Perfil): tipos com antecedência, horário e avisos próprios; e o 13º informado por valor na calculadora.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const prefs = () => page.evaluate(key => JSON.parse(localStorage.getItem('granaleve_prefs_' + key) || '{}'), email.toLowerCase());

  L.section('Perfil: o que avisar, antecedência e horário');
  await L.tab(page, 'perfil'); await L.sleep(300);
  L.ok(!!(await page.$('[data-push-lead="invoice"]')) && !!(await page.$('[data-push-hour]')) && !!(await page.$('[data-rem-add]')), 'mesmo sem os avisos ligados no servidor, dá para programar');
  L.ok(/ainda não foram ligados/.test(await L.text(page, '#tab-perfil')) && !(await page.$('#pfPushOn')), 'e o cartão explica que ligar ainda não é possível');
  await L.setVal(page, '[data-push-lead="invoice"]', '3');
  await L.setVal(page, '[data-push-hour]', '18'); await L.sleep(200);
  let p = await prefs();
  L.ok(p.reminderRules && p.reminderRules.lead.invoice === 3 && p.reminderRules.hour === 18, 'a antecedência da fatura (3 dias) e o horário (18h) são guardados');
  L.ok(p.syncedAt && p.syncedAt.reminderRules > 0, 'e marcados para acompanhar a conta entre aparelhos');
  await page.$eval('[data-push-kind="bill"]', e => e.click()); await L.sleep(200);
  p = await prefs();
  L.ok(p.reminderRules.kinds.bill === false, 'desligar “conta fixa” fica guardado');

  L.section('Programar um aviso');
  await page.$eval('[data-rem-add]', e => e.click()); await L.sleep(300);
  L.ok(/Programar um aviso/.test(await L.modalTitle(page)), 'abre “Programar um aviso”');
  await L.setVal(page, '#rmType', 'custom');
  await L.submitModal(page); await L.sleep(200);
  L.ok(/Escreva o texto do aviso/.test(await L.modalError(page)), 'o lembrete com texto próprio exige o texto');
  await page.type('#rmTitle', 'Pagar a escola');
  await L.setVal(page, '#rmRepeat', 'once'); await L.sleep(100);
  L.ok(await page.$eval('[data-rm="once"]', e => !e.hidden) && await page.$eval('[data-rm="monthly"]', e => e.hidden), 'só os campos do tipo de repetição escolhido aparecem');
  await page.$eval('#rmDate', e => { e.value = '2026-12-05'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await L.setVal(page, '#rmHour', '8');
  await L.submitModal(page); await L.sleep(400);
  p = await prefs();
  L.ok(p.reminderRules.custom.length === 1 && p.reminderRules.custom[0].title === 'Pagar a escola' && p.reminderRules.custom[0].date === '2026-12-05' && p.reminderRules.custom[0].hour === 8, 'o aviso é guardado (uma vez, 05/12, 8h)');
  L.ok(/Pagar a escola/.test(await L.text(page, '.rem-list')) && /05\/12\/2026 às 8h/.test(await L.text(page, '.rem-list')), 'aparece em “Meus avisos” com quando acontece');

  await page.$eval('[data-rem-add]', e => e.click()); await L.sleep(300);
  await L.setVal(page, '#rmType', 'expense');
  await L.setVal(page, '#rmRepeat', 'monthly'); await L.sleep(100);
  await page.$eval('#rmDay', e => { e.value = '5'; });
  await L.submitModal(page); await L.sleep(400);
  p = await prefs();
  L.ok(p.reminderRules.custom.length === 2 && p.reminderRules.custom[1].type === 'expense' && p.reminderRules.custom[1].day === 5, 'o aviso mensal “lançar os gastos” no dia 5 também é guardado');

  L.section('Ligar, editar e excluir');
  await page.$eval('[data-rem-toggle]', e => e.click()); await L.sleep(300);
  p = await prefs();
  L.ok(p.reminderRules.custom[0].enabled === false, 'dá para desligar um aviso sem apagá-lo');
  await page.$eval('[data-rem-edit]', e => e.click()); await L.sleep(300);
  L.ok(/Editar o aviso/.test(await L.modalTitle(page)) && await page.$eval('#rmTitle', e => e.value) === 'Pagar a escola', 'editar abre o aviso com os dados dele');
  await page.$eval('#rmTitle', e => { e.value = 'Pagar a escola e o curso'; });
  await L.submitModal(page); await L.sleep(300);
  p = await prefs();
  L.ok(p.reminderRules.custom[0].title === 'Pagar a escola e o curso' && p.reminderRules.custom[0].enabled === false, 'a edição vale e mantém o aviso desligado');
  await page.$eval('[data-rem-del]', e => e.click()); await L.sleep(300);
  L.ok(/Excluir este aviso/.test(await L.modalTitle(page)), 'excluir pede confirmação');
  await L.submitModal(page); await L.sleep(300);
  p = await prefs();
  L.ok(p.reminderRules.custom.length === 1 && p.reminderRules.custom[0].type === 'expense', 'excluído');

  L.section('13º por valor na calculadora');
  await L.tab(page, 'dashboard'); await L.sleep(200);
  await L.tab(page, 'lancamentos'); await L.sleep(200);
  await page.$eval('#forecastToggle', e => e.click()); await L.sleep(300);
  await page.$eval('[data-salary-calc="fcAmount"]', e => e.click()); await L.sleep(500);
  await page.type('#scGross', '3000'); await L.sleep(400);
  await page.$eval('.sc-extra summary', e => e.click()); await L.sleep(300);
  L.ok(!!(await page.$('#scTV')) && /não sabe a média/i.test(await L.text(page, '.sc-extra-body')), 'a parte do 13º oferece “Já sabe o valor do 13º?”');
  L.ok(/1ª parcela[^]*1\.500,00/.test(await L.text(page, '#scExtraRes')), 'sem o valor, o 13º sai pelo salário (1ª parcela R$ 1.500,00)');
  await page.type('#scTV', '4000'); await L.sleep(500);
  const t = await L.text(page, '#scExtraRes');
  L.ok(/valor informado/.test(t) && /1ª parcela[^]*2\.000,00/.test(t), 'com o valor informado, o 13º usa R$ 4.000 (1ª parcela R$ 2.000,00)');
  L.ok(/INSS[^]*368,60/.test(t), 'e o INSS é calculado sobre ele (R$ 368,60)');
});
