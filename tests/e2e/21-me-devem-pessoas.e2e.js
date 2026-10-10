// Me devem agrupado por pessoa, com total por pessoa e "Cobrar tudo".
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'receber');
  const add = async (person, total, desc) => {
    await page.type('#recvPerson', person); await page.type('#recvTotal', String(total));
    if (desc) await page.type('#recvDesc', desc);
    await page.click('#recvForm button[type=submit]'); await L.sleep(250);
  };
  await add('Maria', 100, 'Show');
  await add('João', 30, 'Pizza');
  await add('maría', 50, 'Uber');
  await add('Maria', 20, 'Café');

  const groups = await page.$$eval('#recvGrid .person-group', gs => gs.map(g => ({
    name: g.querySelector('.person-info h4').textContent, items: g.querySelectorAll('.debt-card').length,
    total: g.querySelector('.person-total strong').textContent })));
  L.ok(groups.length === 2, 'um bloco por pessoa (Maria, maría e Maria juntas)');
  const maria = groups.find(g => /maria/i.test(g.name.normalize('NFD').replace(/[̀-ͯ]/g, '')));
  L.ok(maria.items === 3 && L.moneyOf(maria.total) === 170, 'Maria: 3 registros, falta 170');
  L.ok(/3 registro\(s\) · 3 em aberto/.test(await L.text(page, '#recvGrid .person-group')), 'mostra quantos registros e quantos em aberto');
  L.ok(await page.$$eval('#recvGrid .person-group .debt-card h4', h => h.map(x => x.textContent)).then(t => t.includes('Show') && t.includes('Uber')), 'cada registro mostra a descrição como título');
  L.ok(await page.$$eval('[data-recv-charge-all]', b => b.length) === 1, '“Cobrar tudo” só para quem tem mais de uma pendência');

  await page.click('[data-recv-charge-all]'); await L.sleep(200);
  const msg = await page.$eval('#chargeMsg', el => el.value);
  L.ok(/• Show: R\$\s?100,00/.test(msg) && /• Uber: R\$\s?50,00/.test(msg) && /• Café: R\$\s?20,00/.test(msg), 'mensagem lista cada pendência');
  L.ok(/Total em aberto: R\$\s?170,00/.test(msg), 'e o total');
  await L.closeModal(page);

  const d = await L.db(page);
  const joao = d.receivables.find(r => r.person === 'João');
  await page.click('[data-recv-get="' + joao.id + '"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(300);
  L.ok(await page.$eval('#recvGrid .person-group.all-done', g => /tudo recebido/.test(g.textContent)) && /Falta receber\s*R\$\s?0,00/.test(await L.text(page, '#recvGrid .person-group.all-done')), 'quem pagou tudo aparece como “tudo recebido”');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
