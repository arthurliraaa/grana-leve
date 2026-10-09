// Botão + (popup), edição de lançamentos e categorias, ajustes de interface.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);

  L.section('Botão + abre o popup de lançamento');
  await page.click('#fabAdd'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Novo lançamento', 'título do popup é “Novo lançamento”');
  L.ok(await page.$eval('#mInstallField', el => el.hidden), 'parcelas escondidas fora do cartão');
  await L.submitModal(page);
  L.ok(/maior que zero/.test(await L.modalError(page)), 'sem valor mostra erro e não fecha');
  await L.closeModal(page);

  await L.addTx(page, {amount: 50, category: 'alimentacao', desc: 'Mercado'});
  L.ok(!(await L.modalOpen(page)), 'popup fecha depois de salvar');
  L.ok(/Gasto de R\$\s?50,00 registrado/.test(await L.allToasts(page)), 'toast confirma o gasto');
  let d = await L.db(page);
  L.ok(d.transactions.length === 1 && d.transactions[0].amount === 50 && d.transactions[0].paymentMethod === 'conta', 'gasto salvo com valor e pagamento');

  L.section('Link do chat dentro do popup');
  await page.click('#fabAdd'); await L.sleep(150);
  await page.click('[data-m-chat]'); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Chat de lançamento', 'abre o chat de lançamento');
  await L.closeModal(page);

  L.section('Editar lançamento');
  await L.tab(page, 'lancamentos');
  await page.click('#txList [data-edit-tx]'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Editar lançamento', 'lápis abre “Editar lançamento”');
  L.ok(await page.$eval('#mAmount', el => el.value) === '50', 'valor vem preenchido');
  L.ok(await page.$eval('#mCategory', el => el.value) === 'alimentacao', 'categoria vem preenchida');
  L.ok(await page.$eval('#mDesc', el => el.value) === 'Mercado', 'descrição vem preenchida');
  L.ok(await page.$('[data-m-chat]') === null && await page.$('#mInstall') === null, 'edição não mostra chat nem parcelas');
  await L.setVal(page, '#mAmount', '75.5');
  await L.setVal(page, '#mCategory', 'transporte');
  await page.$eval('#mDesc', el => { el.value = ''; });
  await page.type('#mDesc', 'Uber');
  await L.submitModal(page);
  d = await L.db(page);
  L.ok(d.transactions.length === 1, 'edição não duplica o lançamento');
  L.ok(d.transactions[0].amount === 75.5 && d.transactions[0].category === 'transporte' && d.transactions[0].description === 'Uber', 'valor, categoria e descrição atualizados');
  L.ok(/Uber/.test(await L.text(page, '#txList')) && /Transporte/.test(await L.text(page, '#txList')), 'lista mostra os dados novos');

  L.section('Trocar gasto para ganho na edição');
  await page.click('#txList [data-edit-tx]'); await L.sleep(150);
  await page.click('#mType button[data-type="income"]'); await L.sleep(80);
  L.ok(await page.$eval('#mPayField', el => el.hidden), 'forma de pagamento some para ganho');
  L.ok(await page.$eval('#mCategory', el => el.value) === 'salario', 'categorias de ganho aparecem');
  await L.submitModal(page);
  d = await L.db(page);
  L.ok(d.transactions[0].type === 'income' && d.transactions[0].paymentMethod === null, 'virou ganho sem forma de pagamento');

  L.section('Nova categoria pelo popup');
  await L.addTx(page, {amount: 30, newCat: 'Pets'});
  d = await L.db(page);
  const pets = d.categories.find(c => c.label === 'Pets');
  L.ok(pets && pets.type === 'expense', 'categoria criada como de gasto');
  L.ok(d.transactions.some(t => t.category === (pets && pets.id)), 'gasto foi para a categoria nova');
  await L.addTx(page, {amount: 10, newCat: 'pets'});
  L.ok(/Já existe/.test(await L.modalError(page)), 'nome repetido é recusado');
  await L.closeModal(page);
  await L.tab(page, 'limites');
  L.ok(/Pets/.test(await L.text(page, '#budgetList')), 'categoria nova aparece em Planejar gastos');

  L.section('Personalizar categoria criada: nome, emoji e cor');
  await L.tab(page, 'lancamentos');
  await page.click('#manageCatsBtn'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Personalizar categorias', 'abre “Personalizar categorias”');
  L.ok(await page.$$eval('#catManageBody .cat-row', els => els.length) >= 15, 'lista as categorias padrão e as criadas');
  await page.click('[data-cat-edit="' + pets.id + '"]'); await L.sleep(100);
  L.ok(await page.evaluate(() => document.activeElement.id) === 'ceName', 'editor abre com o foco no nome');
  await page.$eval('#ceName', el => { el.value = ''; });
  await page.type('#ceName', 'Bichos');
  await page.click('[data-emoji="🐶"]');
  L.ok(await page.$eval('#cePreview', el => el.textContent) === '🐶', 'prévia mostra o emoji escolhido');
  await page.click('[data-color="#4a3aa7"]');
  await page.focus('#ceName');
  await page.keyboard.press('Enter'); await L.sleep(250);
  L.ok(await L.modalOpen(page), 'Enter salva sem fechar o popup');
  d = await L.db(page);
  const bichos = d.categories.find(c => c.id === pets.id);
  L.ok(bichos.label === 'Bichos' && bichos.emoji === '🐶' && bichos.color === '#4a3aa7', 'nome, emoji e cor salvos');

  L.section('Personalizar uma categoria padrão e voltar ao padrão');
  await page.click('[data-cat-edit="alimentacao"]'); await L.sleep(100);
  await page.$eval('#ceName', el => { el.value = ''; });
  await page.type('#ceName', 'Comida');
  await page.$eval('#ceEmoji', el => { el.value = ''; });
  await page.type('#ceEmoji', '🍕');
  await page.click('[data-cat-save]'); await L.sleep(250);
  d = await L.db(page);
  const food = d.categories.find(c => c.id === 'alimentacao');
  L.ok(food && food.label === 'Comida' && food.emoji === '🍕' && food.isDefault === true, 'padrão personalizada salva com o mesmo id');
  L.ok(/Padrão personalizada/.test(await L.text(page, '#catManageBody')), 'lista mostra “Padrão personalizada”');
  await page.click('[data-cat-edit="' + pets.id + '"]'); await L.sleep(100);
  await page.$eval('#ceName', el => { el.value = ''; });
  await page.type('#ceName', 'comida');
  await page.click('[data-cat-save]'); await L.sleep(150);
  L.ok(/Já existe/.test(await L.modalError(page)), 'nome repetido (de uma padrão personalizada) é recusado');
  await page.click('[data-cat-cancel]'); await L.sleep(100);
  await L.closeModal(page);
  L.ok(/Bichos/.test(await L.text(page, '#txList')) && !/Pets/.test(await L.text(page, '#txList')), 'lançamentos mostram o nome novo');
  L.ok(await page.$eval('#txList .cat-badge', el => el.textContent) !== '', 'lançamentos mostram o emoji da categoria');
  L.ok(await page.$eval('#txCategory', el => [...el.options].some(o => o.textContent === '🍕 Comida')), 'formulário mostra emoji e nome novo');
  await page.click('#manageCatsBtn'); await L.sleep(150);
  await page.click('[data-cat-edit="alimentacao"]'); await L.sleep(100);
  await page.click('[data-cat-reset]'); await L.sleep(250);
  d = await L.db(page);
  L.ok(!d.categories.some(c => c.id === 'alimentacao'), '“Voltar ao padrão” apaga a personalização');
  L.ok(await page.$eval('#txCategory', el => [...el.options].some(o => o.textContent === '🍽️ Alimentação')), 'nome e emoji padrão voltam');
  await L.closeModal(page);

  L.section('Compra parcelada: edição muda todas as parcelas');
  await L.addCard(page, 'Nubank', 3000, 3, 10);
  d = await L.db(page);
  const card = d.cards[0];
  await page.click('#fabAdd'); await L.sleep(150);
  await L.setVal(page, '#mAmount', '300');
  await L.setVal(page, '#mPay', 'card:' + card.id);
  L.ok(!(await page.$eval('#mInstallField', el => el.hidden)), 'parcelas aparecem no cartão');
  await L.setVal(page, '#mInstall', '3');
  await L.setVal(page, '#mCategory', 'compras');
  await page.type('#mDesc', 'Fone');
  await L.submitModal(page);
  d = await L.db(page);
  let parts = d.transactions.filter(t => t.installment);
  L.ok(parts.length === 3 && parts.every(t => t.amount === 100), '3 parcelas de R$ 100');
  await L.tab(page, 'lancamentos');
  const id1 = await page.$eval('#txList [data-edit-tx]', el => el.getAttribute('data-edit-tx'));
  L.ok(parts.some(t => t.id === id1), 'primeiro item do mês é a parcela');
  await page.click('#txList [data-edit-tx]'); await L.sleep(150);
  L.ok(await page.$eval('#mAmount', el => el.disabled) && await page.$eval('#mDate', el => el.disabled), 'valor e data travados na parcela');
  L.ok(/Parcela 1 de 3/.test(await L.text(page, '#modalRoot')), 'aviso mostra a parcela');
  await L.setVal(page, '#mCategory', 'lazer');
  await page.$eval('#mDesc', el => { el.value = ''; });
  await page.type('#mDesc', 'Fone bluetooth');
  await L.submitModal(page);
  d = await L.db(page);
  parts = d.transactions.filter(t => t.installment).sort((a, b) => a.installment.n - b.installment.n);
  L.ok(parts.every(t => t.category === 'lazer'), 'categoria mudou nas 3 parcelas');
  L.ok(parts.map(t => t.description).join('|') === 'Fone bluetooth (1/3)|Fone bluetooth (2/3)|Fone bluetooth (3/3)', 'descrição mudou nas 3 parcelas');
  L.ok(parts.every(t => t.amount === 100 && t.paymentMethod === 'cartao'), 'valor e cartão não mudaram');

  L.section('Formulário da aba continua funcionando');
  await page.type('#txAmount', '20');
  await L.setVal(page, '#txCategory', 'saude');
  await page.click('#txForm button[type=submit]'); await L.sleep(250);
  d = await L.db(page);
  L.ok(d.transactions.some(t => t.amount === 20 && t.category === 'saude' && t.paymentMethod === 'conta' && t.cardId === null), 'gasto pela aba salvo');

  L.section('Interface: mensagens vazias e textos');
  for (const [tb, grid] of [['metas', 'goalGrid'], ['dividas', 'debtGrid'], ['receber', 'recvGrid']]){
    await L.tab(page, tb);
    const c = await page.evaluate((grid) => {
      const g = document.getElementById(grid); const p = g.querySelector('.empty-state'); if (!p) return null;
      const a = g.getBoundingClientRect(), b = p.getBoundingClientRect();
      return {off: Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)), ta: getComputedStyle(p).textAlign};
    }, grid);
    if (!c && tb === 'dividas'){ L.ok(/Compras parceladas/.test(await L.text(page, '#installDebtWrap')), 'Dívidas mostra as compras parceladas no lugar da mensagem vazia'); continue; }
    L.ok(c && c.off < 2 && c.ta === 'center', 'mensagem vazia de ' + tb + ' centralizada');
  }
  await L.tab(page, 'aprenda');
  L.ok(await page.$eval('.disclaimer', el => getComputedStyle(el).textAlign) === 'center', 'aviso de conteúdo educativo centralizado');
  L.ok(await page.$eval('.tab-intro', el => getComputedStyle(el).textAlign) === 'justify', 'textos de introdução justificados');
  L.ok(await page.$eval('.tip-card p', el => getComputedStyle(el).textAlign) === 'justify', 'dicas justificadas');

  L.section('Celular: sem rolagem lateral');
  await page.setViewport({width: 375, height: 800});
  for (const t of ['dashboard', 'lancamentos', 'cartoes', 'limites', 'metas', 'dividas', 'receber', 'aprenda', 'conexoes']){
    await L.tab(page, t);
    L.ok(await L.noHorizontalScroll(page), 'aba ' + t + ' cabe na tela');
  }
  await page.click('#fabAdd'); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page), 'popup cabe na tela');
  await L.closeModal(page);
});
