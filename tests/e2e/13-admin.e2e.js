// Painel de administração (tela), com as funções do servidor trocadas por dados falsos.
// As permissões de verdade são testadas no banco (npm run test:db).
import * as L from './lib.js';

L.run(async ({page}) => {
  // Antes do login: o app passa a "ver" um admin e funções de servidor falsas.
  await page.evaluateOnNewDocument(() => {
    window.__adm = {resets: [], blocked: [], deleted: [], content: []};
  });
  await page.goto(L.BASE, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('granaleve_backend', 'local'); });
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.evaluate(async () => {
    const {Store} = await import('/js/data/store.js');
    const me = () => JSON.parse(localStorage.getItem('granaleve_session_v1')).emailKey;
    const A = window.__adm;
    Store.isAdmin = async () => true;
    Store.adminMetrics = async () => ({accounts: 3, accounts_new_7d: 1, active_7d: 2, blocked: 0, participants: 1,
      events_30d: {'usou:chat': 5, 'abriu:planejar': 2}, chat_corrections: {category: 2}, chat_saves: 4, age_ranges: {'18-24': 1}, ufs: {PR: 1}});
    Store.adminAccounts = async () => [
      {id: me(), email: 'eu@teste.com', name: 'Eu', role: 'admin', blocked: false, participating: false, created_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-10T10:00:00Z'},
      {id: 'u2', email: 'maria@teste.com', name: 'Maria', role: 'user', blocked: A.blocked.includes('u2'), participating: true, created_at: '2026-10-02T10:00:00Z', last_sign_in_at: null},
      {id: 'u3', email: 'joao@teste.com', name: 'João', role: 'user', blocked: false, participating: false, created_at: '2026-10-03T10:00:00Z', last_sign_in_at: null}
    ].filter(a => !A.deleted.includes(a.id));
    Store.resetPassword = async (email, redirectTo) => { A.resets.push([email, redirectTo]); };
    Store.adminSetBlocked = async (id, v) => { if (v) A.blocked.push(id); else A.blocked = A.blocked.filter(x => x !== id); };
    Store.adminDeleteAccount = async (id) => { A.deleted.push(id); };
    Store.listContent = async () => A.content;
    Store.adminSaveContent = async (id, kind, position, data) => { A.content = A.content.filter(c => c.id !== id).concat([{id, kind, position, data}]); };
  });
  const email = 'adm' + Date.now() + '@teste.com';
  await page.evaluate((k) => localStorage.setItem('granaleve_prefs_' + k, JSON.stringify({quickEntryOff: true})), email);
  await page.click('[data-action="go-signup"]');
  await page.type('#signupName', 'Admin'); await page.type('#signupEmail', email); await page.type('#signupPassword', 'senha@123');
  await page.click('#signupStorageOk'); await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#viewApp:not([hidden])'); await L.sleep(300);

  L.section('Acesso');
  L.ok(!(await page.$eval('#navAdmin', el => el.hidden)), 'admin vê “Administração” no menu');
  await page.click('#navAdmin'); await L.sleep(200);
  L.ok(/Contas\s*3/.test(await L.text(page, '#adminBody')) && /Usou o lançamento por mensagem/.test(await L.text(page, '#adminBody')), 'métricas aparecem com nomes legíveis');

  L.section('Contas: redefinir senha');
  await page.click('#admbtn-contas'); await L.sleep(200);
  const rows = await page.$$eval('#admAccounts tbody tr', trs => trs.map(t => t.textContent.replace(/\s+/g, ' ')));
  L.ok(rows.length === 3 && /você/.test(rows[0]) && !/Redefinir senha/.test(rows[0]), 'na própria linha não há ações (nem redefinir senha)');
  L.ok(/Redefinir senha/.test(rows[1]) && /Redefinir senha/.test(rows[2]), 'as outras contas têm “Redefinir senha”');
  await page.click('[data-adm-reset="u2"]'); await L.sleep(150);
  L.ok(await L.modalTitle(page) === 'Enviar redefinição de senha?', 'pede confirmação');
  L.ok(/maria@teste\.com/.test(await L.text(page, '#modalRoot')) && /não vê nem define a senha/.test(await L.text(page, '#modalRoot')), 'explica para quem vai e que o admin não vê a senha');
  await L.closeModal(page);
  L.ok((await page.evaluate(() => window.__adm.resets)).length === 0, 'cancelar não envia nada');
  await page.click('[data-adm-reset="u2"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(150);
  const resets = await page.evaluate(() => window.__adm.resets);
  L.ok(resets.length === 1 && resets[0][0] === 'maria@teste.com' && resets[0][1] === L.BASE, 'envia o e-mail de redefinição para a pessoa, voltando para o site');
  L.ok(/E-mail de redefinição enviado para maria@teste\.com/.test(await L.allToasts(page)), 'confirma o envio');

  L.section('Contas: bloquear, buscar e excluir');
  await page.click('[data-adm-block="u2"]'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(250);
  L.ok(/Bloqueada/.test(await page.$eval('[data-adm-block="u2"]', el => el.closest('tr').textContent)), 'conta bloqueada aparece como bloqueada');
  await page.click('[data-adm-reset="u2"]'); await L.sleep(150);
  L.ok(/está bloqueada/.test(await L.text(page, '#modalRoot')), 'redefinir senha de conta bloqueada avisa do bloqueio');
  await L.closeModal(page);
  await page.type('#admSearch', 'joão'); await L.sleep(100);
  L.ok(await page.$$eval('#admAccounts tbody tr', trs => trs.length) === 1, 'busca filtra a lista');
  await page.click('[data-adm-delete="u3"]'); await L.sleep(150);
  L.ok(/não pode ser desfeito/.test(await L.text(page, '#modalRoot')), 'excluir avisa que não tem volta');
  await L.submitModal(page); await L.sleep(250);
  L.ok((await page.evaluate(() => window.__adm.deleted)).includes('u3') && !/joao@teste/.test(await L.text(page, '#admAccounts')), 'conta excluída sai da lista');

  L.section('Conteúdos e estudo');
  await page.click('#admbtn-conteudos'); await L.sleep(150);
  L.ok(/usando as dicas padrão/.test(await L.text(page, '#adminBody')), 'sem dicas no banco, avisa que usa as padrão');
  await page.click('[data-adm-seed]'); await L.sleep(400);
  L.ok((await page.evaluate(() => window.__adm.content.length)) === 10, 'copia as 10 dicas padrão');
  await page.click('#admbtn-estudo'); await L.sleep(100);
  L.ok(/Baixar CSV do estudo/.test(await L.text(page, '#adminBody')) && /Comitê de Ética/.test(await L.text(page, '#adminBody')), 'estudo tem exportação e lembrete do comitê de ética');

  L.section('Celular');
  await page.setViewport({width: 375, height: 800});
  await page.click('#admbtn-contas'); await L.sleep(200);
  L.ok(await L.noHorizontalScroll(page), 'painel cabe na tela (a tabela rola por dentro)');
});
