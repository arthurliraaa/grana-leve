/*
 * Estrutura do app: telas, barra do topo, carregamento dos dados, navegação entre abas e inicialização.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {whatsappNumber} from '../domain/contact.js';
import {todayKey} from '../domain/dates.js';
import {money, fmtMoney, sumMoney} from '../domain/money.js';
import {findById} from '../domain/util.js';
import {isReversal, linkedToDelete} from '../domain/transactions.js';

import {renderProfile} from './profile.js';
import {renderBills, fillBillForm, resetBillsView, runAutoBills, skipBillsOf, billNamesOf} from './bills.js';
import {Store, COLLECTIONS} from '../data/store.js';
import {buildBackup} from '../data/backup.js';
import {loadSession, clearSession, getPrefs, setPref, setPrefsOwner} from '../data/session.js';

import {captchaEnabled, getCaptchaToken, mountCaptcha} from './captcha.js';
import {qs, qsa, escapeHtml, icon, saveFile, toast} from './dom.js';
import {openModal, confirmAction, attachCounters} from './modal.js';
import {editAccount, editVoucher, openTransfer, renderAccounts, renderVouchers, toggleInvoicePaid, undoBalanceAdjust, undoInvoiceAdvance} from './accounts-tab.js';
import {cardReport, editCard, renderCards} from './cards-tab.js';
import {maybeWelcome, openQuickEntry} from './chat.js';
import {openFeedback} from './feedback.js';
import {maybeTutorial, startTutorial} from './tutorial.js';
import {leaveShared, openPendingFor, syncShared} from './shared-sync.js';
import {acceptPendingCharge, capturePendingCharge} from './share-charge.js';
import {chargePerson, chargeReceivable, editDebt, editReceivable, shareRecv, forgiveReceivable, linkReceivable, payDebt, receiveAll, receiveReceivable, renderDebts, renderReceivables, undoPayment, syncReceivable} from './commitments-tab.js';
import {explainReturn, hasSalaryData, openParcels, receiveForecast, renderBarChart, renderDashboard, renderDonut, renderStatTiles, renderSummary, setDashSection, DASH_SECTIONS, setDonutScope, setDonutStyle, toggleDashView} from './home-tab.js';
import {renderConnections, renderLearn} from './learn-tab.js';
import {TIPS, TIPS_GROW} from './constants.js';
import {renderAdvice, wireAdvice} from './advice-tab.js';
import {preloadPdfLibWhenIdle} from './pdf.js';
import {disablePush, maybeSyncPush, pushActive, wirePushResync} from './push.js';
import {maybeWhatsNew} from './whats-new.js';
import {showSplash, hideSplash} from './splash.js';
import {dataModal, showInfo} from './my-data.js';
import {cameFromGoogle, cleanAuthParams, handleEmailLink, linkDoneModal, linkProblemModal, newPasswordModal, offerLocalImport, startOnlineSession, siteUrl, syncGoogleButton, track} from './online.js';
import {editGoal, goalMove, renderBudgets, renderGoals} from './planning-tab.js';
import {generateInvoicePdf, generateAllInvoicesPdf} from './reports.js';
import {State, accountName, catLabel, k, sortTransactions} from './state.js';
import {advanceInstallments, openTxModal, showBudgetPopup} from './tx-edit.js';
import {TX_SORTS, populateCategorySelect, populateInstallSelect, populatePaymentSelect, renderTransactionsTab, syncTxFormVisibility} from './tx-list.js';

/* ============ Excluir lançamento com itens ligados ============ */

// Frase do que vai junto, para a janela de confirmação. Vazia se não há nada ligado.
function linkedMessage(l){
  var parts = [], adv = l.advances || [];
  var got = l.refunds.filter(function(t){ return !t.writeOff; }), off = l.refunds.filter(function(t){ return t.writeOff; });
  if (adv.length) parts.push((adv.length === 1 ? 'o adiantamento de parcelas' : 'os ' + adv.length + ' adiantamentos de parcelas') + ' (' + fmtMoney(sumMoney(adv, function(t){ return t.amount; })) + ')');
  if (l.reversals.length) parts.push((l.reversals.length === 1 ? 'o estorno ligado' : 'os ' + l.reversals.length + ' estornos ligados') + ' (' + fmtMoney(-sumMoney(l.reversals, function(t){ return t.amount; })) + ')');
  if (l.receivables.length) parts.push('o valor a receber de ' + l.receivables.map(function(r){ return r.person; }).join(', ') + ' em “Me devem”');
  if (got.length) parts.push(got.length === 1 ? 'o recebimento já registrado' : 'os ' + got.length + ' recebimentos já registrados');
  if (off.length) parts.push(off.length === 1 ? 'o registro de “não devolvido” ligado' : 'os ' + off.length + ' registros de “não devolvido” ligados');
  if (!parts.length) return '';
  var last = parts.pop();
  var shared = l.receivables.filter(function(r){ return r.sharedWith || r.sharedId; }).map(function(r){ return String(r.person || '').split(' ')[0]; });
  return ' Também apaga ' + (parts.length ? parts.join(', ') + ' e ' : '') + last + '.' +
    (shared.length ? ' A cobrança compartilhada também deixa de existir para ' + shared.join(', ') + '.' : '');
}

/* ============ Rendering ============ */

export function showView(name){
  // Entrar e Criar conta abrem numa janela por cima da página inicial (viewAuth).
  if (name === 'viewAuth'){ openAuth(State.authTab || 'login'); return; }
  closeAuth(true);
  ['viewLanding','viewApp'].forEach(function(id){
    document.getElementById(id).hidden = (id !== name);
  });
  document.getElementById('bottomnav').hidden = (name !== 'viewApp');
  window.scrollTo(0,0);
}

// Janela de entrar / criar conta sobre a página inicial: fecha no X, no fundo ou com Esc, e o resto
// da página fica inerte enquanto ela está aberta (o Tab não sai dela).
var authBehind = [], authReturn = null;
export function openAuth(tab){
  var box = document.getElementById('viewAuth');
  if (box.hidden){
    authReturn = document.activeElement;
    document.getElementById('viewLanding').hidden = false;
    document.getElementById('viewApp').hidden = true;
    document.getElementById('bottomnav').hidden = true;
    box.hidden = false;
    document.body.classList.add('auth-open');
    authBehind = qsa('body > *').filter(function(el){ return el !== box && el.id !== 'modalRoot' && el.id !== 'toastWrap' && !el.hasAttribute('inert') && !el.classList.contains('captcha-box'); });
    authBehind.forEach(function(el){ el.setAttribute('inert', ''); });
  }
  showAuthTab(tab || 'login');
  syncGoogleButton();
  var first = qs(tab === 'signup' ? '#signupName' : '#loginEmail');
  if (first) first.focus();
}
// quiet: fechada pelo próprio app (ex.: entrou na conta), sem devolver o foco.
export function closeAuth(quiet){
  var box = document.getElementById('viewAuth');
  if (box.hidden) return;
  box.hidden = true;
  document.body.classList.remove('auth-open');
  authBehind.forEach(function(el){ el.removeAttribute('inert'); });
  authBehind = [];
  if (!quiet && authReturn && authReturn.focus && document.body.contains(authReturn)) authReturn.focus();
  authReturn = null;
}

