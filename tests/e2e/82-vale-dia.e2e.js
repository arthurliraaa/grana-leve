// Vale-alimentação: o dia em que o vale cai (cadastro, edição, cartão, calendário e avisos).
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes'); await L.sleep(300);

  L.section('Cadastrar com o dia em que cai');
  await page.type('#vName', 'VR'); await page.type('#vAmount', '800');
  await page.type('#vDay', '40');
  await page.click('#voucherForm button[type=submit]'); await L.sleep(300);
  L.ok(await page.$eval('#vDay', e => !e.validity.valid) && (await L.db(page)).vouchers.length === 0, 'um dia fora de 1 a 31 é recusado (o próprio campo avisa) e nada é salvo');
  await page.$eval('#vDay', e => { e.value = ''; }); await page.type('#vDay', '5');
  await L.sleep(350);
  await page.click('#voucherForm button[type=submit]'); await L.sleep(500);
  const d = await L.db(page);
  L.ok(d.vouchers.length === 1 && d.vouchers[0].creditDay === 5, 'o vale é salvo com o dia 5');
  const card = await L.text(page, '#voucherList');
  L.ok(/Cai todo dia 5/.test(card) && /05\/12\/2026/.test(card) && /em 18 dias/.test(card), 'o cartão mostra “Cai todo dia 5 · próximo em 05/12/2026 (em 18 dias)”');

  L.section('Sem o dia, nada muda');
  await page.type('#vName', 'Alelo'); await page.type('#vAmount', '300');
  await page.click('#voucherForm button[type=submit]'); await L.sleep(500);
  const alelo = (await L.db(page)).vouchers.find(v => v.name === 'Alelo');
  L.ok(alelo && alelo.creditDay === undefined, 'vale sem o dia continua como antes');
  L.ok((await L.text(page, '#voucherList')).match(/Cai todo dia/g).length === 1, 'e não mostra a linha do dia');

  L.section('Editar o dia');
  await page.$eval('[data-voucher-edit]', e => e.click()); await L.sleep(300);
  L.ok(await page.$eval('#evDay', e => e.value) === '5', 'a edição abre com o dia 5');
  await page.$eval('#evDay', e => { e.value = '20'; });
  await L.submitModal(page); await L.sleep(400);
  const t2 = await L.text(page, '#voucherList');
  L.ok(/Cai todo dia 20/.test(t2) && /20\/11\/2026/.test(t2) && /em 3 dias/.test(t2), 'passa a cair dia 20 (próximo em 3 dias)');
  await page.$eval('[data-voucher-edit]', e => e.click()); await L.sleep(300);
  await page.$eval('#evDay', e => { e.value = '99'; });
  await L.submitModal(page); await L.sleep(300);
  L.ok(/vai de 1 a 31/.test(await L.modalError(page)), 'na edição, dia inválido é recusado');
  await page.$eval('#evDay', e => { e.value = ''; });
  await L.submitModal(page); await L.sleep(400);
  L.ok(!/Cai todo dia/.test(await L.text(page, '#voucherList')), 'apagar o dia tira a linha do cartão');
  await page.$eval('[data-voucher-edit]', e => e.click()); await L.sleep(300);
  await page.$eval('#evDay', e => { e.value = '20'; });
  await L.submitModal(page); await L.sleep(400);

  L.section('Calendário');
  await L.tab(page, 'lancamentos'); await L.sleep(200);
  await page.$eval('[data-txview="cal"]', e => e.click()); await L.sleep(400);
  await page.$eval('[data-cal-day="2026-11-20"]', e => e.click()); await L.sleep(400);
  L.ok(/VR/.test(await L.text(page, '.cal-events')) && /Vale cai/.test(await L.text(page, '.cal-events')), 'no dia 20 o calendário mostra “Vale cai: VR”');

  L.section('Avisos');
  await L.tab(page, 'perfil'); await L.sleep(300);
  L.ok(!!(await page.$('[data-push-kind="voucher"]')) && /Vale-alimentação/.test(await L.text(page, '.rem-kinds')), 'Perfil oferece avisar o dia em que o vale cai');
  await page.$eval('#noticesBtn', e => e.click()); await L.sleep(400);
  const n = await L.text(page, '#modalRoot');
  L.ok(/Vale-alimentação/.test(n) && /O vale VR cai hoje/.test(n) && /dia 20\/11 às 9h/.test(n), 'a central de avisos lista o aviso do vale (dia 20/11, 9h)');
  L.ok(!/R\$/.test(n), 'sem valores em reais');
});
