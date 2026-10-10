/*
 * Perfil e conta: nome, e-mail, senha, preferências, pesquisa, segurança e exclusão da conta.
 * Abre pelo nome no canto superior direito e pelo "Mais".
 */
import {Store} from '../data/store.js';
import {authMessage} from '../data/supabase.js';
import {verifyPassword, makePasswordRecord, passwordProblem, validEmail} from '../data/auth.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, escapeHtml, icon, toast} from './dom.js';
import {formatDateFull} from '../domain/dates.js';
import {passwordRulesHtml, wirePasswordRules} from './password.js';

// ctx: {state(), onNameChange(name), themePref(), setThemePref(v), openResearch(), researchStatus(),
//       openData(), deleteAccount(), logout(), siteUrl()}
var ctx = null;

function online(){ return Store.mode === 'supabase'; }
function initial(name){ return (String(name || '?').trim()[0] || '?').toUpperCase(); }
function card(id, iconName, title, body, extraClass){
  return '<section class="card profile-card' + (extraClass ? ' ' + extraClass : '') + '" aria-labelledby="' + id + '">' +
    '<h3 id="' + id + '" class="profile-title">' + icon(iconName) + title + '</h3>' + body + '</section>';
}
function field(id, label, input){ return '<div class="field"><label for="' + id + '">' + label + '</label>' + input + '</div>'; }
function formMsg(id){ return '<p class="form-error" id="' + id + '" role="alert"></p>'; }

export function renderProfile(){
  var st = ctx.state(), s = st.session;
  var skipped = Object.keys(getPrefs().skipConfirm || {}).length;
  var theme = ctx.themePref();
  function themeOpt(v, label){ return '<label class="check"><input type="radio" name="pfTheme" value="' + v + '"' + (theme === v ? ' checked' : '') + '> ' + label + '</label>'; }

  qs('#profileBody').innerHTML =
    '<div class="profile-hero"><span class="avatar avatar-lg" aria-hidden="true">' + escapeHtml(initial(s.name)) + '</span>' +
      '<div><strong>' + escapeHtml(s.name) + '</strong><span class="tx-meta">' + escapeHtml(s.email) + '</span></div></div>' +

    card('pfT1', 'edit', 'Seu nome',
      '<form id="pfNameForm" class="profile-form">' + field('pfName', 'Como você quer ser chamado(a)', '<input id="pfName" type="text" maxlength="60" autocomplete="name" value="' + escapeHtml(s.name) + '">') +
      formMsg('pfNameMsg') + '<div class="card-actions"><button class="btn btn-primary btn-sm" type="submit">Salvar nome</button></div></form>') +

    card('pfT2', 'chat', 'E-mail',
      '<p class="card-sub">E-mail atual: <strong>' + escapeHtml(s.email) + '</strong></p>' +
      (online() ?
        '<form id="pfEmailForm" class="profile-form">' + field('pfEmail', 'Novo e-mail', '<input id="pfEmail" type="email" maxlength="120" autocomplete="email">') +
        '<p class="field-hint">Por segurança, enviamos um link de confirmação para o e-mail atual e outro para o novo. A troca só vale depois de confirmar.</p>' +
        formMsg('pfEmailMsg') + '<div class="card-actions"><button class="btn btn-primary btn-sm" type="submit">Trocar e-mail</button></div></form>' :
        '<p class="field-hint">Nesta versão, que guarda os dados só no navegador, o e-mail não pode ser trocado.</p>')) +

    card('pfT3', 'lock', 'Senha',
      '<form id="pfPassForm" class="profile-form">' +
        field('pfCurrent', 'Senha atual', '<input id="pfCurrent" type="password" autocomplete="current-password" maxlength="128">') +
        field('pfNew', 'Nova senha', '<input id="pfNew" type="password" autocomplete="new-password" maxlength="128">') +
        field('pfNew2', 'Repita a nova senha', '<input id="pfNew2" type="password" autocomplete="new-password" maxlength="128">') +
        passwordRulesHtml('pfPwRules') +
        (online() ? '<p class="field-hint">Esqueceu a atual? Saia e use “Esqueci minha senha”.</p>' : '') +
        formMsg('pfPassMsg') + '<div class="card-actions"><button class="btn btn-primary btn-sm" type="submit">Trocar senha</button></div></form>') +

    card('pfT4', 'sun', 'Preferências',
      '<fieldset class="radio-group"><legend>Tema</legend>' + themeOpt('system', 'Automático (igual ao aparelho)') + themeOpt('light', 'Claro') + themeOpt('dark', 'Escuro') + '</fieldset>' +
      '<label class="check"><input type="checkbox" id="pfWelcome"' + (getPrefs().quickEntryOff ? '' : ' checked') + '> Perguntar se tive gastos ou ganhos ao entrar (uma vez por dia)</label>' +
      '<div class="pref-row"><span>Confirmações que você pediu para não mostrar mais: <strong>' + skipped + '</strong></span>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="pfResetConfirm"' + (skipped ? '' : ' disabled') + '>Voltar a perguntar</button></div>') +

    card('pfT5', 'book', 'Pesquisa acadêmica',
      '<p class="card-sub" id="pfResearch">' + ctx.researchStatus() + '</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" type="button" id="pfResearchBtn">Ver termo e mudar</button></div>') +

    card('pfT6', 'shield', 'Seus dados e segurança',
      '<div class="pref-row"><span>Backup, onde os dados ficam e importação.</span><button class="btn btn-ghost btn-sm" type="button" id="pfData">Seus dados e backup</button></div>' +
      (online() ? '<div class="pref-row"><span>Esqueceu a conta aberta em outro aparelho? Encerre todas as sessões, inclusive esta.</span><button class="btn btn-ghost btn-sm" type="button" id="pfSignOutAll">Sair de todos os aparelhos</button></div>' : '') +
      (st.profileCreatedAt ? '<p class="tx-meta">Conta criada em ' + formatDateFull(String(st.profileCreatedAt).slice(0, 10)) + '.</p>' : '')) +

    card('pfT7', 'trash', 'Excluir conta',
      '<p class="card-sub">Apaga a conta e todos os seus dados' + (online() ? ' do servidor' : ' deste navegador') + ', inclusive a participação no estudo. Não dá para desfazer: se quiser guardar, salve um backup antes.</p>' +
      '<div class="card-actions"><button class="btn btn-danger btn-sm" type="button" id="pfDelete">Excluir minha conta</button></div>', 'profile-danger');
  wirePasswordRules(qs('#pfNew'), qs('#pfPwRules'));
}

