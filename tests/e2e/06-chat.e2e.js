// Lançamento por mensagem: prévia editável antes de salvar, com destaque no que foi suposto.
import * as L from './lib.js';

L.run(async ({page}) => {
  const draft = i => '#chatLog [data-preview]:last-of-type [data-draft="' + i + '"]';
  const send = async msg => { await page.type('#chatInput', msg); await L.submitModal(page); await L.sleep(150); };
  const openChat = async () => { await page.click('#fabAdd'); await L.sleep(150); await page.click('[data-m-chat]'); await L.sleep(200); };

  L.section('Pergunta de boas-vindas');
  await L.signup(page, {welcome: true});
  await L.sleep(500);
  L.ok(await L.modalTitle(page) === 'Antes de começar…', 'chat de boas-vindas abre ao entrar');
  L.ok(/eu mostro o que entendi/.test(await L.text(page, '#chatLog')), 'avisa que mostra antes de salvar');
  await page.click('[data-chip-send="Não, nada"]'); await L.sleep(1300);
  L.ok(!(await L.modalOpen(page)), '“Não, nada” fecha o chat');

  L.section('Nada é salvo antes de confirmar');
  await openChat();
  await send('gastei 30 no mercado e 45 na lojinha');
  L.ok(await page.$$eval('#chatLog [data-draft]', els => els.length) === 2, 'mostra 2 itens para conferir');
  L.ok((await L.db(page)).transactions.length === 0, 'ainda não salvou nada');
  L.ok(/Confira antes de salvar/.test(await L.text(page, '#chatLog')), 'pede para conferir');
  L.ok(await page.$eval(draft(0) + ' [data-f="category"]', el => el.value) === 'alimentacao', 'item 1: categoria Alimentação reconhecida');
  L.ok(!(await page.$eval(draft(0) + ' [data-f="category"]', el => el.classList.contains('needs-review'))), 'categoria reconhecida não fica marcada');
  L.ok(await page.$eval(draft(1) + ' [data-f="category"]', el => el.value === 'outros' && el.classList.contains('needs-review')), 'item 2: categoria não reconhecida fica marcada');
  L.ok(/não reconheci/.test(await L.text(page, draft(1))), 'item 2 diz “não reconheci”');
  L.ok(/suposto: hoje/.test(await L.text(page, draft(0))), 'data suposta (hoje) fica marcada');
  L.ok(await page.$eval(draft(0) + ' [data-f="pay"]', el => el.classList.contains('needs-review')), 'forma de pagamento suposta fica marcada');

  L.section('Corrigir antes de salvar');
  await L.setVal(page, draft(1) + ' [data-f="category"]', 'compras');
  L.ok(!(await page.$eval(draft(1) + ' [data-f="category"]', el => el.classList.contains('needs-review'))) && !/não reconheci/.test(await L.text(page, draft(1))), 'ao escolher a categoria, a marcação some');
  await L.setVal(page, draft(0) + ' [data-f="amount"]', '35');
  await page.$eval(draft(1) + ' [data-f="desc"]', el => { el.value = ''; });
  await page.type(draft(1) + ' [data-f="desc"]', 'Presente da Ana');
  await page.click('#chatLog [data-preview-save]'); await L.sleep(300);
  let d = await L.db(page);
  L.ok(d.transactions.length === 2, 'salvou os 2 itens de uma vez');
  L.ok(d.transactions.some(t => t.amount === 35 && t.category === 'alimentacao' && t.source === 'chat'), 'valor corrigido (35) foi salvo');
  L.ok(d.transactions.some(t => t.amount === 45 && t.category === 'compras' && t.description === 'Presente da Ana'), 'categoria e descrição corrigidas foram salvas');
  L.ok(/Anotei/.test(await L.text(page, '#chatLog')) && await page.$('#chatLog [data-undo-tx]') !== null, 'confirma e oferece desfazer');
  await page.click('#chatLog [data-undo-tx]'); await L.sleep(250);
  L.ok((await L.db(page)).transactions.length === 1 && /desfeito/.test(await L.text(page, '#chatLog')), 'desfazer continua funcionando');

  L.section('Ganho com data e descartar');
  await send('recebi 1500 de salário ontem');
  L.ok(await page.$eval(draft(0) + ' [data-f="type"]', el => el.value) === 'income', 'entendeu ganho');
  L.ok(await page.$eval(draft(0) + ' [data-f="date"]', el => el.value) === L.dayOffset(-1), 'data de ontem');
  L.ok(!/suposto/.test(await L.text(page, draft(0))) && await page.$(draft(0) + ' [data-f="pay"]') === null, 'data reconhecida sem marcação e sem forma de pagamento');
  await page.click('#chatLog [data-preview]:last-of-type [data-preview-discard]'); await L.sleep(150);
  L.ok(/Descartado/.test(await L.text(page, '#chatLog')) && (await L.db(page)).transactions.length === 1, 'descartar não salva nada');

  L.section('Trocar o tipo no rascunho');
  await send('gastei 80 na farmácia');
  await L.setVal(page, draft(0) + ' [data-f="type"]', 'income'); await L.sleep(100);
  L.ok(await page.$(draft(0) + ' [data-f="pay"]') === null, 'virou ganho: some a forma de pagamento');
  L.ok(await page.$eval(draft(0) + ' [data-f="category"]', el => el.value === 'outros_receita' && el.classList.contains('needs-review')), 'categoria de ganho fica para conferir');
  await page.click('#chatLog [data-preview]:last-of-type [data-preview-discard]'); await L.sleep(150);

  L.section('Valor inválido não salva');
  await send('gastei 20 no uber');
  await L.setVal(page, draft(0) + ' [data-f="amount"]', '');
  await page.click('#chatLog [data-preview]:last-of-type [data-preview-save]'); await L.sleep(200);
  L.ok(/maior que zero/.test(await L.text(page, draft(0) + ' [data-draft-error]')), 'mostra o erro no item');
  L.ok((await L.db(page)).transactions.length === 1, 'nada foi salvo');
  await page.click(draft(0) + ' [data-draft-del]'); await L.sleep(150);
  L.ok(/Todos os itens foram removidos/.test(await L.text(page, '#chatLog')), 'remover o único item descarta a prévia');

  L.section('Fechar com itens pendentes avisa antes');
  await send('gastei 12 no café');
  await page.click('#modalRoot .modal-x'); await L.sleep(150);
  L.ok(await L.modalOpen(page), 'primeira tentativa de fechar não fecha');
  L.ok(/Ainda não salvei os itens acima/.test(await L.text(page, '#chatLog')), 'avisa que há itens sem salvar');
  await page.keyboard.press('Escape'); await L.sleep(150);
  L.ok(!(await L.modalOpen(page)), 'segunda tentativa fecha');
  L.ok((await L.db(page)).transactions.length === 1, 'itens pendentes foram descartados');

  L.section('Cartão e parcelas na prévia');
  await openChat();
  await send('comprei tênis de 300 em 3x no cartão');
  L.ok(await page.$eval(draft(0) + ' [data-f="pay"]', el => el.classList.contains('needs-review')), 'sem cartão cadastrado: pagamento fica para conferir');
  await page.click('#chatLog [data-preview]:last-of-type [data-preview-discard]'); await L.sleep(150);
  await L.closeModal(page);
  await L.addCard(page, 'Nubank', 2000, 3, 10);
  d = await L.db(page);
  await openChat();
  await send('comprei tênis de 300 em 3x no cartão');
  L.ok(await page.$eval(draft(0) + ' [data-f="pay"]', el => el.value) === 'card:' + d.cards[0].id, 'usa o cartão cadastrado');
  L.ok(await page.$eval(draft(0) + ' [data-f="install"]', el => el.value) === '3', 'parcelas (3x) vêm da frase');
  await page.click(draft(0) + ' [data-step="1"]');
  await page.click('#chatLog [data-preview]:last-of-type [data-preview-save]'); await L.sleep(300);
  d = await L.db(page);
  const parts = d.transactions.filter(t => t.installment);
  L.ok(parts.length === 4 && parts.every(t => t.amount === 75), 'salvou em 4x de 75 (ajustado na prévia)');
  await L.closeModal(page);

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await openChat();
  await send('gastei 30 no mercado e 20 no uber');
  L.ok(await L.noHorizontalScroll(page), 'prévia cabe na tela do celular');
});
