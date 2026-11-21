// No celular o lançamento é o popup do +: “paguei por outra pessoa” e “dividir” precisam estar nele.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await page.setViewport({width: 375, height: 800, isMobile: true});
  await L.addCard(page, 'Nubank', 5000, 3, 10);
  await L.tab(page, 'lancamentos');
  const open = async () => { await page.click('#fabAdd'); await L.sleep(250); };
  const click = sel => page.$eval(sel, e => e.click());

  L.section('O formulário grande não aparece no celular; o popup tem a opção');
  L.ok(await page.$eval('#txForm', e => getComputedStyle(e).display) === 'none', 'o formulário da página fica escondido no celular');
  await open();
  L.ok(await page.$eval('#mOthers', e => !e.hidden), 'o popup do + oferece “Pagou por alguém ou vai dividir?”');
  await page.type('#mAmount', '80');
  await click('#mOthers > summary'); await L.sleep(100);
  L.ok(await L.noHorizontalScroll(page), 'cabe na tela de 375 px');

  L.section('Paguei por outra pessoa');
  await click('#mForOther'); await L.sleep(100);
  L.ok(await page.$eval('#mOtherName', e => !e.hidden), 'pede quem vai devolver');
  await L.submitModal(page); await L.sleep(200);
  L.ok(/quem vai te devolver/i.test(await L.modalError(page)), 'sem o nome, avisa e não salva');
  await page.type('#mOtherName', 'Maria');
  await page.type('#mDesc', 'Farmácia');
  await L.submitModal(page); await L.sleep(500);
  let d = await L.db(page);
  const maria = d.receivables.find(r => r.person === 'Maria');
  const tx = d.transactions.find(t => t.description === 'Farmácia');
  L.ok(maria && maria.totalAmount === 80 && maria.linked, 'cria o “A receber” da Maria com 80');
  L.ok(tx && tx.forOther && tx.forOther.receivableId === maria.id, 'o gasto fica ligado a ela (não conta como gasto meu)');
  L.ok(!(await L.modalOpen(page)), 'o popup fecha');

  L.section('Dividir com outras pessoas');
  await open();
  await page.type('#mAmount', '100'); await page.type('#mDesc', 'Pizza');
  await click('#mOthers > summary');
  await click('#mSplit'); await L.sleep(150);
  L.ok(await page.$eval('#mSplitBox', e => !e.hidden) && await page.$$eval('#mSplitRows .split-row', r => r.length) === 1, 'abre a divisão com uma pessoa');
  await page.type('#mSplitRows .sp-name', 'João'); await page.type('#mSplitRows .sp-val', '30');
  await L.sleep(150);
  L.ok(/Sua parte: R\$\s?70,00 de R\$\s?100,00/.test(await L.text(page, '#mSplitSummary')), 'o resumo mostra a sua parte (70 de 100)');
  await L.submitModal(page); await L.sleep(500);
  d = await L.db(page);
  const joao = d.receivables.find(r => r.person === 'João');
  const pizza = d.transactions.find(t => t.description === 'Pizza');
  L.ok(joao && joao.totalAmount === 30 && pizza.split && pizza.split.mine === 70, 'João deve 30 e a sua parte é 70');

  L.section('Compra parcelada no cartão para outra pessoa');
  await open();
  await L.setVal(page, '#mPay', 'card:' + d.cards[0].id);
  await page.type('#mAmount', '300'); await page.type('#mDesc', 'Fone');
  await L.setVal(page, '#mInstall', 3);
  await click('#mOthers > summary'); await click('#mForOther');
  await page.type('#mOtherName', 'Ana');
  await L.submitModal(page); await L.sleep(500);
  d = await L.db(page);
  const ana = d.receivables.find(r => r.person === 'Ana');
  const fone = d.transactions.filter(t => t.description && /Fone/.test(t.description));
  L.ok(ana && ana.totalAmount === 300 && ana.installments === 3 && fone.length === 3 && fone.every(t => t.forOther && t.forOther.receivableId === ana.id), 'a compra de 3x vai toda para a Ana');

  L.section('Ganho não mostra a opção; gasto comum continua simples');
  await open();
  await page.click('#mType button[data-type="income"]'); await L.sleep(100);
  L.ok(await page.$eval('#mOthers', e => e.hidden), 'em ganho a opção some');
  await page.click('#mType button[data-type="expense"]'); await L.sleep(100);
  await page.type('#mAmount', '12');
  await L.submitModal(page); await L.sleep(400);
  d = await L.db(page);
  const comum = d.transactions.find(t => t.amount === 12);
  L.ok(comum && !comum.forOther && !comum.split, 'sem marcar nada, grava um gasto comum');
});
