// Onde ficam os dados: avisos, indicador, backup completo, lembrete, migração e falha da nuvem.
import * as L from './lib.js';
import {mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

L.run(async ({browser, page}) => {
  L.section('Apresentação e cadastro deixam claro onde os dados ficam');
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.reload({waitUntil: 'domcontentloaded'});
  L.ok(/Seus dados ficam no seu aparelho/.test(await L.text(page, '.trust-list')), 'apresentação avisa que os dados ficam no aparelho');
  await page.click('[data-action="go-signup"]');
  const notice = await L.text(page, '#signupForm .storage-notice[data-local-only]');
  L.ok(/só neste navegador/.test(notice) && /não é sincronizada/.test(notice) && /não existe recuperação de senha/.test(notice), 'cadastro explica: só neste navegador, sem sincronização, sem recuperar senha');
  await page.type('#signupName', 'Bia'); await page.type('#signupEmail', 'bia' + Date.now() + '@teste.com'); await page.type('#signupPassword', 'senha@123');
  await page.click('#signupForm button[type=submit]'); await L.sleep(200);
  L.ok(/Confirme que entendeu/.test(await L.text(page, '#signupError')), 'sem marcar “Entendi” não cria a conta');
  await page.click('[data-authtab="login"]');
  L.ok(/conta criada neste navegador/.test(await L.text(page, '#loginForm')), 'login avisa que só vale para contas deste navegador');

  await L.signup(page);

  L.section('Indicador no topo abre “Seus dados e backup”');
  L.ok(await L.text(page, '#storageBtn') === 'Só neste navegador', 'topo mostra “Só neste navegador”');
  L.ok(/só neste navegador/.test(await page.$eval('#storageBtn', el => el.getAttribute('aria-label'))), 'indicador tem descrição para leitor de tela');
  await page.click('#storageBtn'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Seus dados e backup', 'abre “Seus dados e backup”');
  let modalTxt = await L.text(page, '#modalRoot');
  L.ok(/Onde ficam: só neste navegador/.test(modalTxt) && /Último backup: nunca/.test(modalTxt), 'mostra onde ficam e que nunca houve backup');
  L.ok(/não tem recuperação de senha/.test(modalTxt), 'repete que não há recuperação de senha');
  await L.closeModal(page);
  await page.setViewport({width: 375, height: 800});
  L.ok(await page.$eval('#storageBtn', el => el.getBoundingClientRect().width > 0), 'indicador continua visível no celular');
  await page.setViewport({width: 1280, height: 900});

  L.section('Lembrete de backup no painel');
  L.ok(await page.$eval('#backupBanner', el => el.hidden), 'sem lembrete com poucos dados');
  for (let i = 0; i < 5; i++) await L.addTx(page, {amount: 10 + i, category: 'alimentacao'});
  await L.tab(page, 'dashboard');
  L.ok(!(await page.$eval('#backupBanner', el => el.hidden)), 'lembrete aparece com 5 lançamentos e nenhum backup');
  L.ok(/Você ainda não tem um backup/.test(await L.text(page, '#backupBanner')), 'texto do lembrete');
  await page.click('[data-backup-snooze]'); await L.sleep(150);
  L.ok(await page.$eval('#backupBanner', el => el.hidden), '“Lembrar em 7 dias” esconde o lembrete');
  await L.reload(page);
  L.ok(await page.$eval('#backupBanner', el => el.hidden), 'continua escondido depois de recarregar');
  const key = await page.evaluate(() => JSON.parse(localStorage.getItem('granaleve_session_v1')).emailKey);
  await page.evaluate((key) => { const p = JSON.parse(localStorage.getItem('granaleve_prefs_' + key)); p.backupSnoozeUntil = Date.now() - 1000; localStorage.setItem('granaleve_prefs_' + key, JSON.stringify(p)); }, key);
  await L.reload(page);
  L.ok(!(await page.$eval('#backupBanner', el => el.hidden)), 'volta depois de 7 dias');

  L.section('Salvar backup baixa o arquivo completo');
  const dir = mkdtempSync(join(tmpdir(), 'grana-dl-'));
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: dir, eventsEnabled: true});
  await page.evaluate((key) => { const p = JSON.parse(localStorage.getItem('granaleve_prefs_' + key)); p.skipConfirm = {deleteTx: true}; localStorage.setItem('granaleve_prefs_' + key, JSON.stringify(p)); }, key);
  await page.click('[data-backup-now]');
  let files = [];
  for (let i = 0; i < 30 && !files.length; i++){ await L.sleep(100); files = readdirSync(dir).filter(f => f.endsWith('.json')); }
  L.ok(files.length === 1 && /^grana-leve-backup-\d{4}-\d{2}-\d{2}\.json$/.test(files[0]), 'arquivo de backup baixado');
  const file = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
  L.ok(file.schemaVersion === 2 && file.app === 'grana-leve', 'backup tem a versão do formato');
  L.ok(file.data.transactions.length === 5 && Array.isArray(file.data.accounts) && Array.isArray(file.data.budgets), 'backup tem todas as coleções');
  L.ok(file.prefs && file.prefs.skipConfirm && file.prefs.skipConfirm.deleteTx === true && file.prefs.quickEntryOff === true, 'backup leva as preferências');
  L.ok(!('lastWelcome' in file.prefs) && !('backupSnoozeUntil' in file.prefs), 'preferências que só valem neste aparelho ficam de fora');
  L.ok(await page.$eval('#backupBanner', el => el.hidden), 'lembrete some depois do backup');
  await page.click('#storageBtn'); await L.sleep(150);
  modalTxt = await L.text(page, '#modalRoot');
  L.ok(/Último backup: \d{2}\/\d{2}\/\d{4} \(hoje\)/.test(modalTxt), 'mostra a data do último backup');

  L.section('Restaurar recusa arquivo com registro inválido');
  const bad = join(dir, 'ruim.json');
  writeFileSync(bad, JSON.stringify({app: 'grana-leve', data: {transactions: [{id: 'x', type: 'expense', amount: -3, category: 'outros', date: '2026-10-01'}]}}));
  await (await page.$('#backupFile')).uploadFile(bad); await L.sleep(400);
  L.ok(/lançamentos \(item 1: valor inválido\)/.test(await L.text(page, '#backupError')), 'mensagem diz qual registro está errado');
  const worse = join(dir, 'corrompido.json');
  writeFileSync(worse, JSON.stringify({app: 'grana-leve', data: {transactions: 'oops'}}));
  await (await page.$('#backupFile')).uploadFile(worse); await L.sleep(400);
  L.ok(/corrompido/.test(await L.text(page, '#backupError')), 'arquivo corrompido mostra erro em vez de travar');
  await L.closeModal(page);
  L.ok((await L.db(page)).transactions.length === 5, 'dados atuais intactos');

  L.section('Restaurar leva as preferências junto');
  await page.evaluate((key) => { const p = JSON.parse(localStorage.getItem('granaleve_prefs_' + key)); delete p.skipConfirm; localStorage.setItem('granaleve_prefs_' + key, JSON.stringify(p)); }, key);
  await page.click('[data-info="backup"]'); await L.sleep(150);
  await (await page.$('#backupFile')).uploadFile(join(dir, files[0])); await L.sleep(400);
  await L.submitModal(page); await L.sleep(300);
  const prefs = await page.evaluate((key) => JSON.parse(localStorage.getItem('granaleve_prefs_' + key)), key);
  L.ok(prefs.skipConfirm && prefs.skipConfirm.deleteTx === true, '“Não perguntar novamente” voltou com o backup');

  L.section('Dados antigos são atualizados ao entrar');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('granaleve_session_v1'));
    const all = JSON.parse(localStorage.getItem('granaleve_local_db_v1'));
    const u = all.users[s.emailKey];
    delete u.schemaVersion; u.budgets = {alimentacao: 300}; delete u.accounts;
    localStorage.setItem('granaleve_local_db_v1', JSON.stringify(all));
  });
  await L.reload(page);
  const u = await L.db(page);
  L.ok(u.schemaVersion === 2 && Array.isArray(u.budgets) && u.budgets[0].limit === 300 && Array.isArray(u.accounts), 'formato antigo migrado e gravado (versão 2)');
  await L.tab(page, 'limites');
  L.ok(await page.$eval('[data-budget-cat="alimentacao"]', el => el.value) === '300', 'planejamento antigo continua aparecendo');

  L.section('Falha da nuvem não vira perfil vazio em silêncio');
  const p2 = await browser.newPage();
  await p2.evaluateOnNewDocument(() => { window.claude = {use: async () => { throw new Error('tempo esgotado'); }}; });
  await p2.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await p2.waitForSelector('#modalTitle');
  L.ok(await p2.$eval('#modalTitle', el => el.textContent) === 'Não foi possível acessar seus dados', 'pergunta antes de usar o navegador');
  const body = await p2.$eval('#modalRoot', el => el.textContent);
  L.ok(/tempo esgotado/.test(body) && /Nada foi apagado/.test(body) && /só este navegador/.test(body), 'explica o erro e o que acontece se continuar');
  L.ok(/Continuar só neste navegador/.test(body) && /Tentar de novo/.test(body), 'oferece tentar de novo ou continuar');
  await p2.click('#modalRoot .modal-actions [data-modal-close]'); await L.sleep(300);
  L.ok(await p2.$eval('#viewApp', el => !el.hidden), 'continuando, entra só neste navegador');
  L.ok(await p2.$eval('#storageBtn', el => el.textContent) === 'Só neste navegador', 'e o topo mostra que está no navegador');
  await p2.close();
});
