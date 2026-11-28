// Ganho que vem junto do salário (auxílio) recebido antes: “Recebi antes” registra, e o “já caiu?” do salário não conta de novo.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const profile = {regime: 'clt', gross: 3000, weeklyHours: 44, dependents: 0, rpps: 14, meiKind: 'services', inssKind: 'normal', simplesRate: 6, otherPct: 0, discounts: [],
    bonuses: [{type: 'homeoffice', mode: 'fixed', value: 150}]};
  await page.evaluate((key, p) => { const k = 'granaleve_prefs_' + key; const cur = JSON.parse(localStorage.getItem(k) || '{}'); cur.workProfile = p; localStorage.setItem(k, JSON.stringify(cur)); }, email.toLowerCase(), profile);
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(300);
  await page.$eval('[data-salary-open]', e => e.click()); await L.sleep(400);
  await page.$eval('input[name=rtype][value=day]', e => e.click());
  await page.$eval('input[name=day]', e => { e.value = '25'; });
  await L.submitModal(page); await L.sleep(900);
  await L.tab(page, 'dashboard'); await L.sleep(400);

  L.section('Cartão compacto com a lista que abre e fecha');
  const altura = () => page.$eval('#salaryCard', e => Math.round(e.getBoundingClientRect().height));
  L.ok(await page.$eval('#salaryCard .sal-details', e => !e.open) && /Ganhos além do salário/.test(await L.text(page, '#salaryCard summary')) && /1 para registrar/.test(await L.text(page, '#salaryCard summary')), 'a lista começa fechada e diz quantos há para registrar');
  const fechado = await altura();
  L.ok(fechado < 170, 'fechado, o cartão é baixo (' + fechado + ' px)');
  await page.click('#salaryCard .sal-details > summary'); await L.sleep(300);
  L.ok(await page.$eval('#salaryCard .sal-details', e => e.open) && (await altura()) > fechado, 'tocar abre a lista');
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(400);
  L.ok(await page.$eval('#salaryCard .sal-details', e => e.open), 'e a escolha é lembrada ao reabrir o app');
  await page.click('#salaryCard .sal-details > summary'); await L.sleep(300);
  await L.reload(page); await L.tab(page, 'dashboard'); await L.sleep(400);
  L.ok(await page.$eval('#salaryCard .sal-details', e => !e.open), 'fechar também é lembrado');
  await page.click('#salaryCard .sal-details > summary'); await L.sleep(300);

  L.section('“Recebi antes” no cartão do salário');
  let card = await L.text(page, '#salaryCard');
  L.ok(/2\.901,40/.test(card) && /Auxílio home office/.test(card) && /junto do salário de novembro/i.test(card), 'o cartão lista o auxílio que vem junto do salário de novembro');
  L.ok(!!(await page.$('#salaryCard [data-extra-got]')), 'com o botão “Recebi antes”');
  await page.$eval('#salaryCard [data-extra-got]', e => e.click()); await L.sleep(500);
  L.ok(/Recebi: Auxílio home office/.test(await L.modalTitle(page)) && Number(await page.$eval('#askAmount', e => e.value.replace(',', '.'))) === 150, 'pede a confirmação com o valor do auxílio');
  await L.submitModal(page); await L.sleep(800);
  let d = await L.db(page);
  let inc = d.transactions.filter(t => t.type === 'income');
  L.ok(inc.length === 1 && inc[0].amount === 150 && inc[0].category === 'outros_receita' && inc[0].description === 'Auxílio home office', 'registra o ganho de R$ 150');
  card = await L.text(page, '#salaryCard');
  L.ok(/2\.751,40/.test(card) && /recebido antes: fora deste salário/.test(card) && !(await page.$('#salaryCard [data-extra-got]')), 'o salário previsto cai para 2.751,40 e o auxílio fica como recebido');
  L.ok(/150,00 já recebido antes: não entra de novo/.test(card), 'o cartão também avisa que ele não entra de novo');

  L.section('“Já caiu” não conta o auxílio de novo');
  await page.$eval('#salaryCard [data-salary-confirm]', e => e.click()); await L.sleep(600);
  const res = await L.text(page, '#scResult');
  L.ok(/já recebido antes: não soma no salário[^]*150,00/.test(res) && /Líquido do salário[^]*2\.751,40/.test(res), 'a confirmação mostra o auxílio descontado e o líquido de 2.751,40');
  const aviso = await L.text(page, '#modalRoot .sc-paid-notice');
  L.ok(/Você já disse que recebeu antes/.test(aviso) && /Auxílio home office[^]*150,00[^]*em 17\/11/.test(aviso) && /não entra de novo/.test(aviso), 'um aviso em destaque diz o que já foi recebido e que não entra de novo');
  L.ok(await page.$eval('#modalRoot .modal-body', e => e.firstElementChild.classList.contains('sc-paid-notice')), 'no alto da janela, antes de tudo');
  L.ok(/Líquido a registrar: R\$\s?2\.751,40 · já sem R\$\s?150,00 recebidos antes/.test(await L.text(page, '#scHeadline')), 'o valor em destaque diz o que vai ser registrado, já sem o recebido');
  await L.submitModal(page); await L.sleep(900);
  d = await L.db(page);
  inc = d.transactions.filter(t => t.type === 'income');
  L.ok(inc.length === 2 && inc.some(t => t.category === 'salario' && t.amount === 2751.4) && Math.round(inc.reduce((s, t) => s + t.amount, 0) * 100) / 100 === 2901.4, 'salário 2.751,40 + auxílio 150 = 2.901,40, sem duplicar');
  L.ok(/150,00\) não foi contado de novo/.test(await L.allToasts(page)), 'e a mensagem final confirma que não foi contado de novo');

  L.section('Apagar o lançamento volta a somar');
  await L.patchDb(page, `u.forecasts.forEach(function(f){ if (f.salary){ f.received = {}; f.salary.months = {}; } }); u.transactions = u.transactions.filter(function(t){ return false; });`, {});
  await L.reload(page); await L.sleep(900); if (await L.modalOpen(page)) await L.closeModal(page);
  await L.tab(page, 'dashboard'); await L.sleep(400);
  L.ok(!!(await page.$('#salaryCard [data-extra-got]')), 'sem o lançamento, o auxílio pode ser registrado de novo');
  L.ok(/2\.901,40/.test(await L.text(page, '#salaryCard')), 'e o salário previsto volta a 2.901,40');
  await page.$eval('#salaryCard [data-salary-confirm]', e => e.click()); await L.sleep(600);
  L.ok(/2\.901,40/.test(await L.text(page, '#scResult')) && !/já recebido antes/.test(await L.text(page, '#scResult')), 'e o salário volta a incluí-lo');
  await L.closeModal(page); await L.sleep(300);

  L.section('Pelo “Meu salário” e no celular');
  await page.$eval('#salaryCard [data-salary-open]', e => e.click()); await L.sleep(500);
  L.ok(/Recebeu algum ganho antes\?/.test(await L.text(page, '#modalRoot')) && !!(await page.$('#modalRoot [data-extra-got]')), '“Meu salário” também oferece registrar');
  await page.$eval('#modalRoot [data-extra-got]', e => e.click()); await L.sleep(500);
  L.ok(/Recebi: Auxílio home office/.test(await L.modalTitle(page)), 'e abre a mesma confirmação');
  await L.closeModal(page); await L.sleep(300);
  await page.setViewport({width: 375, height: 800, isMobile: true, hasTouch: true});
  await L.tab(page, 'dashboard'); await L.sleep(400);
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('#salaryCard [data-extra-got]', e => e.getBoundingClientRect().height >= 40), 'o botão cabe no celular');
});