export function renderTopbar(){
  var wrap = document.getElementById('topbarActions');
  if (State.session){
    var cloud = Store.mode === 'cloud' || Store.mode === 'supabase';
    var where = Store.mode === 'supabase' ? 'Dados salvos na sua conta, em servidor no Brasil.' : cloud ? 'Dados salvos na nuvem do app.' : 'Dados salvos só neste navegador.';
    wrap.innerHTML =
      '<button type="button" class="sync-badge" id="storageBtn" title="' + where + ' Toque para ver detalhes e backup." aria-label="' + where + ' Ver detalhes e backup">' +
        '<span class="sync-dot ' + (cloud ? 'cloud' : 'local') + '" aria-hidden="true"></span><span class="sync-text">' + (Store.mode === 'supabase' ? 'Sincronizado' : cloud ? 'Na nuvem' : 'Só neste navegador') + '</span>' +
      '</button>' +
      // O nome lido pelo leitor de tela começa pelo texto visível (“Olá, Arthur”) e diz para onde leva.
      '<button type="button" class="user-chip" id="profileBtn" title="Perfil e conta">' +
        '<span class="avatar" aria-hidden="true">' + escapeHtml((State.session.name.trim()[0] || '?').toUpperCase()) + '</span>' +
        '<span class="user-name">Olá, <strong>' + escapeHtml(State.session.name.split(' ')[0]) + '</strong></span><span class="sr-only">: perfil e conta</span></button>' +
      '<button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Sair</button>';
    qs('#logoutBtn').addEventListener('click', logout);
    qs('#storageBtn').addEventListener('click', dataModal);
    qs('#profileBtn').addEventListener('click', function(){ showTab('perfil'); });
  } else {
    wrap.innerHTML =
      '<button class="btn btn-ghost btn-sm" data-action="go-login">Entrar</button>' +
      '<button class="btn btn-primary btn-sm" data-action="go-signup">Criar conta</button>';
  }
}

export async function loadAllData(){
  var key = k();
  var byName = {};
  if (Store.listAll) byName = await Store.listAll();
  else {
    var res = await Promise.all(COLLECTIONS.map(function(c){ return Store.list(key, c); }));
    COLLECTIONS.forEach(function(c, i){ byName[c] = res[i]; });
  }
  State.transactions = byName.transactions;
  sortTransactions();
  State.budgetBase = {}; State.budgetMonths = {};
  byName.budgets.forEach(function(b){
    if (b.month && b.limits) State.budgetMonths[b.month] = b.limits;
    else State.budgetBase[b.id] = Number(b.limit) || 0;
  });
  State.goals = byName.goals;
  State.debts = byName.debts;
  State.cards = byName.cards;
  State.receivables = byName.receivables;
  State.forecasts = byName.forecasts;
  State.categories = byName.categories;
  State.vouchers = byName.vouchers;
  State.accounts = byName.accounts;
  State.transfers = byName.transfers;
  State.bills = byName.bills || [];
  resetBillsView();
}

export function pctDelta(cur, prev){
  if (!prev) return null;
  return ((cur-prev)/Math.abs(prev))*100;
}
export function deltaBadge(cur, prev, downIsGood){
  var pct = pctDelta(cur, prev);
  if (pct === null){
    if (!cur && !prev) return '<span class="cmp-delta neutral">—</span>';
    return '<span class="cmp-delta neutral">novo</span>';
  }
  var up = pct >= 0;
  var isGood = downIsGood ? !up : up;
  var cls = Math.abs(pct) < 1 ? 'neutral' : (isGood ? 'good' : 'critical');
  return '<span class="cmp-delta ' + cls + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(Math.round(pct)) + '%</span>';
}

/* ---------- Tudo ---------- */
export function renderAll(){
  document.getElementById('greeting').textContent = 'Olá, ' + State.session.name.split(' ')[0];
  renderTopbar();
  populatePaymentSelect();
  renderDashboard();
  renderTransactionsTab();
  renderAccounts();
  renderCards();
  renderVouchers();
  renderBudgets();
  renderGoals();
  renderDebts();
  renderReceivables();
  fillBillForm(); renderBills();
  renderLearn();
  renderConnections();
  renderAdvice();
}

/* ============ Tabs / navigation ============ */
// Áreas do app e o endereço de cada uma (#/metas). O endereço permite usar o botão Voltar do navegador.
export var TABS = ['dashboard','lancamentos','cartoes','conselhos','limites','metas','compromissos','aprenda','conexoes','perfil','admin'];
export var ROUTES = {dashboard:'inicio', lancamentos:'lancamentos', cartoes:'contas', conselhos:'conselhos', limites:'planejar', metas:'metas', compromissos:'compromissos', aprenda:'aprenda', conexoes:'conexoes', perfil:'perfil', admin:'admin'};
// Partes (subabas) de uma área: Compromissos = Eu devo | Me devem; Ganhos e gastos = Lançamentos |
// Contas fixas (contas de todo mês são gastos do mês, não compromissos). slug é o pedaço do
// endereço (#/compromissos/me-devem); vazio = a parte padrão.
export var SUBTABS = {
  dividas: {parent: 'compromissos', slug: 'eu-devo'}, receber: {parent: 'compromissos', slug: 'me-devem'},
  lanc: {parent: 'lancamentos', slug: ''}, fixas: {parent: 'lancamentos', slug: 'contas-fixas'}, simular: {parent: 'lancamentos', slug: 'simular'}
};
function subsOf(parent){ return Object.keys(SUBTABS).filter(function(k){ return SUBTABS[k].parent === parent; }); }
function currentSub(parent){ return (State.subTab || {})[parent] || subsOf(parent)[0]; }

