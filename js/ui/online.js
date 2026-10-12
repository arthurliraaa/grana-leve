/*
 * Conta no servidor (Supabase): sessão, links de e-mail, registro de uso do estudo.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */

import * as Research from '../domain/research.js';
import {passwordRulesHtml, wirePasswordRules} from './password.js';

import {Store, COLLECTIONS} from '../data/store.js';
import {readBackup} from '../data/backup.js';
import {authMessage, retryAfter} from '../data/supabase.js';
import {EMAIL_LINK_HOURS, EMAIL_RESEND_SECONDS} from '../config.js';
import {makePasswordRecord, verifyPassword, passwordProblem, sanitizeEmailKey, validEmail, emailTypo, linkWait, markLinkSent, lockRemaining, registerFail, clearFails} from '../data/auth.js';
import {saveSession, newSession, getPrefs, setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {enterApp, loadAllData, logout, openAuth, renderAll, renderTopbar, showAuthTab, showView} from './shell.js';
import {State, k} from './state.js';
import {ONLINE_PAGES} from './constants.js';
import {termsOk, termsProblem, termsRecord} from '../domain/terms.js';

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
  // Formato antigo do link de senha (#access_token=...&type=recovery): o Supabase já abriu a sessão.
  if (!tokenHash && !failed && h.get('access_token') && type === 'recovery'){ history.replaceState(null, '', siteUrl()); return {ok: true, type: 'recovery'}; }
  if (!tokenHash && !failed) return null;
  if (failed && !tokenHash && !type && (function(){ try { return sessionStorage.getItem(OAUTH_FLAG) === 'google'; } catch(e){ return false; } })()){
    history.replaceState(null, '', siteUrl());
    return {oauthError: q.get('error_description') || h.get('error_description') || 'acesso negado'};
  }
  history.replaceState(null, '', siteUrl());   // o token não fica no endereço nem no histórico
  if (failed || !type) return {error: true, type: type};
  try { await Store.verifyEmailLink(tokenHash, type); return {ok: true, type: type}; }
  catch(e){ return {error: true, type: type, offline: /fetch|network/i.test(String(e && e.message))}; }
}
var HOURS_TEXT = EMAIL_LINK_HOURS === 1 ? '1 hora' : EMAIL_LINK_HOURS + ' horas';
var LINK_RULES = 'O link vale por ' + HOURS_TEXT + ' e só pode ser usado uma vez. Se você pedir outro, só o do e-mail mais recente funciona.';

