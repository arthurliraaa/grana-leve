// Simulador: gasto mês a mês, salário registrado nos meses anteriores e fatura (fechamento e vencimento) do cartão.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.tab(page, 'cartoes');
  await page.type('#accName', 'Nubank'); await page.type('#accBalance', '1.000');
  await page.click('#accountForm button[type=submit]'); await L.sleep(250);
  await L.addCard(page, 'Inter', 3000, 28, 5);
  const mk = (o, d) => { const x = new Date(); const y = new Date(x.getFullYear(), x.getMonth() + o, d); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
  await L.patchDb(page, `[1, 2, 3].forEach(i => u.transactions.push({id: 'sal' + i, type: 'income', amount: 3000, category: 'salario', date: arg['m' + i], description: 'Salário', createdAt: 1}));`, {m1: mk(-1, 5), m2: mk(-2, 5), m3: mk(-3, 5)});
  const d = await L.db(page);
  await L.tab(page, 'lancamentos'); await page.$eval('#segbtn-simular', e => e.click()); await L.sleep(300);
  L.ok(/Simular gasto ou ganho/.test(await L.text(page, '#simPanel .sim-title')), 'a guia Simular mostra “Simular gasto ou ganho”');
  await page.type('#simName', 'Notebook'); await page.type('#simAmount', '1.200');
  await L.setVal(page, '#simPay', 'card:' + d.cards[0].id); await L.sleep(200);
  await page.$eval('#simN', e => { e.value = '4'; e.dispatchEvent(new Event('input', {bubbles: true})); }); await L.sleep(300);
  let r = await L.text(page, '#simResult');
  L.ok(!!(await page.$('input[name=usesal]')) && /Considerei o seu salário de cerca de R\$\s?3\.000,00/.test(r), 'com salário nos últimos meses, ele entra nas contas dos próximos meses');
  L.ok(/Ganhos/.test(r) && /Já assumido/.test(r) && /Simulação/.test(r), 'a tabela mostra, mês a mês, o já assumido, a simulação e os ganhos');
  L.ok(/fecha dia 28 e vence dia 5/.test(r) && /4 parcelas de cerca de R\$\s?300,00, uma por fatura/.test(r), 'explica o fechamento, o vencimento e em qual fatura cada parcela cai');
  const col = async () => page.$$eval('#simResult .sim-table tbody tr', rows => rows.map(tr => [...tr.children].map(td => td.textContent.trim())));
  const t1 = await col();
  L.ok(t1.length === 6 && t1.some(row => /R\$\s?3\.000,00/.test(row[3])), 'a coluna Ganhos mostra o salário nos meses');
  await page.click('input[name=usesal]'); await L.sleep(300);
  const t2 = await col();
  L.ok(!/Considerei o seu salário/.test(await L.text(page, '#simResult')) && t2.every(row => !/R\$\s?3\.000,00/.test(row[3])), 'desmarcar tira o salário e o saldo muda');
  L.ok(t2[t2.length - 1][5] !== t1[t1.length - 1][5], 'e o saldo final é diferente sem o salário');
});
