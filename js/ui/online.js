/*
 * Conta no servidor (Supabase): sessão, links de e-mail, registro de uso do estudo.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */

import * as Research from '../domain/research.js';
import {passwordRulesHtml, wirePasswordRules} from './password.js';

import {Store, COLLECTIONS} from '../data/store.js';
import {readBackup} from '../data/backup.js';
import {authMessage} from '../data/supabase.js';
import {makePasswordRecord, verifyPassword, passwordProblem, sanitizeEmailKey, validEmail, lockRemaining, registerFail, clearFails} from '../data/auth.js';
import {saveSession, newSession, getPrefs, setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {enterApp, loadAllData, logout, renderAll, renderTopbar, showAuthTab, showView} from './shell.js';
import {State, k} from './state.js';

/* ---------- Conta no servidor (Supabase) ---------- */
export function siteUrl(){ return location.origin + location.pathname; }
// Depois do link do e-mail (?code=...), limpa o endereço para não ficar com o código à mostra.
export function cleanAuthParams(){
  if (/[?&](code|error|error_description|token_hash|type)=/.test(location.search)) history.replaceState(null, '', siteUrl() + location.hash);
}
// Volta do link do e-mail (?token_hash=...&type=email|recovery). O token só é usado aqui, com o
// app aberto de verdade. Retorna null (não veio de link), {ok, type} ou {error, type}.
export async function handleEmailLink(){
  var q = new URLSearchParams(location.search);
  var h = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  var tokenHash = q.get('token_hash'), type = q.get('type') || h.get('type');
  var failed = q.get('error_description') || h.get('error_description') || q.get('error_code') || h.get('error_code');
  if (!tokenHash && !failed) return null;
  history.replaceState(null, '', siteUrl());   // o token não fica no endereço nem no histórico
  if (failed || !type) return {error: true, type: type};
  try { await Store.verifyEmailLink(tokenHash, type); return {ok: true, type: type}; }
  catch(e){ return {error: true, type: type, offline: /fetch|network/i.test(String(e && e.message))}; }
}
export async function linkProblemModal(link){
  var recovery = link.type === 'recovery';
  if (link.offline){ toast('Sem conexão com o servidor. Abra o link de novo quando a internet voltar.'); return; }
  var r = await openModal({
    title: 'Este link expirou ou já foi usado',
    body: '<p>' + (recovery ? 'O link para criar uma nova senha vale por pouco tempo e só pode ser usado uma vez.' :
        'O link de confirmação vale por pouco tempo e só pode ser usado uma vez. Se você já confirmou, é só entrar.') + '</p>' +
      (recovery ? '' : '<div class="field"><label for="lkEmail">Seu e-mail</label><input id="lkEmail" name="email" type="email" autocomplete="username" maxlength="120"></div>'),
    submitLabel: recovery ? 'Pedir um novo link' : 'Enviar novo link', cancelLabel: 'Agora não',
    onSubmit: async function(form){
      if (recovery) return {forgot: true};
      var email = form.email.value.trim();
      if (!validEmail(email)) return {error: 'Informe um e-mail válido.'};
      try { await Store.resendConfirmation(email, siteUrl()); } catch(err){ return {error: authMessage(err.cause || err)}; }
      return {sent: true};
    }
  });
  if (r && r.forgot) forgotPassword();
  if (r && r.sent) toast('Enviamos um novo link. Ele chega em alguns minutos.');
}
export async function startOnlineSession(user){
  var profile = await Store.getUser(user.id).catch(function(){ return null; });
  if (profile && profile.blocked){
    await Store.signOut();
    toast('Esta conta está bloqueada. Fale com a equipe do Grana Leve.');
    showView('viewLanding'); renderTopbar();
    return;
  }
  State.session = {emailKey: user.id, name: (profile && profile.name) || (user.user_metadata && user.user_metadata.name) || user.email.split('@')[0], email: user.email};
  try { await enterApp(profile || null); }
  catch(e){
    // Sem conexão (ou servidor fora do ar): não mostra um app vazio como se não houvesse dados.
    State.session = null;
    showView('viewLanding'); renderTopbar();
    var retry = await openModal({title: 'Não foi possível abrir sua conta',
      body: '<p>' + (e && e.offline || navigator.onLine === false ? 'Você está sem internet. O Grana Leve precisa de conexão para abrir sua conta.' :
        'O servidor não respondeu agora. Seus dados continuam salvos.') + '</p>',
      submitLabel: 'Tentar de novo', cancelLabel: 'Fechar'});
    if (retry) location.reload();
  }
}
export async function forgotPassword(){
  var r = await openModal({
    title: 'Criar nova senha',
    body: '<p>Informe o e-mail da conta. Se ele estiver cadastrado, enviamos um link para criar uma senha nova.</p>' +
      '<div class="field"><label for="fpEmail">E-mail</label><input id="fpEmail" name="email" type="email" autocomplete="username" maxlength="120" value="' + escapeHtml(document.getElementById('loginEmail').value) + '"></div>',
    submitLabel: 'Enviar link',
    onSubmit: async function(form){
      var email = form.email.value.trim();
      if (!validEmail(email)) return {error: 'Informe um e-mail válido.'};
      try { await Store.resetPassword(email, siteUrl()); } catch(err){ return {error: authMessage(err.cause || err)}; }
      return true;
    }
  });
  if (r) toast('Se houver uma conta com esse e-mail, o link chega em alguns minutos.');
}
// Quem entra pelo link de nova senha precisa definir a senha antes de usar o app:
// cancelar ou fechar encerra a sessão aberta pelo link.
export async function newPasswordModal(){
  var done = await openModal({
    title: 'Escolha a nova senha',
    cancelLabel: 'Cancelar e sair',
    onOpen: function(modal){ wirePasswordRules(qs('#npPass', modal), qs('#npPwRules', modal)); },
    body: '<p>Por segurança, defina a nova senha para continuar. Se cancelar, você sai da conta.</p>' +
      '<div class="field"><label for="npPass">Nova senha</label><input id="npPass" name="pass" type="password" autocomplete="new-password" minlength="6" maxlength="128">' +
      passwordRulesHtml('npPwRules') + '</div>' +
      '<div class="field"><label for="npPass2">Repita a nova senha</label><input id="npPass2" name="pass2" type="password" autocomplete="new-password" maxlength="128"></div>',
    submitLabel: 'Salvar nova senha',
    onSubmit: async function(form){
      var problem = passwordProblem(form.pass.value);
      if (problem) return {error: problem};
      if (form.pass.value !== form.pass2.value) return {error: 'As duas senhas não são iguais.'};
      try { await Store.updatePassword(form.pass.value); } catch(err){ return {error: authMessage(err.cause || err)}; }
      return true;
    }
  });
  if (done){ toast('Senha atualizada. Use a nova senha nas próximas entradas.'); return; }
  logout();
  toast('Você saiu da conta. Quando quiser trocar a senha, peça um novo link.');
}
// Primeira entrada online: se este navegador tem dados da versão local com o mesmo e-mail,
// oferece levar para a conta (só quando a conta ainda está vazia). Retorna true se mostrou a oferta.
export async function offerLocalImport(){
  if (Store.mode !== 'supabase' || getPrefs().localImportDone) return false;
  var local;
  try { local = JSON.parse(localStorage.getItem('granaleve_local_db_v1') || 'null'); } catch(e){ return false; }
  var u = local && local.users && local.users[sanitizeEmailKey(State.session.email)];
  if (!u) return false;
  var data = {};
  COLLECTIONS.forEach(function(c){ data[c] = Array.isArray(u[c]) ? u[c] : []; });
  if (u.budgets && !Array.isArray(u.budgets)) data.budgets = u.budgets;
  var count = COLLECTIONS.reduce(function(n, c){ return n + (Array.isArray(data[c]) ? data[c].length : 0); }, 0);
  if (!count || !(await Store.isEmpty())) return false;
  var ok = await confirmAction({title: 'Trazer os dados deste navegador?',
    message: 'Encontramos ' + data.transactions.length + ' lançamentos e outros ' + (count - data.transactions.length) + ' registros da versão anterior, salvos neste navegador com o seu e-mail. Quer levar tudo para a sua conta? Assim eles aparecem em qualquer aparelho.',
    confirmLabel: 'Trazer para a conta', danger: false});
  setPref('localImportDone', true);
  if (!ok) return true;
  var r = readBackup({app: 'grana-leve', schemaVersion: u.schemaVersion || 1, data: data});
  if (r.error){ toast('Não foi possível trazer os dados: ' + r.error); return true; }
  try { await Store.replaceAll(k(), r.data); } catch(e){ toast('Não foi possível trazer os dados agora. Tente pelo backup.'); return true; }
  await loadAllData();
  renderAll();
  toast('Pronto! Seus dados agora estão na sua conta.');
  return true;
}

/* ---------- Estudo: registro de uso (só de quem aceitou o termo, e só no servidor) ---------- */
export var trackedAt = {};
export function track(event, field, minIntervalMs){
  if (!Store.track || !Research.isParticipating(State.research)) return;
  var key = event + ':' + (field || '');
  if (minIntervalMs && trackedAt[key] && Date.now() - trackedAt[key] < minIntervalMs) return;
  trackedAt[key] = Date.now();
  Store.track(event, field);
}

// Eventos de entrar e criar conta.
export function wireAuth(){
  qsa('[data-authtab]').forEach(function(b){ b.addEventListener('click', function(){ showAuthTab(b.getAttribute('data-authtab')); }); });
  document.getElementById('forgotBtn').addEventListener('click', forgotPassword);
  document.getElementById('signupPwRulesWrap').innerHTML = passwordRulesHtml('signupPwRules');
  wirePasswordRules(document.getElementById('signupPassword'), document.getElementById('signupPwRules'));

  document.getElementById('loginForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errEl = document.getElementById('loginError');
    errEl.textContent = '';
    if (Store.mode === 'supabase'){
      try{
        var res = await Store.signIn(email, password);
        document.getElementById('loginPassword').value = '';
        await startOnlineSession(res.user);
        toast('Bem-vindo de volta, ' + State.session.name.split(' ')[0] + '!');
      } catch(err){ errEl.textContent = authMessage(err.cause || err); }
      return;
    }
    var emailKey = sanitizeEmailKey(email);
    var wait = lockRemaining(emailKey);
    if (wait){ errEl.textContent = 'Muitas tentativas. Aguarde ' + wait + ' segundos e tente de novo.'; return; }
    try{
      var user = await Store.getUser(emailKey);
      var check = user ? await verifyPassword(user, email, password) : {ok:false};
      // Mesma mensagem para e-mail inexistente e senha errada, para não revelar quem tem conta.
      if (!check.ok){ registerFail(emailKey); errEl.textContent = 'E-mail ou senha incorretos.'; return; }
      clearFails(emailKey);
      if (check.legacy){ await Store.updateUser(emailKey, await makePasswordRecord(password)); }
      State.session = newSession(emailKey, user);
      saveSession(State.session);
      document.getElementById('loginPassword').value = '';
      toast('Bem-vindo de volta, ' + user.name.split(' ')[0] + '!');
      await enterApp();
    } catch(err){ errEl.textContent = 'Não foi possível entrar agora. Tente novamente.'; }
  });

  document.getElementById('signupForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('signupName').value.trim();
    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value;
    var errEl = document.getElementById('signupError');
    errEl.textContent = '';
    if (!name){ errEl.textContent = 'Informe seu nome.'; return; }
    if (!validEmail(email)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
    var pwErr = passwordProblem(password);
    if (pwErr){ errEl.textContent = pwErr; return; }
    if (Store.mode === 'local' && !document.getElementById('signupStorageOk').checked){ errEl.textContent = 'Confirme que entendeu onde seus dados ficam.'; return; }
    var research = Research.consentRecord(document.getElementById('signupResearch').checked, document.getElementById('signupAge').value, document.getElementById('signupUf').value);
    if (Store.mode === 'supabase'){
      try{
        var res = await Store.signUp(email, password, {name: name, research: research}, siteUrl());
        document.getElementById('signupPassword').value = '';
        if (res.session){ await startOnlineSession(res.user); toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.'); return; }
        // Com confirmação por e-mail ligada, a conta só entra depois do link.
        await openModal({title: 'Confirme seu e-mail', submitLabel: null, cancelLabel: 'Entendi',
          body: '<p>Enviamos um link de confirmação para <strong>' + escapeHtml(email) + '</strong>. Abra o e-mail e toque no link para ativar a conta; depois é só entrar.</p>' +
            '<p class="field-hint">Não chegou? Confira a caixa de spam. O envio pode levar alguns minutos.</p>'});
        showAuthTab('login');
        document.getElementById('loginEmail').value = email;
      } catch(err){ errEl.textContent = authMessage(err.cause || err); }
      return;
    }
    var emailKey = sanitizeEmailKey(email);
    try{
      if (await Store.getUser(emailKey)){ errEl.textContent = 'Já existe uma conta com esse e-mail. Tente entrar.'; return; }
      var profile = Object.assign({name: name, email: email, createdAt: Date.now(),
        research: research},
        await makePasswordRecord(password));
      await Store.createUser(emailKey, profile);
      State.session = newSession(emailKey, profile);
      saveSession(State.session);
      document.getElementById('signupPassword').value = '';
      toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.');
      await enterApp();
    } catch(err){ errEl.textContent = 'Não foi possível criar a conta agora. Tente novamente.'; }
  });
}