// Pede um link por e-mail respeitando o intervalo entre pedidos. send(email) chama o servidor.
// Retorna {error} para mostrar no formulário ou {sent: true}.
async function requestLink(kind, email, send){
  var wait = linkWait(kind, email, EMAIL_RESEND_SECONDS);
  if (wait) return {error: 'Já enviamos um link para esse e-mail agora há pouco. Espere ' + wait + ' segundos para pedir outro: enquanto isso, o link enviado continua valendo.'};
  try { await send(email); }
  catch(err){
    var cause = err.cause || err;
    // O servidor diz quanto falta: guarda para o próximo pedido não ser recusado de novo.
    var left = retryAfter(cause);
    if (left) markLinkSent(kind, email, Date.now() - (EMAIL_RESEND_SECONDS - left) * 1000);
    return {error: authMessage(cause)};
  }
  markLinkSent(kind, email);
  return {sent: true};
}
async function linkSentModal(title, intro){
  await openModal({title: title, submitLabel: null, cancelLabel: 'Entendi',
    body: '<p>' + intro + '</p>' +
      '<ul class="link-tips"><li>' + escapeHtml(LINK_RULES) + '</li>' +
      '<li>Pode levar alguns minutos. Confira também o <strong>Spam</strong> e as abas <strong>Promoções</strong> ou <strong>Atualizações</strong>.</li>' +
      '<li>Não chegou depois de alguns minutos? Confira se o e-mail está escrito certo e peça de novo.</li></ul>'});
}
// E-mail com domínio parecido com um provedor (gmaill.com): pergunta antes de seguir.
// Retorna o e-mail escolhido, ou null se a pessoa fechou.
export async function confirmEmailTypo(email){
  var fix = emailTypo(email);
  if (!fix) return email;
  var r = await openModal({title: 'Confira o seu e-mail',
    body: '<p>Você digitou <strong>' + escapeHtml(email) + '</strong>. Quis dizer <strong>' + escapeHtml(fix) + '</strong>?</p>' +
      '<p class="field-hint">Um e-mail com erro de digitação não recebe os nossos links (confirmação e nova senha).</p>',
    submitLabel: 'Usar ' + fix, cancelLabel: null,
    onOpen: function(modal, close){
      var keep = document.createElement('button');
      keep.type = 'button'; keep.className = 'btn btn-ghost'; keep.textContent = 'Manter como digitei';
      keep.addEventListener('click', function(){ close('keep'); });
      qs('.modal-actions', modal).prepend(keep);
    }});
  return r === 'keep' ? email : r ? fix : null;
}
export async function linkProblemModal(link){
  var recovery = link.type === 'recovery';
  if (link.offline){ toast('Sem conexão com o servidor. Abra o link de novo quando a internet voltar.'); return; }
  var r = await openModal({
    title: 'Este link expirou ou já foi usado',
    body: '<p>' + (recovery ? 'Cada link para criar uma nova senha vale por ' + HOURS_TEXT + ' e só pode ser usado uma vez. Se você pediu mais de um, só o do e-mail mais recente funciona.' :
        'O link de confirmação vale por ' + HOURS_TEXT + ' e só pode ser usado uma vez. Se você já confirmou, é só entrar.') + '</p>' +
      (recovery ? '' : '<div class="field"><label for="lkEmail">Seu e-mail</label><input id="lkEmail" name="email" type="email" autocomplete="username" maxlength="120"></div>'),
    submitLabel: recovery ? 'Pedir um novo link' : 'Enviar novo link', cancelLabel: 'Agora não',
    onSubmit: async function(form){
      if (recovery) return {forgot: true};
      var email = form.email.value.trim();
      if (!validEmail(email)) return {error: 'Informe um e-mail válido.'};
      return requestLink('signup', email, function(e){ return Store.resendConfirmation(e, siteUrl()); });
    }
  });
  if (r && r.forgot) forgotPassword();
  if (r && r.sent) await linkSentModal('Enviamos um novo link', 'Abra o e-mail e toque no link para ativar a conta.');
}
// Link aceito, mas sem sessão aberta (confirmação feita em outro aparelho, ou a primeira das duas
// confirmações da troca de e-mail): explica o próximo passo em vez de só mostrar a página inicial.
export async function linkDoneModal(link){
  var change = link.type === 'email_change';
  await openModal({title: change ? 'Falta só mais uma confirmação' : 'E-mail confirmado',
    submitLabel: change ? null : 'Entrar', cancelLabel: change ? 'Entendi' : 'Agora não',
    body: change ? '<p>Recebemos esta confirmação. Para concluir a troca de e-mail, abra também o link que enviamos para o outro endereço (o atual e o novo recebem um link cada).</p>' +
        '<p>Depois disso, entre com o <strong>novo e-mail</strong> e a mesma senha.</p>' :
      '<p>Pronto! Agora é só entrar com o seu e-mail e a senha que você criou.</p>',
    onSubmit: function(){ return true; }
  }).then(function(go){ if (go) openAuth('login'); });
}
// Janela obrigatória (não fecha sem decidir) para quem entrou pelo Google: aceitar os termos.
// Retorna o registro do aceite, ou null se a pessoa preferiu sair.
export async function termsGate(){
  return openModal({
    title: 'Antes de continuar', cancelLabel: 'Sair', submitLabel: 'Aceitar e continuar',
    body: '<p>Para usar o Grana Leve, leia e aceite os termos.</p>' +
      '<details class="term-peek"><summary>Ler os Termos de uso</summary>' + ONLINE_PAGES.termos.body + '</details>' +
      '<details class="term-peek"><summary>Ler a Política de privacidade</summary>' + ONLINE_PAGES.privacidade.body + '</details>' +
      '<label class="check terms-check"><input type="checkbox" name="accept"> <span>Li e aceito os Termos de uso e a Política de privacidade.</span></label>',
    onSubmit: function(form){
      var problem = termsProblem(form.accept.checked);
      return problem ? {error: problem} : termsRecord();
    }
  });
}
export async function startOnlineSession(user){
  var profile = await Store.getUser(user.id).catch(function(){ return null; });
  if (profile && profile.blocked){
    await Store.signOut();
    toast('Esta conta está bloqueada. Fale com a equipe do Grana Leve.');
    showView('viewLanding'); renderTopbar();
    return;
  }
  // Termos e maioridade: quem entrou pelo Google (ou criou a conta antes desta regra) aceita agora.
  if (Store.mode === 'supabase' && !termsOk(user.user_metadata)){
    var accepted = await termsGate();
    if (!accepted){
      await Store.signOut();
      toast('Sem aceitar os termos não dá para usar o Grana Leve. Você saiu da conta.');
      showView('viewLanding'); renderTopbar();
      return;
    }
    try { await Store.saveTerms(accepted); } catch(e){ toast('Não foi possível guardar o aceite agora. Tente de novo.'); await Store.signOut(); showView('viewLanding'); renderTopbar(); return; }
  }
  State.session = {emailKey: user.id, name: (profile && profile.name) || (user.user_metadata && user.user_metadata.name) || user.email.split('@')[0], email: user.email};
  try { await enterApp(profile || null); }
  catch(e){
    // Sem conexão (ou servidor fora do ar): não mostra um app vazio como se não houvesse dados.
    State.session = null;
    console.warn('[Grana Leve] erro ao abrir a conta:', e);
    showView('viewLanding'); renderTopbar();
    var offline = e && e.offline || navigator.onLine === false;
    var retry = await openModal({title: 'Não foi possível abrir sua conta',
      body: '<p>' + (offline ? 'Você está sem internet. O Grana Leve precisa de conexão para abrir sua conta.' :
        'Algo impediu de abrir sua conta agora. Seus dados continuam salvos.') + '</p>' +
        (offline ? '' : '<p class="field-hint">Detalhe técnico, se precisar avisar a equipe: ' + escapeHtml(String((e && (e.message || e.userMessage)) || e).slice(0, 160)) + '</p>'),
      submitLabel: 'Tentar de novo', cancelLabel: 'Fechar'});
    if (retry) location.reload();
  }
}
// “Esqueci minha senha”: funciona sem estar logado (tela de entrar) e também de dentro do app
// (Perfil), com o e-mail da conta já preenchido.
export async function forgotPassword(prefill){
  var initial = prefill || (document.getElementById('loginEmail') || {}).value || '';
  var r = await openModal({
    title: 'Criar nova senha',
    body: '<p>Informe o e-mail da conta. Se ele estiver cadastrado, enviamos um link para você criar uma senha nova, sem precisar da antiga.</p>' +
      '<div class="field"><label for="fpEmail">E-mail</label><input id="fpEmail" name="email" type="email" autocomplete="username" maxlength="120" value="' + escapeHtml(initial) + '"></div>' +
      '<p class="field-hint">' + escapeHtml(LINK_RULES) + '</p>',
    submitLabel: 'Enviar link',
    onSubmit: async function(form){
      var email = form.email.value.trim();
      if (!validEmail(email)) return {error: 'Informe um e-mail válido.'};
      var sent = await requestLink('recovery', email, function(e){ return Store.resetPassword(e, siteUrl()); });
      return sent.error ? sent : {email: email};
    }
  });
  if (r && r.email) await linkSentModal('Confira o seu e-mail', 'Se houver uma conta com <strong>' + escapeHtml(r.email) + '</strong>, enviamos o link para criar a nova senha. Abra o link neste ou em outro aparelho: não é preciso estar logado.');
}
// Quem entra pelo link de nova senha define a senha antes de usar o app. Na volta pelo link, isso
// acontece antes de abrir os dados (nada abre por cima). Retorna true se a senha foi trocada;
// cancelar encerra a sessão aberta pelo link e a senha antiga continua valendo.
export async function newPasswordModal(){
  var done = await openModal({
    title: 'Escolha a nova senha',
    cancelLabel: 'Cancelar',
    onOpen: function(modal){ wirePasswordRules(qs('#npPass', modal), qs('#npPwRules', modal)); },
    body: '<p>Crie a nova senha da sua conta. Se cancelar, a senha antiga continua valendo.</p>' +
      '<div class="field"><label for="npPass">Nova senha</label><input id="npPass" name="pass" type="password" autocomplete="new-password" minlength="6" maxlength="128">' +
      passwordRulesHtml('npPwRules') + '</div>' +
      '<div class="field"><label for="npPass2">Repita a nova senha</label><input id="npPass2" name="pass2" type="password" autocomplete="new-password" maxlength="128"></div>',
    submitLabel: 'Salvar nova senha',
    onSubmit: async function(form){
      var problem = passwordProblem(form.pass.value);
      if (problem) return {error: problem};
      if (form.pass.value !== form.pass2.value) return {error: 'As duas senhas não são iguais.'};
      try { await Store.updatePassword(form.pass.value); }
      catch(err){
        var cause = err.cause || err;
        // Sessão do link perdida (aba aberta por muito tempo): só um link novo resolve.
        if (/session|jwt|not authenticated|auth session missing/i.test(String(cause.message))) return {error: 'O link perdeu a validade enquanto a tela estava aberta. Cancele e peça um novo link.'};
        return {error: authMessage(cause)};
      }
      return true;
    }
  });
  if (done){ toast('Senha atualizada. Use a nova senha nas próximas entradas.'); return true; }
  if (State.session) logout(); else await Store.signOut().catch(function(){});
  toast('A senha não foi trocada. Quando quiser, peça um novo link em “Esqueci minha senha”.');
  return false;
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

// Entrar com o Google: aparece só se o Google estiver ligado no Supabase (consulta uma vez).
var googleCheck = null;
export function syncGoogleButton(){
  var box = document.getElementById('googleBox');
  if (Store.mode !== 'supabase' || !Store.googleEnabled){ box.hidden = true; return; }
  if (!googleCheck) googleCheck = Store.googleEnabled();
  googleCheck.then(function(on){ box.hidden = !on; });
}
var OAUTH_FLAG = 'granaleve_oauth';
async function startGoogle(){
  var err = document.getElementById('googleError');
  err.textContent = '';
  try { sessionStorage.setItem(OAUTH_FLAG, 'google'); } catch(e){ /* sem sessionStorage: só não mostra o boas-vindas */ }
  try { await Store.signInWithGoogle(siteUrl()); }   // o navegador sai para o Google
  catch(e){ try { sessionStorage.removeItem(OAUTH_FLAG); } catch(x){ /* nada */ } err.textContent = authMessage(e.cause || e); }
}
// Volta do Google: true se o app abriu por aí (e limpa a marca).
export function cameFromGoogle(){
  var v = null;
  try { v = sessionStorage.getItem(OAUTH_FLAG); sessionStorage.removeItem(OAUTH_FLAG); } catch(e){ /* nada */ }
  return v === 'google';
}

// Mensagem de “confirme seu e-mail” no login: botão para pedir o link de novo.
function offerResend(errEl, email){
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'linklike'; b.textContent = 'Reenviar o link de confirmação';
  b.addEventListener('click', async function(){
    var r = await requestLink('signup', email, function(e){ return Store.resendConfirmation(e, siteUrl()); });
    if (r.error){ errEl.textContent = r.error; return; }
    errEl.textContent = '';
    await linkSentModal('Enviamos um novo link', 'Abra o e-mail enviado para <strong>' + escapeHtml(email) + '</strong> e toque no link para ativar a conta.');
  });
  errEl.append(' ', b);
}

// Eventos de entrar e criar conta.
export function wireAuth(){
  qsa('[data-authtab]').forEach(function(b){ b.addEventListener('click', function(){ showAuthTab(b.getAttribute('data-authtab')); }); });
  document.getElementById('forgotBtn').addEventListener('click', function(){ forgotPassword(); });
  document.getElementById('googleBtn').addEventListener('click', startGoogle);
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
        State.freshLogin = true;   // a pergunta "teve gastos?" aparece só depois de um login de verdade
        await startOnlineSession(res.user);
        toast('Bem-vindo de volta, ' + State.session.name.split(' ')[0] + '!');
      } catch(err){
        var cause = err.cause || err;
        errEl.textContent = authMessage(cause);
        // Conta ainda não confirmada: oferece mandar o link de novo ali mesmo.
        if (/email not confirmed|email_not_confirmed/i.test((cause.code || '') + ' ' + (cause.message || ''))) offerResend(errEl, email);
      }
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
      State.freshLogin = true;
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
    var tErr = termsProblem(document.getElementById('signupTerms').checked);
    if (!pwErr && tErr){ errEl.textContent = tErr; return; }
    if (!pwErr){
      // gmaill.com, hotmal.com...: um e-mail errado nunca recebe o link de confirmação.
      var chosen = await confirmEmailTypo(email);
      if (!chosen) return;
      if (chosen !== email){ email = chosen; document.getElementById('signupEmail').value = chosen; }
    }
    if (pwErr){ errEl.textContent = pwErr; return; }
    if (Store.mode === 'local' && !document.getElementById('signupStorageOk').checked){ errEl.textContent = 'Confirme que entendeu onde seus dados ficam.'; return; }
    var research = Research.consentRecord(false);
    if (Store.mode === 'supabase'){
      try{
        var res = await Store.signUp(email, password, {name: name, research: research, terms: termsRecord()}, siteUrl());
        document.getElementById('signupPassword').value = '';
        if (res.session){ State.freshLogin = true; await startOnlineSession(res.user); toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.'); return; }
        // Com confirmação por e-mail ligada, a conta só entra depois do link.
        markLinkSent('signup', email);
        await linkSentModal('Confirme seu e-mail', 'Enviamos um link de confirmação para <strong>' + escapeHtml(email) + '</strong>. Abra o e-mail e toque no link para ativar a conta; depois é só entrar.');
        showAuthTab('login');
        document.getElementById('loginEmail').value = email;
      } catch(err){ errEl.textContent = authMessage(err.cause || err); }
      return;
    }
    var emailKey = sanitizeEmailKey(email);
    try{
      if (await Store.getUser(emailKey)){ errEl.textContent = 'Já existe uma conta com esse e-mail. Tente entrar.'; return; }
      var profile = Object.assign({name: name, email: email, createdAt: Date.now(),
        research: research, terms: termsRecord()},
        await makePasswordRecord(password));
      await Store.createUser(emailKey, profile);
      State.session = newSession(emailKey, profile);
      saveSession(State.session);
      document.getElementById('signupPassword').value = '';
      toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.');
      State.freshLogin = true;
      await enterApp();
    } catch(err){ errEl.textContent = 'Não foi possível criar a conta agora. Tente novamente.'; }
  });
}