function msg(id, text, ok){
  var el = qs('#' + id);
  el.textContent = text || '';
  el.classList.toggle('form-ok', !!ok);
}

async function saveName(e){
  e.preventDefault();
  var name = qs('#pfName').value.trim();
  if (!name){ msg('pfNameMsg', 'Informe um nome.'); return; }
  try { await Store.updateUser(ctx.state().session.emailKey, {name: name}); }
  catch(err){ msg('pfNameMsg', err.userMessage || 'Não foi possível salvar agora.'); return; }
  ctx.onNameChange(name);
  renderProfile();
  toast('Nome atualizado.');
}

async function changeEmail(e){
  e.preventDefault();
  var email = qs('#pfEmail').value.trim();
  var current = ctx.state().session.email;
  if (!validEmail(email)){ msg('pfEmailMsg', 'Informe um e-mail válido.'); return; }
  if (email.toLowerCase() === current.toLowerCase()){ msg('pfEmailMsg', 'Esse já é o seu e-mail.'); return; }
  try { await Store.updateEmail(email, ctx.siteUrl()); }
  catch(err){ msg('pfEmailMsg', authMessage(err.cause || err)); return; }
  qs('#pfEmail').value = '';
  msg('pfEmailMsg', 'Pronto! Abra os links enviados para ' + current + ' e para ' + email + ' para concluir a troca.', true);
}

async function changePassword(e){
  e.preventDefault();
  var cur = qs('#pfCurrent').value, next = qs('#pfNew').value, again = qs('#pfNew2').value;
  var s = ctx.state().session;
  if (!cur){ msg('pfPassMsg', 'Informe a senha atual.'); return; }
  var problem = passwordProblem(next);
  if (problem){ msg('pfPassMsg', problem); return; }
  if (next !== again){ msg('pfPassMsg', 'As duas senhas novas não são iguais.'); return; }
  if (next === cur){ msg('pfPassMsg', 'A nova senha precisa ser diferente da atual.'); return; }
  try {
    if (online()){
      try { await Store.checkPassword(s.email, cur); } catch(err){ msg('pfPassMsg', /credentials/i.test(String(err.message)) ? 'A senha atual está incorreta.' : authMessage(err.cause || err)); return; }
      await Store.updatePassword(next);
    } else {
      var user = await Store.getUser(s.emailKey);
      var check = await verifyPassword(user, s.email, cur);
      if (!check.ok){ msg('pfPassMsg', 'A senha atual está incorreta.'); return; }
      await Store.updateUser(s.emailKey, await makePasswordRecord(next));
    }
  } catch(err){ msg('pfPassMsg', err.userMessage || authMessage(err.cause || err)); return; }
  ['#pfCurrent', '#pfNew', '#pfNew2'].forEach(function(sel){ qs(sel).value = ''; });
  qs('#pfNew').dispatchEvent(new Event('input'));
  msg('pfPassMsg', 'Senha trocada. Use a nova senha nas próximas entradas.', true);
  toast('Senha trocada.');
}

export function initProfile(context){
  ctx = context;
  var panel = document.getElementById('tab-perfil');
  panel.addEventListener('submit', function(e){
    if (e.target.id === 'pfNameForm') saveName(e);
    if (e.target.id === 'pfEmailForm') changeEmail(e);
    if (e.target.id === 'pfPassForm') changePassword(e);
  });
  panel.addEventListener('change', function(e){
    if (e.target.name === 'pfTheme') ctx.setThemePref(e.target.value);
    if (e.target.id === 'pfWelcome'){ setPref('quickEntryOff', !e.target.checked); toast(e.target.checked ? 'A pergunta ao entrar está ligada.' : 'A pergunta ao entrar está desligada.'); }
  });
  panel.addEventListener('click', async function(e){
    var id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'pfResetConfirm'){ setPref('skipConfirm', {}); renderProfile(); toast('As confirmações voltaram a aparecer.'); }
    if (id === 'pfResearchBtn') ctx.openResearch();
    if (id === 'pfData') ctx.openData();
    if (id === 'pfDelete') ctx.deleteAccount();
    if (id === 'pfSignOutAll'){
      try { await Store.signOutAll(); } catch(err){ toast('Não foi possível agora. Verifique a internet.'); return; }
      ctx.logout();
      toast('Você saiu de todos os aparelhos.');
    }
  });
}
