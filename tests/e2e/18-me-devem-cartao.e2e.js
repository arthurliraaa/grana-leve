// Me devem com compra no cartão: cartão sugerido, ligar a uma compra já lançada e cartão/fatura no recebimento.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Nubank', 3000, 3, 10);
  await L.addCard(page, 'Inter', 5000, 31, 7);
  let d = await L.db(page);
  const [nu, inter] = d.cards;

  L.section('Compra já lançada em Ganhos e gastos');
  await L.addTx(page, {amount: 300, pay: 'card:' + inter.id, install: 3, desc: 'Fone', category: 'compras'});
  await L.tab(page, 'receber');
  await L.setVal(page, '#recvKind', 'cartao');
  L.ok(await page.$eval('#recvCard', el => el.value) === inter.id, 'cartão sugerido: o da compra mais recente (Inter), não o primeiro da lista');
  const opts = await page.$$eval('#recvLink option', o => o.map(x => x.textContent));
  L.ok(opts.length === 2 && /^Fone · 3x de R\$\s?100,00 · Cartão Inter/.test(opts[1]), 'lista a compra parcelada já lançada');
  d = await L.db(page);
  const gid = d.transactions.find(t => t.installment).installment.group;
  await L.setVal(page, '#recvLink', 'g:' + gid);
  L.ok(await page.$eval('#recvTotal', el => el.value === '300' && el.disabled) && await page.$eval('#recvInstall', el => el.value === '3' && el.disabled), 'preenche valor e parcelas da compra (travados)');
  L.ok(await page.$eval('#recvDesc', el => el.value) === 'Fone' && await page.$eval('#recvLaunchField', el => el.hidden), 'descrição vem da compra e não oferece lançar de novo');
  await page.type('#recvPerson', 'Ana');
  await page.click('#recvForm button[type=submit]'); await L.sleep(400);
  d = await L.db(page);
  const ana = d.receivables.find(r => r.person === 'Ana');
  const fone = d.transactions.filter(t => t.installment && t.installment.group === gid);
  L.ok(d.transactions.length === 3, 'não lançou a compra de novo');
  L.ok(ana.linked && ana.cardId === inter.id && ana.installments === 3 && ana.totalAmount === 300, 'A receber ligado: Inter, 3x, 300');
  L.ok(fone.every(t => t.forOther && t.forOther.receivableId === ana.id), 'a compra passa a ser “paga por Ana” (fora dos seus gastos)');
  L.ok(await page.$eval('#recvTotal', el => !el.disabled) && await page.$eval('#recvLink', el => el.value === ''), 'formulário volta ao normal');
  L.ok(await page.$$eval('#recvLink option', o => o.length) === 1, 'compra já ligada sai da lista');

  L.section('Recebimento mostra o cartão e a fatura');
  L.ok(/Cartão Inter · parcela 1 de 3 · fatura de/.test(await L.text(page, '#recvGrid')), 'Me devem mostra cartão e parcela');
  await page.click('[data-recv-get="' + ana.id + '"]'); await L.sleep(150);
  L.ok(/Cartão Inter · parcela 1 de 3 · fatura de \S+ de \d{4}/.test(await L.text(page, '#modalRoot')), 'registrar recebimento mostra cartão, parcela e fatura');
  await L.closeModal(page);

  L.section('Cartão escolhido é lembrado');
  await L.setVal(page, '#recvKind', 'cartao');
  await L.setVal(page, '#recvCard', nu.id);
  await page.type('#recvPerson', 'Bia'); await page.type('#recvTotal', '50');
  await page.click('#recvForm button[type=submit]'); await L.sleep(300);
  d = await L.db(page);
  L.ok(d.receivables.find(r => r.person === 'Bia').cardId === nu.id, 'grava o cartão mesmo sem lançar a compra');
  await L.reload(page); await L.tab(page, 'receber');
  await L.setVal(page, '#recvKind', 'cartao');
  L.ok(await page.$eval('#recvCard', el => el.value) === nu.id, 'depois de recarregar, sugere o último cartão escolhido (Nubank)');
  await page.setViewport({width: 375, height: 800});
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
});
