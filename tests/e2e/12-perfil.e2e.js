// Perfil e conta: abrir pelo nome no topo e pelo "Mais", nome, senha, preferências e exclusão.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);

  L.section('Abrir o perfil');
  L.ok(/Olá,\s*Arthur/.test(await L.text(page, '#profileBtn')) && await page.$eval('#profileBtn .avatar', el => el.textContent) === 'A', 'topo mostra o nome e a inicial');
  await page.click('#profileBtn'); await L.sleep(120);
  L.ok(!(await page.$eval('#tab-perfil', el => el.hidden)) && await page.evaluate(() => location.hash) === '#/perfil', 'clicar no nome abre “Perfil e conta”');
  L.ok(await page.$eval('.sidenav [data-tab="perfil"]', el => el.getAttribute('aria-current')) === 'page', 'menu marca “Perfil e conta”');
  const titles = await page.$$eval('#profileBody .profile-title', els => els.map(e => e.textContent.trim()));
  L.ok(titles.join('|') === 'Seu nome|E-mail|Senha|Preferências|Pesquisa acadêmica|Seus dados e segurança|Excluir conta', 'seções: nome, e-mail, senha, preferências, pesquisa, dados e exclusão');
  L.ok(await page.$('#pfEmailForm') === null && /não pode ser trocado/.test(await L.text(page, '#profileBody')), 'sem servidor, troca de e-mail fica desativada e explicada');
  L.ok(await page.$('#pfSignOutAll') === null, '“Sair de todos os aparelhos” só aparece com servidor');

  L.section('Trocar o nome');
  await page.$eval('#pfName', el => { el.value = ''; });
  await page.click('#pfNameForm button[type=submit]'); await L.sleep(100);
  L.ok(/Informe um nome/.test(await L.text(page, '#pfNameMsg')), 'nome vazio é recusado');
  await page.type('#pfName', 'Beatriz Souza');
  await page.click('#pfNameForm button[type=submit]'); await L.sleep(200);
  L.ok(/Olá,\s*Beatriz/.test(await L.text(page, '#profileBtn')) && await page.$eval('#profileBtn .avatar', el => el.textContent) === 'B', 'topo mostra o nome novo');
  await L.reload(page);
  await L.tab(page, 'dashboard');
  L.ok(/Olá, Beatriz/.test(await L.text(page, '#greeting')), 'nome continua depois de recarregar');

  L.section('Trocar a senha');
  await L.tab(page, 'perfil');
  const pass = async (cur, a, b) => {
    for (const [sel, v] of [['#pfCurrent', cur], ['#pfNew', a], ['#pfNew2', b]]){ await page.$eval(sel, el => { el.value = ''; }); await page.type(sel, v); }
    await page.click('#pfPassForm button[type=submit]'); await L.sleep(250);
    return L.text(page, '#pfPassMsg');
  };
  L.ok(/atual está incorreta/.test(await pass('errada1', 'nova@1234', 'nova@1234')), 'senha atual errada é recusada');
  L.ok(/não são iguais/.test(await pass('senha@123', 'nova@1234', 'outra123')), 'confirmação diferente é recusada');
  L.ok(/pelo menos uma letra e um número/.test(await pass('senha@123', 'abcdefgh', 'abcdefgh')), 'senha sem número é recusada');
  L.ok(/caractere especial/.test(await pass('senha@123', 'nova12345', 'nova12345')), 'senha sem caractere especial é recusada');
  L.ok(await page.$eval('#pfPwRules [data-rule="symbol"]', el => el.classList.contains('bad') && getComputedStyle(el).color === getComputedStyle(document.querySelector('.form-error')).color), 'regra que falta aparece em vermelho');
  await page.$eval('#pfNew', el => { el.value = ''; }); await page.type('#pfNew', 'abc!');
  L.ok(await page.$$eval('#pfPwRules li', els => els.map(e => e.className + (e.querySelector('.pw-mark').textContent)).join(',')) === 'bad✗,ok✓,bad✗,ok✓', 'lista muda enquanto digita (letra e especial ok; tamanho e número faltam)');
  L.ok(/Senha trocada/.test(await pass('senha@123', 'nova@1234', 'nova@1234')), 'senha trocada com a atual certa');
  L.ok(await page.$eval('#pfCurrent', el => el.value) === '', 'campos de senha são limpos');
  await page.click('#logoutBtn'); await L.sleep(150);
  await page.click('[data-action="go-login"]');
  await page.type('#loginEmail', email); await page.type('#loginPassword', 'senha@123');
  await page.click('#loginForm button[type=submit]'); await L.sleep(400);
  L.ok(/incorretos/.test(await L.text(page, '#loginError')), 'senha antiga não entra mais');
  await page.$eval('#loginPassword', el => { el.value = ''; });
  await page.type('#loginPassword', 'nova@1234');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(300);
  L.ok(true, 'senha nova entra');

  L.section('Preferências');
  await L.tab(page, 'perfil');
  L.ok(await page.$eval('input[name=pfTheme][value=system]', el => el.checked), 'tema começa automático');
  await page.click('input[name=pfTheme][value=dark]'); await L.sleep(100);
  L.ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'tema escuro aplicado');
  await page.click('input[name=pfTheme][value=system]'); await L.sleep(100);
  L.ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === null && await page.evaluate(() => localStorage.getItem('granaleve_theme')) === null, 'automático volta a seguir o aparelho');
  L.ok(!(await page.$eval('#pfWelcome', el => el.checked)), 'pergunta ao entrar aparece desligada (o teste desligou no cadastro)');
  await page.click('#pfWelcome'); await L.sleep(80);
  const key = email.toLowerCase();
  L.ok(await page.evaluate(k => JSON.parse(localStorage.getItem('granaleve_prefs_' + k)).quickEntryOff, key) === false, 'religar a pergunta salva a preferência');
  await page.evaluate(k => { const p = JSON.parse(localStorage.getItem('granaleve_prefs_' + k)); p.skipConfirm = {deleteTx: true}; localStorage.setItem('granaleve_prefs_' + k, JSON.stringify(p)); }, key);
  await L.tab(page, 'dashboard'); await L.tab(page, 'perfil');
  L.ok(/não mostrar mais:\s*1/.test(await L.text(page, '#profileBody')), 'conta as confirmações desligadas');
  await page.click('#pfResetConfirm'); await L.sleep(100);
  L.ok(Object.keys(await page.evaluate(k => JSON.parse(localStorage.getItem('granaleve_prefs_' + k)).skipConfirm, key)).length === 0, '“Voltar a perguntar” religa as confirmações');

  L.section('Pesquisa, dados e exclusão');
  await page.click('#pfResearchBtn'); await L.sleep(150);
  L.ok(/Participar do estudo|Sair do estudo/.test(await L.modalTitle(page)), 'pesquisa abre o termo');
  await L.closeModal(page);
  await page.click('#pfData'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Seus dados e backup', 'abre “Seus dados e backup”');
  await L.closeModal(page);
  await page.click('#pfDelete'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Apagar conta?', 'excluir pede confirmação');
  await L.closeModal(page);
  L.ok(!(await page.$eval('#viewApp', el => el.hidden)), 'cancelar não exclui nada');

  L.section('Celular: perfil pelo “Mais” e pela inicial');
  await page.setViewport({width: 375, height: 800});
  await L.tab(page, 'dashboard');
  L.ok(await page.$eval('#profileBtn .user-name', el => getComputedStyle(el).display) === 'none' && await page.$eval('#profileBtn .avatar', el => el.getBoundingClientRect().width > 0), 'no celular fica só a inicial');
  await page.click('#moreBtn'); await L.sleep(150);
  L.ok(/Perfil e conta/.test(await L.text(page, '.more-menu')), '“Mais” tem “Perfil e conta”');
  await page.click('[data-more="perfil"]'); await L.sleep(150);
  L.ok(!(await page.$eval('#tab-perfil', el => el.hidden)), 'abre o perfil pelo “Mais”');
  L.ok(await L.noHorizontalScroll(page), 'perfil cabe na tela');
});