export function routeOf(name){
  var s = SUBTABS[name];
  return s ? ROUTES[s.parent] + (s.slug ? '/' + s.slug : '') : ROUTES[name];
}
export function tabFromHash(){
  var parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'contas-fixas') return 'fixas';   // endereço de quando Contas fixas era área própria
  var tab = Object.keys(ROUTES).filter(function(t){ return ROUTES[t] === parts[0]; })[0];
  if (!tab) return null;
  if (parts[1]) return subsOf(tab).filter(function(k){ return SUBTABS[k].slug === parts[1]; })[0] || tab;
  return tab;
}
export function showSubTab(parent, sub){
  State.subTab = State.subTab || {};
  State.subTab[parent] = sub;
  if (parent === 'compromissos') State.commitTab = sub;
  qsa('#tab-' + parent + ' [data-sub]').forEach(function(b){
    var on = b.getAttribute('data-sub') === sub;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  subsOf(parent).forEach(function(k){ document.getElementById('tab-' + k).hidden = k !== sub; });
  if (sub === 'simular') withPart('simulator', function(m){ m.renderSimulator(); });   // sempre com os dados de agora (contas, cartões, metas)
}
// name pode ser uma área (TABS) ou uma parte dela (SUBTABS: 'dividas', 'receber', 'lanc', 'fixas').
export function showTab(name){
  var sub = SUBTABS[name] ? name : null;
  if (sub) name = SUBTABS[sub].parent;
  if (TABS.indexOf(name) < 0 || (name === 'admin' && !State.isAdmin)) name = 'dashboard';
  if (subsOf(name).length) showSubTab(name, sub || currentSub(name));
  var changed = State.activeTab !== name;
  State.activeTab = name;
  qsa('.sidenav [data-tab], .bottomnav [data-tab]').forEach(function(a){
    var on = a.getAttribute('data-tab') === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // Áreas que só aparecem no "Mais" do celular deixam o "Mais" marcado.
  document.getElementById('moreBtn').classList.toggle('active', ['dashboard','lancamentos','cartoes'].indexOf(name) < 0);
  TABS.forEach(function(t){ document.getElementById('tab-' + t).hidden = (t !== name); });
  // Cada troca de área vira uma entrada no histórico (o Voltar do navegador volta à área anterior);
  // ao entrar no app, só corrige o endereço.
  var route = '#/' + routeOf(subsOf(name).length ? currentSub(name) : name);
  if (location.hash !== route){
    if (State.navReady) history.pushState(null, '', route); else history.replaceState(null, '', route);
  }
  if (changed && name !== 'admin') track('abriu:' + ROUTES[name], null, 30 * 60000);
  if (name === 'admin') withPart('admin', function(m){ m.renderAdmin(); });
  if (name === 'perfil') renderProfile();
  if (changed) window.scrollTo(0, 0);
}

// Mostra o conteúdo de um <details> numa janela (celular). Tocar num botão da lista fecha a janela.
function openDetailsPop(details){
  var clone = details.cloneNode(true), sum = clone.querySelector('summary');
  var title = sum.textContent.trim(); sum.remove();
  openModal({title: title, submitLabel: null, cancelLabel: 'Fechar', body: '<div class="pop-body">' + clone.innerHTML + '</div>',
    onOpen: function(modal, close){ modal.addEventListener('click', function(e){ if (e.target.closest('button, a[href]') && !e.target.closest('[data-modal-close]')) setTimeout(function(){ close(null); }, 0); }); }});
}
// "Mais" no celular: as áreas que não cabem na barra inferior.
export async function openMoreMenu(){
  var items = [['conselhos','bulb','Conselhos'], ['limites','pie','Planejar gastos'], ['metas','target','Metas'], ['compromissos','handshake','Compromissos'],
    ['aprenda','book','Aprenda'], ['conexoes','plug','Conexões'], ['perfil','user','Perfil e conta']].concat(State.isAdmin ? [['admin','shield','Administração']] : []);
  await openModal({
    title: 'Mais', submitLabel: null, cancelLabel: 'Fechar',
    body: '<nav class="more-menu" aria-label="Outras áreas">' + items.map(function(it){
        return '<a class="more-item' + (State.activeTab === it[0] ? ' active' : '') + '" href="#/' + ROUTES[it[0]] + '" data-more="' + it[0] + '">' + icon(it[1]) + '<span>' + it[2] + '</span></a>';
      }).join('') +
      '<button type="button" class="more-item" data-more="dados">' + icon('lock') + '<span>Seus dados e backup</span></button>' +
      '<button type="button" class="more-item" data-more="tutorial">' + icon('book') + '<span>Tutorial de primeiros passos</span></button>' +
      '<button type="button" class="more-item help-item" data-more="ajuda">' + icon('chat') + '<span>Ajuda e sugestões</span></button>' +
      '</nav>',
    onOpen: function(modal, close){
      modal.addEventListener('click', function(e){
        var el = e.target.closest('[data-more]');
        if (!el) return;
        e.preventDefault();
        close(null);
        var what = el.getAttribute('data-more');
        if (what === 'dados') dataModal(); else if (what === 'ajuda') openFeedback('ajuda'); else if (what === 'tutorial') setTimeout(startTutorial, 150); else showTab(what);
      });
    }
  });
}

export function showAuthTab(name){
  // Com captcha, o widget aparece no formulário (acima do botão) assim que a tela abre.
  if (Store.mode === 'supabase' && captchaEnabled()) setTimeout(mountCaptcha, 0);
  State.authTab = name;
  qsa('[data-authtab]').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-authtab') === name); });
  document.getElementById('loginForm').hidden = (name !== 'login');
  document.getElementById('signupForm').hidden = (name !== 'signup');
  document.getElementById('authFoot').textContent = name === 'login' ? 'Ainda não tem conta? Clique em “Criar conta” acima.' : 'Já é cadastrado? Clique em “Entrar” acima.';
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
  qsa('[data-local-only]').forEach(function(el){ el.hidden = Store.mode !== 'local'; });
  qsa('[data-online-only]').forEach(function(el){ el.hidden = Store.mode !== 'supabase'; });
}

// profileHint: perfil já lido no login (evita ler de novo).
// Entrar na conta: a tela de carregamento do Grana cobre a espera enquanto os dados chegam e some assim que o app está pronto.
export async function enterApp(profileHint){
  showSplash('Entrando na sua conta…');
  try { await enterAppFlow(profileHint); }
  finally { hideSplash(0); }
}
async function enterAppFlow(profileHint){
  setPrefsOwner(k());
  document.getElementById('txSort').value = TX_SORTS[getPrefs().txSort] ? getPrefs().txSort : 'recent';
  State.dashSec = DASH_SECTIONS.indexOf(getPrefs().dashSec) >= 0 ? getPrefs().dashSec : 'numeros';
  State.donutScope = getPrefs().donutScope === 'mine' ? 'mine' : 'all';
  State.donutStyle = ['rosca', 'pizza', 'blocos'].indexOf(getPrefs().donutStyle) >= 0 ? getPrefs().donutStyle : 'rosca';
  State.txView = ['list', 'cal', 'year'].indexOf(getPrefs().txView) >= 0 ? getPrefs().txView : 'list';
  qsa('[data-txview]').forEach(function(b){ var on = b.getAttribute('data-txview') === State.txView; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  showView('viewApp');
  await Store.migrate(k());
  // Dados, perfil, papel de admin e dicas ao mesmo tempo (no servidor, uma espera em vez de quatro).
  var got = await Promise.all([
    loadAllData(),
    profileHint !== undefined ? profileHint : Store.getUser(k()),
    Store.isAdmin ? Store.isAdmin() : false,
    Store.listContent ? Store.listContent().catch(function(){ return []; }) : []
  ]);
  var profile = got[1];
  State.research = (profile && profile.research) || null;
  State.profileCreatedAt = profile ? (profile.created_at || (profile.createdAt ? new Date(profile.createdAt).toISOString() : null)) : null;
  State.isAdmin = got[2];
  State.content = got[3];
  document.getElementById('navAdmin').hidden = !State.isAdmin;
  Store.persist().then(function(v){ State.persisted = v; });
  document.getElementById('txDate').value = todayKey();
  document.getElementById('fcDate').value = todayKey();
  populateCategorySelect();
  populateInstallSelect();
  renderAll();
  syncTxFormVisibility();
  State.activeTab = null;
  State.navReady = false;
  showTab(tabFromHash() || 'dashboard');
  State.navReady = true;
  hideSplash(700);   // app pronto: a tela de carregamento sai (se não houve pressa, depois de ~0,7 s para a animação ser vista)
  // Contas fixas cujo dia chegou entram sozinhas em Ganhos e gastos.
  if (await runAutoBills()) renderAll();
  // Planejamento: categorias que já estavam perto do limite ou passaram avisam uma vez, num popup.
  setTimeout(function(){ showBudgetPopup(null); }, 1200);
  // Abriu por um link de cobrança: mostra para aceitar antes das boas-vindas.
  if (await acceptPendingCharge()) return;
  // Cobranças compartilhadas: novidades da outra pessoa (pagamentos, confirmações).
  await syncShared();
  if (!(await offerLocalImport())){
    var tut = maybeTutorial();
    // No primeiro acesso, só o tutorial: o chat de boas-vindas fica para as próximas entradas.
    if (!tut) maybeWelcome();
  }
  // O salário previsto já deveria ter caído? Pergunta para confirmar os valores do mês.
  if (hasSalaryData()) withPart('salary', function(m){ m.askSalaryIfDue(); });
  preloadPdfLibWhenIdle();
  maybeSyncPush();
  maybeWhatsNew();
}

export function logout(){
  // Com avisos ligados, o aparelho deixa de receber os desta conta antes de sair (até 3 s; sem internet sai do mesmo jeito).
  if (pushActive()){
    Promise.race([disablePush(true, true), new Promise(function(r){ setTimeout(r, 3000); })]).then(finishLogout, finishLogout);
    return;
  }
  finishLogout();
}
function finishLogout(){
  if (Store.mode === 'supabase' && State.session) Store.signOut();
  clearSession();
  State.session = null;
  State.isAdmin = false;
  document.getElementById('navAdmin').hidden = true;
  setPrefsOwner(null);
  showView('viewLanding');
  renderTopbar();
}

export function backupCounts(){
  var n = function(list, one, many){ return list.length + ' ' + (list.length === 1 ? one : many); };
  return [n(State.transactions, 'lançamento', 'lançamentos'), n(State.accounts, 'conta', 'contas'), n(State.cards, 'cartão', 'cartões'),
    n(State.goals, 'meta', 'metas'), n(State.debts, 'dívida', 'dívidas')].join(', ');
}
export function backupFile(){
  var data = {
    transactions: State.transactions, goals: State.goals, debts: State.debts, cards: State.cards, receivables: State.receivables,
    forecasts: State.forecasts, categories: State.categories, vouchers: State.vouchers, accounts: State.accounts, transfers: State.transfers, bills: State.bills,
    budgets: Object.keys(State.budgetBase).map(function(id){ return {id:id, limit: State.budgetBase[id]}; })
      .concat(Object.keys(State.budgetMonths).map(function(m){ return {id:'plan-' + m, month:m, limits: State.budgetMonths[m]}; }))
  };
  return buildBackup(data, getPrefs(), {name: State.session.name, email: State.session.email});
}
export async function exportBackup(){
  await saveFile('grana-leve-backup-' + todayKey() + '.json', JSON.stringify(backupFile(), null, 2), 'application/json');
  setPref('lastBackup', Date.now());
  setPref('backupSnoozeUntil', null);
  renderBackupBanner();
  toast('Backup salvo. Guarde o arquivo fora deste aparelho (no Google Drive, por exemplo).');
}
export function daysAgoText(ts){
  var d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : 'há ' + d + ' dias';
}

// Lembrete no painel: só no armazenamento do navegador, com dados de verdade e sem backup há 30 dias.
export var BACKUP_EVERY_DAYS = 30;
export function backupDue(){
  if (Store.mode !== 'local' || !State.session) return false;
  var p = getPrefs(), now = Date.now();
  if (p.backupSnoozeUntil && p.backupSnoozeUntil > now) return false;
  var count = State.transactions.length + State.accounts.length + State.cards.length + State.goals.length + State.debts.length + State.receivables.length;
  if (count < 5) return false;
  return !p.lastBackup || now - p.lastBackup > BACKUP_EVERY_DAYS * 86400000;
}
export function renderBackupBanner(){
  var el = document.getElementById('backupBanner');
  var due = backupDue();
  el.hidden = !due;
  if (!due){ el.innerHTML = ''; return; }
  var last = getPrefs().lastBackup;
  el.innerHTML = icon('lock') +
    '<div class="backup-banner-text"><strong>' + (last ? 'Seu último backup foi ' + daysAgoText(last) + '.' : 'Você ainda não tem um backup.') + '</strong> ' +
      'Seus dados existem só neste navegador: se ele for limpo, eles se perdem.</div>' +
    '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-backup-now>Salvar backup agora</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-backup-snooze>Lembrar em 7 dias</button></div>';
}
// Sem internet (só no modo com servidor): aviso fixo; quando volta, recarrega os dados do servidor.
export function syncOnlineState(){
  var offline = Store.mode === 'supabase' && navigator.onLine === false;
  document.getElementById('offlineBar').hidden = !offline;
  document.body.classList.toggle('is-offline', offline);
}
// Previsões de entrada: ficam recolhidas no card de novo lançamento.
export function setForecastOpen(open){
  var btn = document.getElementById('forecastToggle');
  btn.setAttribute('aria-expanded', String(open));
  btn.classList.toggle('active', open);
  document.getElementById('forecastPanel').hidden = !open;
}

// Links do menu: o endereço muda e o hashchange troca a área (também funciona com Voltar/Avançar).
export function syncFromAddress(){
  if (!State.session) return;
  var t = tabFromHash();
  if (t) showTab(t);
}

/* ============ Boot ============ */
export async function boot(){
  capturePendingCharge();
  Store.onWriteError = function(){ toast('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.'); };
  await Store.init();
  // Captcha nas ações de login, quando houver site key (o Supabase precisa estar com o captcha ligado).
  if (captchaEnabled() && Store.setCaptcha) Store.setCaptcha(getCaptchaToken);
  syncOnlineState();
  // Textos que dependem de onde os dados ficam (servidor ou só este navegador).
  qsa('[data-local-only]').forEach(function(el){ el.hidden = Store.mode !== 'local'; });
  qsa('[data-online-only]').forEach(function(el){ el.hidden = Store.mode !== 'supabase'; });
  if (Store.cloudError){
    var retry = await openModal({
      title: 'Não foi possível acessar seus dados',
      body: '<p>O Grana Leve não conseguiu conectar ao armazenamento na nuvem (' + escapeHtml(Store.cloudError) + '). Nada foi apagado.</p>' +
        '<p>Se continuar, esta sessão usa <strong>só este navegador</strong>: o que você lançar agora não aparece nos seus dados da nuvem.</p>',
      submitLabel: 'Tentar de novo', cancelLabel: 'Continuar só neste navegador'
    });
    if (retry){ location.reload(); return; }
  }
  if (Store.mode === 'supabase'){
    Store.onAuthChange(function(event){
      if (event === 'PASSWORD_RECOVERY' && !State.handlingLink) setTimeout(newPasswordModal, 0);
      if (event === 'SIGNED_OUT' && State.session){ State.session = null; logout(); }
    });
    State.handlingLink = true;
    var returnedWithCode = /[?&]code=/.test(location.search);   // volta do Google (ou do link do e-mail)
    var link = await handleEmailLink();
    State.handlingLink = false;
    try {
      var current = await Store.getSession();
      cleanAuthParams();
      if (current && link && link.ok && link.type === 'recovery'){
        // Link de nova senha: a senha é trocada antes de abrir a conta, sem nada por cima.
        renderTopbar(); showView('viewLanding');
        if (await newPasswordModal()){ State.freshLogin = true; await startOnlineSession(current.user); }
        return;
      }
      var viaGoogle = cameFromGoogle();
      if (current){
        if ((link && link.ok) || viaGoogle) State.freshLogin = true;   // entrou pelo link do e-mail ou pelo Google
        await startOnlineSession(current.user);
        if (viaGoogle){ toast('Bem-vindo(a), ' + State.session.name.split(' ')[0] + '!'); return; }
        if (link && link.ok && link.type === 'email_change') toast('Confirmação recebida. Se a troca pedir, confirme também pelo link enviado ao outro e-mail.');
        else if (link && link.ok) toast('E-mail confirmado! Bem-vindo(a) ao Grana Leve.');
        return;
      }
    } catch(e){ console.warn('[Grana Leve] erro ao abrir a sessão:', e); toast('Sem conexão com o servidor. Verifique a internet.'); }
    renderTopbar();
    showView('viewLanding');
    if (returnedWithCode && !(link && (link.ok || link.error))){
      // Voltou do Google com o código, mas a sessão não abriu: avisa em vez de só mostrar a página inicial.
      cleanAuthParams();
      openAuth('login');
      document.getElementById('googleError').textContent = 'Não foi possível concluir o login. Tente de novo; se continuar, entre com e-mail e senha ou avise a equipe.';
      return;
    }
    if (link && link.oauthError){ openAuth('login'); document.getElementById('googleError').textContent = 'Não foi possível entrar com o Google (' + link.oauthError + '). Tente de novo ou use e-mail e senha.'; return; }
    if (link && link.error){ await linkProblemModal(link); return; }
    if (link && link.ok) await linkDoneModal(link);
    return;
  }
  var session = loadSession();
  if (session){
    try{
      var user = await Store.getUser(session.emailKey);
      if (user){
        State.session = session;
        await enterApp();
        return;
      }
    } catch(e){ /* fall through to landing */ }
  }
  renderTopbar();
  showView('viewLanding');
}

// Eventos gerais: cliques e formulários compartilhados entre as abas, navegação e conexão.
// No celular, o menu ⋯ (cartões, contas, compromissos...) abre como folha de baixo, igual ao menu “Mais”: não depende de
// posicionamento fixo, tem alvos de toque grandes e fecha arrastando. No computador continua o menu em cima do botão.
function wireMobileMenus(){
  document.addEventListener('click', function(e){
    var sum = e.target.closest && e.target.closest('details.card-menu > summary');
    if (!sum || !window.matchMedia || !window.matchMedia('(max-width: 620px)').matches) return;
    e.preventDefault(); e.stopPropagation();
    var btns = qsa('.more-pop button', sum.parentElement);
    if (!btns.length) return;
    openModal({title: 'Mais ações', submitLabel: null, cancelLabel: 'Fechar',
      body: '<div class="sheet-actions">' + btns.map(function(b, i){
        return '<button type="button" class="sheet-act' + (b.classList.contains('danger') ? ' danger' : '') + '" data-i="' + i + '">' + b.innerHTML + '</button>'; }).join('') + '</div>',
      onOpen: function(modal, close){
        modal.addEventListener('click', function(ev){
          var it = ev.target.closest('[data-i]');
          if (!it) return;
          var target = btns[Number(it.getAttribute('data-i'))];
          close(null);
          setTimeout(function(){ target.click(); }, 0);
        });
      }});
  }, true);
}
// Cliques de Ganhos e gastos, do Início (detalhes, gráficos, backup) e das previsões de entrada. Devolve true quando tratou o clique.
async function clickHome(t, e){
    var el;
    if ((el = t.closest('[data-edit-tx]'))){
      var et = findById(State.transactions, el.getAttribute('data-edit-tx'));
      if (et && isReversal(et)){ toast('Estornos não são editados: para corrigir, exclua este estorno e registre de novo pela compra.'); return true; }
      if (et) openTxModal(et);
      return true;
    }
    if ((el = t.closest('[data-sum-more]'))){
      var n = el.getAttribute('data-sum-more');
      State.sumOpen[n] = !State.sumOpen[n];
      renderSummary();
      qs('[data-sum-more="' + n + '"]').focus();
      return true;
    }
    if (t.closest('[data-parcels-open]')){ openParcels(); return true; }
    if ((el = t.closest('[data-go]'))){ e.preventDefault(); showTab(el.getAttribute('data-go')); return true; }
    if (t.closest('#dashDetailsBtn')){
      State.dashDetails = !State.dashDetails;
      var btn = document.getElementById('dashDetailsBtn');
      btn.setAttribute('aria-expanded', String(State.dashDetails));
      btn.querySelector('span').textContent = State.dashDetails ? 'Esconder detalhes do mês' : 'Ver todos os detalhes do mês';
      document.getElementById('dashDetails').hidden = !State.dashDetails;
      if (State.dashDetails) renderBarChart();
      return true;
    }
    if (t.closest('[data-backup-now]')){ exportBackup(); return true; }
    if (t.closest('[data-backup-snooze]')){
      setPref('backupSnoozeUntil', Date.now() + 7 * 86400000);
      renderBackupBanner();
      toast('Combinado, lembramos de novo em 7 dias.');
      return true;
    }
    if ((el = t.closest('[data-del-tx]'))){
      var id = el.getAttribute('data-del-tx');
      var tx = findById(State.transactions, id);
      if (!tx) return true;
      var ok, ids = [id];
      if (tx.installment) ids = State.transactions.filter(function(x){ return x.installment && x.installment.group === tx.installment.group; }).map(function(x){ return x.id; });
      var parcelCount = ids.length;
      // O que vai junto (A2-03, A4): adiantamentos da compra, estornos ligados, "A receber" que só existe
      // por causa desta compra e as devoluções já registradas nele. Conta fixa lançada por este gasto fica pulada no mês (A2-06).
      var linked = linkedToDelete(State.transactions, State.receivables, ids);
      var billNote = billNamesOf(State.transactions.filter(function(x){ return ids.indexOf(x.id) >= 0 || linked.extraTxIds.indexOf(x.id) >= 0; })).map(function(n){ return ' A conta fixa “' + n + '” fica como não lançada neste mês.'; }).join('');
      var extra = linkedMessage(linked);
      if (tx.installment){
        ok = await confirmAction({title: extra ? 'Excluir a compra e o que está ligado a ela?' : 'Excluir compra parcelada?', confirmLabel: extra ? 'Excluir tudo' : undefined,
          message:'“' + tx.installment.baseDescription + '” foi parcelada em ' + tx.installment.total + 'x. Excluir apaga ' + (parcelCount === 1 ? 'a parcela' : 'as ' + parcelCount + ' parcelas') + ' desta compra.' + extra + billNote});
      } else if (extra){
        ok = await confirmAction({title:'Excluir a compra e o que está ligado a ela?', confirmLabel: 'Excluir tudo',
          message:'Excluir “' + (tx.description || catLabel(tx.category, tx.type, tx.categoryLabel)) + '” de ' + fmtMoney(tx.amount) + '.' + extra + billNote});
      } else {
        // Com conta fixa envolvida a pergunta sempre aparece (sem "Não perguntar novamente").
        ok = await confirmAction({title:'Excluir lançamento?', message:'Tem certeza que deseja excluir “' + (tx.description || catLabel(tx.category, tx.type, tx.categoryLabel)) + '” de ' + fmtMoney(tx.amount) + '?' + billNote, skipKey: billNote ? undefined : 'deleteTx'});
      }
      if (!ok) return true;
      var allIds = ids.concat(linked.extraTxIds);
      var removedTx = State.transactions.filter(function(x){ return allIds.indexOf(x.id) >= 0; });
      try {
        // A3: pula a conta fixa antes de apagar; se algo falhar no meio, o pior caso é o mês pulado com o gasto ainda lá.
        await skipBillsOf(removedTx);
        await Store.removeMany(k(), 'transactions', allIds);
        State.transactions = State.transactions.filter(function(x){ return allIds.indexOf(x.id) < 0; });
        for (var ri = 0; ri < linked.receivables.length; ri++){
          var lr = linked.receivables[ri];
          await Store.remove(k(), 'receivables', lr.id);
          State.receivables = State.receivables.filter(function(x){ return x.id !== lr.id; });
          if (lr.sharedId) leaveShared(lr.sharedId);
        }
      } catch(err){
        try { await loadAllData(); } catch(e2){ /* fica com o que está na tela */ }
        renderAll();
        toast('Não deu para excluir tudo. Confira e tente de novo.');
        return true;
      }
      renderAll();
      toast(extra ? 'Compra e itens ligados excluídos.' : 'Lançamento excluído.');
      return true;
    }
    if (t.closest('[data-explain="devolver"]')){ explainReturn(); return true; }
    if (t.closest('#txFilterBtn')){
      var fp = document.getElementById('txFilterPanel'), fb = document.getElementById('txFilterBtn');
      fp.hidden = !fp.hidden; fb.setAttribute('aria-expanded', String(!fp.hidden));
      if (!fp.hidden) document.getElementById('txFilterType').focus();
      return true;
    }
    if (t.closest('[data-first-tx]')){ document.getElementById('fabAdd').click(); return true; }
    if (t.closest('[data-first-hide]')){ setPref('firstStepsOff', true); renderSummary(); return true; }
    if ((el = t.closest('[data-dash-sec]'))){ setDashSection(el.getAttribute('data-dash-sec')); return true; }
    if ((el = t.closest('[data-donut-style]'))){ setDonutStyle(el.getAttribute('data-donut-style')); return true; }
    if ((el = t.closest('[data-donut-scope]'))){ setDonutScope(el.getAttribute('data-donut-scope')); return true; }
    if ((el = t.closest('[data-view-toggle]'))){
      var which = el.getAttribute('data-view-toggle');
      if (which === 'donut'){ State.donutView = State.donutView === 'chart' ? 'table' : 'chart'; renderDonut(); }
      else if (which === 'invsplit' || which === 'creditdebit'){ toggleDashView(which); }
      else { State.barView = State.barView === 'chart' ? 'table' : 'chart'; renderBarChart(); }
      return true;
    }
    if ((el = t.closest('[data-fc-receive]'))){ receiveForecast(el.getAttribute('data-fc-receive'), el.getAttribute('data-fc-date')); return true; }
    if ((el = t.closest('[data-fc-del]'))){
      var f = findById(State.forecasts, el.getAttribute('data-fc-del'));
      if (!(await confirmAction({title:'Excluir previsão?', message:'Excluir a previsão “' + f.description + '”' + (f.recurring ? ' de todos os meses' : '') + '? Os ganhos já registrados continuam.'}))) return true;
      await Store.remove(k(), 'forecasts', f.id);
      State.forecasts = State.forecasts.filter(function(x){ return x.id !== f.id; });
      renderDashboard();
      return true;
    }
    return false;
}

// Cliques de Contas e cartões: faturas, contas, transferências, cartões e vales. Devolve true quando tratou o clique.
async function clickWallet(t, e){
    var el;
    if ((el = t.closest('[data-inv-shift]'))){
      var cid = el.getAttribute('data-inv-shift');
      State.invoiceOffsets[cid] = (State.invoiceOffsets[cid] || 0) + Number(el.getAttribute('data-dir'));
      renderCards();
      return true;
    }
    if ((el = t.closest('[data-inv-pdf]'))){ generateInvoicePdf(el.getAttribute('data-inv-pdf'), el.getAttribute('data-key')); return true; }
    if ((el = t.closest('[data-allinv-pdf]'))){ generateAllInvoicesPdf(Number(el.getAttribute('data-allinv-pdf'))); return true; }
    if ((el = t.closest('[data-inv-paid]'))){ toggleInvoicePaid(el.getAttribute('data-inv-paid'), el.getAttribute('data-key')); return true; }
    if ((el = t.closest('[data-invadv-undo]'))){ undoInvoiceAdvance(el.getAttribute('data-invadv-undo')); return true; }
    // Contas bancárias
    if ((el = t.closest('[data-acc-transfer]'))){ openTransfer(el.getAttribute('data-acc-transfer')); return true; }
    if ((el = t.closest('[data-adjust-undo]'))){ undoBalanceAdjust(el.getAttribute('data-adjust-undo')); return true; }
    if ((el = t.closest('[data-acc-edit]'))){ editAccount(el.getAttribute('data-acc-edit')); return true; }
    if ((el = t.closest('[data-acc-del]'))){
      var ac = findById(State.accounts, el.getAttribute('data-acc-del'));
      if (!(await confirmAction({title:'Excluir conta?', message:'Excluir a conta “' + ac.name + '”? Os ganhos e gastos ligados a ela continuam nos seus lançamentos, sem conta.'}))) return true;
      await Store.remove(k(), 'accounts', ac.id);
      State.accounts = State.accounts.filter(function(x){ return x.id !== ac.id; });
      renderAll();
      return true;
    }
    if ((el = t.closest('[data-transfer-del]'))){
      var tr = findById(State.transfers, el.getAttribute('data-transfer-del'));
      if (!tr || !(await confirmAction({title:'Excluir transferência?', message:'Excluir a transferência de ' + fmtMoney(tr.amount) + ' de ' + accountName(tr.fromId) + ' para ' + accountName(tr.toId) + '? O saldo das duas contas volta ao que era.'}))) return true;
      await Store.remove(k(), 'transfers', tr.id);
      State.transfers = State.transfers.filter(function(x){ return x.id !== tr.id; });
      renderAccounts(); renderStatTiles();
      toast('Transferência excluída.');
      return true;
    }
    if ((el = t.closest('[data-card-edit]'))){ editCard(el.getAttribute('data-card-edit')); return true; }
    if ((el = t.closest('[data-card-report]'))){ cardReport(el.getAttribute('data-card-report')); return true; }
    if ((el = t.closest('[data-adv-group]'))){ advanceInstallments(el.getAttribute('data-adv-group')); return true; }
    if ((el = t.closest('[data-voucher-edit]'))){ editVoucher(el.getAttribute('data-voucher-edit')); return true; }
    if ((el = t.closest('[data-voucher-del]'))){
      var vd = findById(State.vouchers, el.getAttribute('data-voucher-del'));
      if (!(await confirmAction({title:'Excluir vale?', message:'Excluir o vale “' + vd.name + '”? Os gastos feitos com ele continuam nos seus lançamentos.'}))) return true;
      await Store.remove(k(), 'vouchers', vd.id);
      State.vouchers = State.vouchers.filter(function(x){ return x.id !== vd.id; });
      renderAll();
      return true;
    }
    if ((el = t.closest('[data-card-del]'))){
      var c = findById(State.cards, el.getAttribute('data-card-del'));
      if (!(await confirmAction({title:'Excluir cartão?', message:'Excluir o cartão “' + c.name + '”? As compras feitas nele continuam nos seus gastos.'}))) return true;
      await Store.remove(k(), 'cards', c.id);
      State.cards = State.cards.filter(function(x){ return x.id !== c.id; });
      renderAll();
      return true;
    }
    return false;
}

// Cliques de Conexões. Devolve true quando tratou o clique.
async function clickConnections(t, e){
    var el;
    if ((el = t.closest('[data-conn]'))){
      var conn = el.getAttribute('data-conn');
      if (conn === 'chat') openQuickEntry(false);
      if (conn === 'metas') showTab('metas');
      if (conn === 'wa-remove'){ setPref('waOptin', null); renderConnections(); }
      if (conn === 'install' && State.installPrompt){
        State.installPrompt.prompt();
        State.installPrompt.userChoice.then(function(){ State.installPrompt = null; if (State.session) renderConnections(); });
      }
      return true;
    }
    return false;
}

// Cliques de Metas. Devolve true quando tratou o clique.
async function clickGoals(t, e){
    var el;
    if ((el = t.closest('[data-goal-filter]'))){ State.goalFilter = el.getAttribute('data-goal-filter'); renderGoals(); return true; }
    if ((el = t.closest('[data-goal-edit]'))){ editGoal(el.getAttribute('data-goal-edit')); return true; }
    if ((el = t.closest('[data-goal-del]'))){
      var g = findById(State.goals, el.getAttribute('data-goal-del'));
      if (!(await confirmAction({title:'Excluir meta?', message:'Tem certeza que deseja excluir a meta “' + g.name + '”? Ela vai para “Excluídas” e pode ser restaurada.'}))) return true;
      g.deletedAt = Date.now();
      await Store.update(k(), 'goals', g.id, {deletedAt: g.deletedAt});
      renderGoals(); renderDashboard();
      return true;
    }
    if ((el = t.closest('[data-goal-restore]'))){
      var gr = findById(State.goals, el.getAttribute('data-goal-restore'));
      gr.deletedAt = null;
      await Store.update(k(), 'goals', gr.id, {deletedAt: null});
      renderGoals(); renderDashboard();
      toast('Meta restaurada.');
      return true;
    }
    if ((el = t.closest('[data-goal-purge]'))){
      var gp = findById(State.goals, el.getAttribute('data-goal-purge'));
      if (!(await confirmAction({title:'Apagar de vez?', message:'A meta “' + gp.name + '” será apagada permanentemente.'}))) return true;
      await Store.remove(k(), 'goals', gp.id);
      State.goals = State.goals.filter(function(x){ return x.id !== gp.id; });
      renderGoals();
      return true;
    }
    return false;
}

// Cliques de Compromissos (dívidas e a receber) e atalhos gerais (ajuda, tutorial, copiar Pix). Devolve true quando tratou o clique.
async function clickCommitments(t, e){
    var el;
    if ((el = t.closest('[data-debt-pay]'))){ payDebt(el.getAttribute('data-debt-pay')); return true; }
    if ((el = t.closest('[data-debt-edit]'))){ editDebt(el.getAttribute('data-debt-edit')); return true; }
    if ((el = t.closest('[data-recv-edit]'))){ editReceivable(el.getAttribute('data-recv-edit')); return true; }
    if ((el = t.closest('[data-debt-del]'))){
      var d = findById(State.debts, el.getAttribute('data-debt-del'));
      if (!(await confirmAction({title:'Excluir dívida?', message:'Tem certeza que deseja excluir a dívida “' + d.name + '”?'}))) return true;
      await Store.remove(k(), 'debts', d.id);
      State.debts = State.debts.filter(function(x){ return x.id !== d.id; });
      if (d.shared && d.shared.sid) leaveShared(d.shared.sid);   // sai da cobrança compartilhada
      renderDebts(); renderDashboard();
      return true;
    }
    // A receber
    if ((el = t.closest('[data-recv-get]'))){ receiveReceivable(el.getAttribute('data-recv-get')); return true; }
    if ((el = t.closest('[data-recv-charge]'))){ chargeReceivable(el.getAttribute('data-recv-charge')); return true; }
    if ((el = t.closest('[data-recv-share]'))){ shareRecv(el.getAttribute('data-recv-share')); return true; }
    if (t.closest('[data-help]')){ openFeedback('ajuda'); return true; }
    if (t.closest('[data-tutorial]')){
      var mx = document.querySelector('#modalRoot:not([hidden]) .modal-x'); if (mx) mx.click();
      setTimeout(startTutorial, 150); return true;
    }
    if ((el = t.closest('[data-shared-pending]'))){ openPendingFor(el.getAttribute('data-shared-pending')); return true; }
    if ((el = t.closest('[data-copy-pix]'))){
      var pixKey = el.getAttribute('data-copy-pix');
      if (navigator.clipboard) navigator.clipboard.writeText(pixKey).then(function(){ toast('Chave Pix copiada.'); }, function(){ toast('Não foi possível copiar.'); });
      return true;
    }
    if ((el = t.closest('[data-pay-undo]'))){ undoPayment(el.getAttribute('data-pay-undo')); return true; }
    if ((el = t.closest('[data-recv-get-all]'))){ receiveAll(el.getAttribute('data-recv-get-all')); return true; }
    if ((el = t.closest('[data-recv-charge-all]'))){ chargePerson(el.getAttribute('data-recv-charge-all')); return true; }
    if ((el = t.closest('[data-jump]'))){ document.getElementById(el.getAttribute('data-jump')).scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); return true; }
    if ((el = t.closest('[data-recv-link]'))){ linkReceivable(el.getAttribute('data-recv-link')); return true; }
    if ((el = t.closest('[data-recv-sync]'))){ syncReceivable(el.getAttribute('data-recv-sync')); return true; }
    if ((el = t.closest('[data-recv-forgive]'))){ forgiveReceivable(el.getAttribute('data-recv-forgive')); return true; }
    if ((el = t.closest('[data-goto]'))){ showTab(el.getAttribute('data-goto')); return true; }
    if ((el = t.closest('[data-recv-del]'))){
      var r = findById(State.receivables, el.getAttribute('data-recv-del'));
      if (!(await confirmAction({title:'Excluir?', message:'Tem certeza que deseja excluir o valor a receber de ' + r.person + '?' +
        (r.sharedWith ? ' A cobrança compartilhada também deixa de existir para ' + r.person.split(' ')[0] + '.' : '')}))) return true;
      await Store.remove(k(), 'receivables', r.id);
      if (r.sharedId) leaveShared(r.sharedId);
      State.receivables = State.receivables.filter(function(x){ return x.id !== r.id; });
      renderReceivables(); renderDashboard();
      return true;
    }
    return false;
}

/* ---------- Partes carregadas só quando alguém as abre ---------- */
// Administração, Simular e Importar extrato pesam e quase ninguém os abre ao entrar: o build os separa em arquivos próprios
// (import() dinâmico) e cada um só é baixado na primeira vez. Quem usa o app sem internet já os tem guardados (service worker).
var PARTS = {
  admin: function(){
    return import('./admin.js').then(function(m){
      m.initAdmin({state: function(){ return State; }, defaults: {tip: TIPS, tip_grow: TIPS_GROW}, onContentChange: renderLearn, siteUrl: siteUrl});
      return m;
    });
  },
  simulator: function(){ return import('./simulator.js').then(function(m){ m.wireSimulator(); return m; }); },
  statement: function(){ return import('./import-statement.js'); },
  mascotChat: function(){ return import('./mascot-chat.js'); },
  salary: function(){ return import('./salary-plan.js').then(function(m){ return import('./salary-calc.js').then(function(c){ return Object.assign({}, m, c); }); }); }
};
var partLoads = {};
export function withPart(name, run){
  var load = partLoads[name] = partLoads[name] || PARTS[name]();
  load.then(run, function(){
    delete partLoads[name];
    toast('Não foi possível carregar esta parte agora. Verifique a internet e tente de novo.');
  });
}
// Entradas que ficam sempre ligadas e só carregam a parte pesada quando usadas.
function wireLazyEntries(){
  document.addEventListener('click', function(e){
    if (e.target.closest('#importStmtBtn')) withPart('statement', function(m){ m.openStatementImport(); });
    var calc = e.target.closest('[data-salary-calc]');
    if (calc) withPart('salary', function(m){ m.runSalaryCalcButton(calc); });
    if (e.target.closest('[data-salary-open]')) withPart('salary', function(m){ m.openSalaryPlan(); });
    else if (e.target.closest('[data-salary-confirm]')) withPart('salary', function(m){ m.confirmSalary(); });
    // Qualquer botão com data-sim-open leva para a guia Simular.
    if (e.target.closest('[data-sim-open]')) showTab('simular');
  });
}

// Módulos de cada área que ligam os próprios eventos.
function wireFeatureModules(){

  wireAdvice();
  wireLazyEntries();
  wirePushResync();
  wireMobileMenus();
}

// Rodapé, Escape (fecha menus e a janela de entrar), contadores de caracteres e redimensionamento.
function wireKeysAndResize(){
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      var menu = qsa('details.card-menu[open]')[0];
      if (menu){ menu.open = false; menu.querySelector('summary').focus(); return; }
    }
    if (e.key === 'Escape' && !document.getElementById('viewAuth').hidden && document.getElementById('modalRoot').hidden) closeAuth();
  });
  attachCounters(document);

  var resizeTimer;
  window.addEventListener('resize', function(){ clearTimeout(resizeTimer); resizeTimer = setTimeout(function(){ if (State.dashDetails && State.activeTab === 'dashboard') renderBarChart(); }, 200); });
}

// Cliques do documento: o que é de cada área está em clickHome, clickWallet, clickConnections, clickGoals e clickCommitments.
function wireClicks(){
  document.addEventListener('click', async function(e){
    var t = e.target;
    // No celular, as listas recolhíveis dos cartões abrem numa janela, mais fácil de ler que dentro do cartão.
    var popSum = t.closest('details[data-pop] > summary');
    if (popSum && window.matchMedia('(max-width: 640px)').matches){ e.preventDefault(); openDetailsPop(popSum.parentElement); return; }
    var el;
    // Menus “Mais” dos cartões: escolher uma ação ou clicar fora fecha.
    qsa('details.card-menu[open]').forEach(function(m){ if (!m.contains(t) || t.closest('.more-pop button')) m.open = false; });
    // Janela de entrar / criar conta: o X e o fundo (fora do cartão) fecham.
    if (t.closest('[data-auth-close]') || t.id === 'viewAuth' || (t.classList && t.classList.contains('auth-wrap'))){ closeAuth(); return; }
    if ((el = t.closest('[data-action]'))){
      var action = el.getAttribute('data-action');
      if (action === 'go-login') openAuth('login');
      if (action === 'go-signup') openAuth('signup');
      if (action === 'go-tab-lancamentos'){ showTab('lancamentos'); }
      return;
    }
    if ((el = t.closest('[data-info]'))){ showInfo(el.getAttribute('data-info')); return; }
    if (!State.session) return;
    if (t.closest('#modalRoot')) return;
    if (await clickHome(t, e)) return;
    if (await clickWallet(t, e)) return;
    if (await clickConnections(t, e)) return;
    if (await clickGoals(t, e)) return;
    if (await clickCommitments(t, e)) return;
  });
}

// Formulários que ficam dentro de cartões (aviso do WhatsApp, guardar valor em uma meta).
function wireForms(){
  // Guardar valor em uma meta (formulário dentro do card).
  document.addEventListener('submit', function(e){
    if (e.target.id !== 'waOptinForm') return;
    e.preventDefault();
    var phone = e.target.phone.value.trim();
    if (!whatsappNumber(phone)){ toast('Informe o número com DDD, por exemplo (11) 98888-7777.'); return; }
    setPref('waOptin', {phone: phone, at: Date.now()});
    renderConnections();
    toast('Combinado! Vamos avisar quando o WhatsApp estiver disponível.');
  });

  document.addEventListener('submit', async function(e){
    var form = e.target.closest('[data-goal-deposit]');
    if (!form) return;
    e.preventDefault();
    var g = findById(State.goals, form.getAttribute('data-goal-deposit'));
    var amount = money(form.amount.value);
    if (!(amount > 0)){ toast('Informe um valor para guardar.'); return; }
    await goalMove(g.id, 'deposit', amount);
    renderStatTiles();
    toast(g.targetAmount > 0 && g.currentAmount >= g.targetAmount ? 'Meta “' + g.name + '” concluída! Parabéns!' : 'Você guardou mais ' + fmtMoney(amount) + ' na meta “' + g.name + '”.');
  });
}

// Estado da conexão: falha de rede vira aviso; ao voltar a internet, recarrega os dados do servidor.
function wireConnectionState(){
  // Qualquer falha de rede que escapar vira um aviso, em vez de travar a tela em silêncio.
  window.addEventListener('unhandledrejection', function(e){
    if (Store.mode !== 'supabase') return;
    e.preventDefault();
    toast((e.reason && e.reason.userMessage) || 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.');
  });
  window.addEventListener('offline', syncOnlineState);
  window.addEventListener('online', async function(){
    syncOnlineState();
    if (Store.mode !== 'supabase' || !State.session) return;
    try { await loadAllData(); renderAll(); toast('Conexão de volta. Seus dados foram atualizados.'); } catch(e){ /* tenta de novo no próximo evento */ }
  });
}

// Navegação: logo, endereço (#/rota), menus laterais e de baixo, “Mais” e as abas com setas.
function wireNavigation(){
  document.getElementById('brandHome').addEventListener('click', function(){
    if (State.session) { showView('viewApp'); showTab('dashboard'); } else { showView('viewLanding'); }
  });
  window.addEventListener('hashchange', syncFromAddress);
  window.addEventListener('popstate', syncFromAddress);
  document.addEventListener('click', function(e){
    var a = e.target.closest('.sidenav [data-tab], .bottomnav [data-tab]');
    if (!a || !State.session) return;
    e.preventDefault();
    showTab(a.getAttribute('data-tab'));
  });
  document.getElementById('moreBtn').addEventListener('click', openMoreMenu);
  // Detalhes do mês: abas com setas.
  qsa('[data-dash-sec]').forEach(function(b){
    b.addEventListener('keydown', function(e){
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = DASH_SECTIONS.indexOf(b.getAttribute('data-dash-sec'));
      setDashSection(DASH_SECTIONS[(i + (e.key === 'ArrowRight' ? 1 : DASH_SECTIONS.length - 1)) % DASH_SECTIONS.length], true);
    });
  });
  // Partes das áreas (Eu devo / Me devem; Lançamentos / Contas fixas): abas com setas (padrão WAI-ARIA).
  qsa('[data-sub]').forEach(function(b){
    b.addEventListener('click', function(){ showTab(b.getAttribute('data-sub')); });
    b.addEventListener('keydown', function(e){
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var order = subsOf(SUBTABS[b.getAttribute('data-sub')].parent), i = order.indexOf(b.getAttribute('data-sub'));
      var next = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
      showTab(next);
      document.getElementById('segbtn-' + next).focus();
    });
  });
}

export function wireShell(){
  wireFeatureModules();
  wireKeysAndResize();
  wireClicks();
  wireForms();
  wireConnectionState();
  wireNavigation();
}
