// Grana, o mascote (dúvidas pelo sentido da pergunta), e as novidades do app: página inicial, Início e janela de primeira abertura.
import * as L from './lib.js';

L.run(async ({page}) => {
  await page.evaluateOnNewDocument(() => { localStorage.setItem('granaleve_grana', 'on'); });   // liga o Grana do cantinho
  const askLanding = async q => { await page.type('#meetGrana .gr-form input', q); await page.keyboard.press('Enter'); await L.sleep(1700); };
  const lastBot = () => page.$$eval('#meetGrana .gr-msg.bot p', ps => ps.filter(p => !p.closest('.gr-typing')).pop().textContent);

  L.section('Página inicial (sem conta)');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#meetGrana .gr-svg'); await L.sleep(300);
  L.ok(await page.$eval('#meetGrana', e => /Conheça o Grana/.test(e.textContent)) && await page.$$eval('#meetGrana .gr-svg', s => s.length) >= 1, 'a página inicial apresenta o Grana, o mascote');
  await page.$eval('#meetGrana', e => e.scrollIntoView({block: 'center'}));
  await askLanding('como anoto uma despesa?');
  L.ok(/gastei 30 no mercado/.test(await lastBot()), 'entende “como anoto uma despesa?” como lançar gasto (sem a palavra “gasto”)');
  await askLanding('posso subir o csv do meu banco?');
  L.ok(/OFX ou o CSV/.test(await lastBot()), 'entende que subir o CSV do banco é importar extrato');
  await askLanding('lancei um gasot com errp de digitação');
  L.ok(!/Ainda não sei responder/.test(await lastBot()), 'tolera erros de digitação');
  await askLanding('qual a previsão do tempo?');
  L.ok(/Ainda não sei responder/.test(await lastBot()) && /equipe/.test(await lastBot()), 'quando não sabe, diz e oferece falar com a equipe');
  const chip = await page.$('#meetGrana [data-gr-chip]');
  if (chip){ await chip.evaluate(e => e.click()); await L.sleep(1500); }
  L.ok(await page.$$eval('#meetGrana .gr-msg.me', m => m.length) >= 4, 'dá para tocar nos assuntos sugeridos');
  L.ok(/não é enviado a lugar nenhum/.test(await L.text(page, '#meetGrana .gr-note')), 'avisa que a conversa fica no aparelho');
  await page.$eval('[data-gr-poke]', e => e.click()); await L.sleep(200);
  L.ok(await page.$eval('[data-gr-poke] .gr-svg', e => e.getAttribute('data-mood')) === 'happy', 'tocar no mascote o deixa feliz (e ele fala)');
  L.ok(/Novidades/.test(await L.text(page, '#landingNews')) && await page.$$eval('#landingNews .news-item', n => n.length) >= 1, 'a página inicial mostra as novidades do app');
  await page.setViewport({width: 375, height: 800}); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'cabe no celular');
  await page.setViewport({width: 1280, height: 900});

  L.section('Início (com conta): conta nova e vazia');
  await L.signup(page);
  L.ok(await page.$eval('#granaCorner', e => !e.hidden) && await page.$eval('#granaCorner .gr-svg', e => !!e), 'o Grana aparece no cantinho da tela, dentro do app');
  L.ok(await page.$eval('#newsCard', e => e.hidden), 'conta nova não vê o cartão de novidades (para ela tudo é novo)');

  L.section('Início (com conta): quem já usa');
  await L.addTx(page, {amount: 30, desc: 'Mercado', category: 'alimentacao'});
  await L.reload(page); await L.sleep(500);
  await L.tab(page, 'dashboard'); await L.sleep(300);
  L.ok(await page.$eval('#newsCard', e => !e.hidden && /Novidades:/.test(e.textContent)), 'quem já usa vê o cartão de novidades no Início');
  await page.click('#granaCorner .gr-corner-btn'); await L.sleep(900);
  L.ok(/Converse com o Grana/.test(await L.modalTitle(page)), 'tocar no mascote abre a conversa');
  await page.type('#modalRoot .gr-form input', 'como importo o extrato do banco'); await page.keyboard.press('Enter'); await L.sleep(1700);
  L.ok(/Importar extrato/.test(await L.text(page, '#modalRoot .gr-msg.bot:last-child')) && !!(await page.$('#modalRoot [data-gr-go="lancamentos"]')), 'responde para quem tem conta, com o botão que leva à tela certa');
  await page.$eval('#modalRoot [data-gr-go="lancamentos"]', e => e.click()); await L.sleep(400);
  L.ok(!(await L.modalOpen(page)) && !(await page.$eval('#tab-lancamentos', e => e.hidden)), 'o botão fecha a conversa e abre Ganhos e gastos');
  await L.tab(page, 'dashboard');
  await page.$eval('[data-news-close]', e => e.click()); await L.sleep(150);
  await L.reload(page); await L.sleep(500);
  L.ok(await page.$eval('#newsCard', e => e.hidden), 'fechar o cartão de novidades vale até a próxima atualização');

  L.section('Primeira abertura depois de uma atualização');
  await page.evaluate(() => { localStorage.setItem('granaleve_whatsnew', 'on'); const k = Object.keys(localStorage).find(x => /^granaleve_prefs_/.test(x)); const p = JSON.parse(localStorage.getItem(k) || '{}'); delete p.whatsNewSeen; delete p.whatsNewCard; localStorage.setItem(k, JSON.stringify(p)); });
  await L.reload(page); await page.waitForFunction(() => /Novidades do Grana Leve/.test((document.getElementById('modalTitle') || {}).textContent || ''), {timeout: 9000}).catch(() => {});
  L.ok(/Novidades do Grana Leve/.test(await L.modalTitle(page)) && await page.$$eval('#modalRoot .wn-rel', r => r.length) >= 1, 'quem já usa vê a janela de novidades na primeira abertura');
  await L.submitModal(page); await L.sleep(300);
  await L.reload(page); await L.sleep(3500);
  L.ok(!(await L.modalOpen(page)), 'e ela não volta nas próximas aberturas');
  await L.tab(page, 'perfil'); await L.sleep(200);
  await page.$eval('#pfWhatsNew', e => e.click()); await L.sleep(300);
  L.ok(/Novidades do Grana Leve/.test(await L.modalTitle(page)), 'em Perfil dá para rever as novidades');
});
