// Vale-alimentação: o saldo só conta o crédito do mês depois que cai; botões “Já caiu” (antes do dia) e “Ainda não caiu”.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes'); await L.sleep(300);
  const saldo = async () => (await L.text(page, '#voucherList .goal-figs strong')).replace(/\s/g, ' ');

  L.section('Vale que cai dia 25 (hoje é 17/11): ainda não caiu');
  await page.type('#vName', 'VR'); await page.type('#vAmount', '800'); await page.type('#vDay', '25');
  await page.click('#voucherForm button[type=submit]'); await L.sleep(500);
  L.ok(/R\$ 0,00/.test(await saldo()), 'o saldo não conta o crédito que ainda não caiu (R$ 0,00)');
  L.ok(/ainda não caiu/.test(await L.text(page, '#voucherList .voucher-status')) && !!(await page.$('#voucherList [data-voucher-got]')), 'o cartão mostra “ainda não caiu” com o botão “Já caiu”');

  L.section('Caiu antes');
  await page.$eval('#voucherList [data-voucher-got]', e => e.click()); await L.sleep(400);
  L.ok(/O vale VR caiu/.test(await L.modalTitle(page)) && await page.$eval('#vgDate', e => e.value) === '2026-11-17', 'confirma com o dia de hoje');
  await page.$eval('#vgDate', e => { e.value = '2026-11-16'; });
  await L.submitModal(page); await L.sleep(600);
  L.ok(/R\$ 800,00/.test(await saldo()), 'o saldo passa a R$ 800,00');
  L.ok(/caiu em 16\/11/.test(await L.text(page, '#voucherList .voucher-status')) && !!(await page.$('#voucherList [data-voucher-notyet]')), 'mostra “caiu em 16/11” e “Ainda não caiu”');
  L.ok((await L.db(page)).vouchers[0].credited['2026-11'] === '2026-11-16', 'a marcação fica guardada');

  L.section('Ainda não caiu');
  await page.$eval('#voucherList [data-voucher-notyet]', e => e.click()); await L.sleep(600);
  L.ok(/R\$ 0,00/.test(await saldo()) && /ainda não caiu/.test(await L.text(page, '#voucherList .voucher-status')), 'volta a não contar');

  L.section('Dia já passado, mas não caiu');
  await page.type('#vName', 'Alelo'); await page.type('#vAmount', '300'); await page.type('#vDay', '5');
  await page.click('#voucherForm button[type=submit]'); await L.sleep(600);
  const card = '#voucherList > .goal-card:nth-child(2)';
  L.ok(/R\$ 300,00/.test((await L.text(page, card + ' .goal-figs strong')).replace(/\s/g, ' ')) && /caiu em 05\/11/.test(await L.text(page, card)), 'dia 5 já passou: conta (caiu em 05/11)');
  await page.$eval(card + ' [data-voucher-notyet]', e => e.click()); await L.sleep(600);
  L.ok(/R\$ 0,00/.test((await L.text(page, card + ' .goal-figs strong')).replace(/\s/g, ' ')), 'tocar em “Ainda não caiu” tira o crédito mesmo com o dia passado');

  L.section('Sem dia informado, como antes');
  await page.type('#vName', 'VA'); await page.type('#vAmount', '200');
  await page.click('#voucherForm button[type=submit]'); await L.sleep(600);
  const c3 = '#voucherList > .goal-card:nth-child(3)';
  L.ok(/R\$ 200,00/.test((await L.text(page, c3 + ' .goal-figs strong')).replace(/\s/g, ' ')) && /contado desde o dia 1/.test(await L.text(page, c3)), 'conta desde o dia 1, com a dica de informar o dia');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800, isMobile: true, hasTouch: true});
  await L.tab(page, 'cartoes'); await L.sleep(300);
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('#voucherList [data-voucher-got]', e => e.getBoundingClientRect().height >= 40), 'cabe no celular, com botão de tamanho de toque');
});
