/*
 * Interface do Grana Leve: estado da tela, renderização das abas e eventos.
 * Regras de dinheiro, datas, faturas e saldos ficam em ../domain/; persistência em ../data/.
 */
import {toDateKey, todayKey, monthKeyOf, parseDate, formatDateBr, formatDateFull, validDateStr,
  monthBounds, monthLabelOf, shiftMonthKey} from '../domain/dates.js';
import {money, sumMoney, fmtMoney} from '../domain/money.js';
import {findById, sum, uid} from '../domain/util.js';
import * as Cats from '../domain/categories.js';
import {CUSTOM_COLORS} from '../domain/categories.js';
import * as Tx from '../domain/transactions.js';
import {MAX_INSTALLMENTS, clampInstall} from '../domain/transactions.js';
import * as Cards from '../domain/cards.js';
import {invoiceKeyFor, invoiceDates} from '../domain/cards.js';
import * as Budgets from '../domain/budgets.js';
import {statusForPct} from '../domain/budgets.js';
import * as Accounts from '../domain/accounts.js';
import * as Vouchers from '../domain/vouchers.js';
import * as Fc from '../domain/forecasts.js';
import {recvInstallInfo, recvNextDue, recvRemaining} from '../domain/receivables.js';
import {parse as parseMessage} from '../domain/parser.js';
import {Store, COLLECTIONS} from '../data/store.js';
import {buildBackup, readBackup} from '../data/backup.js';
import {validateNewTransaction} from '../domain/validate.js';
import {makePasswordRecord, verifyPassword, passwordProblem, sanitizeEmailKey, validEmail, lockRemaining, registerFail, clearFails} from '../data/auth.js';
import {saveSession, loadSession, clearSession, newSession, getPrefs, setPref, setPrefsOwner, prefsKey} from '../data/session.js';
import {qs, qsa, escapeHtml, csvCell, optionsHtml, labelOf, icon, resolveVar, saveFile, toast} from './dom.js';
import {openModal, confirmAction, askAmount, attachCounters} from './modal.js';
import {wireTooltips} from './charts.js';
import {pdfWriter, showPdf, pdfReady} from './pdf.js';

/* ============ Constants ============ */
var PAYMENT_LABELS = {conta:'Dinheiro, Pix ou débito', vale:'Vale-alimentação / refeição', cartao:'Cartão de crédito'};
var DEBT_KINDS = [
  {id:'banco', label:'Banco ou cartão'},
  {id:'emprestimo', label:'Empréstimo'},
  {id:'pessoal', label:'Pessoal (amigo ou familiar)'},
  {id:'financiamento', label:'Financiamento'},
  {id:'outro', label:'Outro'}
];
var RECV_KINDS = [
  {id:'emprestimo', label:'Empréstimo que fiz'},
  {id:'cartao', label:'Compra no meu cartão'},
  {id:'combinado', label:'Valor combinado'},
  {id:'outro', label:'Outro'}
];
var TIPS = [
  {tag:'Planejamento mensal', title:'Monte seu mês em 15 minutos',
   text:'Antes do dia 5, liste sua renda e separe em três blocos: essencial (moradia, contas, transporte), desejado (lazer, compras) e futuro (poupança, dívidas). Uma referência comum é 50/30/20. Ajuste à sua realidade, mas trate a poupança como parcela fixa, não como o que sobra no fim do mês.'},
  {tag:'Organização de gastos', title:'Registre na hora, não depois',
   text:'Na nossa pesquisa, 26 em cada 48 pessoas disseram esquecer de anotar gastos. O hábito quebra quando a gente deixa para depois. Anote o gasto assim que ele acontece, mesmo só com valor e categoria; ajustar detalhes depois é fácil, lembrar o gasto no fim da semana não é.'},
  {tag:'Cartão de crédito', title:'O limite do cartão não é renda',
   text:'O limite é crédito, não dinheiro seu: vira dívida se a fatura não for paga inteira. Antes de parcelar, pergunte: eu compraria isso à vista? Se a resposta for não, o parcelamento provavelmente está cobrindo uma compra que não cabia no orçamento.'},
  {tag:'Como economizar', title:'Pague-se primeiro',
   text:'Assim que o dinheiro entra, separe o valor da meta antes de gastar com qualquer outra coisa, mesmo que seja pouco. Poupar o que sobra raramente funciona porque quase sempre sobra pouco; poupar primeiro inverte essa lógica.'},
  {tag:'Sair das dívidas', title:'Ataque a dívida mais cara primeiro',
   text:'Liste as dívidas com a taxa de juros de cada uma. Pague o mínimo de todas, mas destine qualquer valor extra para quitar antes a de juros mais alto, geralmente o cartão de crédito. Isso reduz o total pago em juros mais rápido.'}
];
var TIPS_GROW = [
  {tag:'Primeiro passo', title:'Reserva de emergência antes de investir',
   text:'Antes de buscar rendimento alto, junte o equivalente a 3 a 6 meses dos seus gastos essenciais em um lugar seguro e que permita sacar a qualquer momento. É ela que evita entrar no cheque especial quando surge um imprevisto.'},
  {tag:'Onde guardar', title:'Poupança não é a única opção',
   text:'Tesouro Selic e CDBs de liquidez diária que pagam 100% do CDI ou mais costumam render mais que a poupança, com risco baixo. CDBs têm proteção do FGC até R$ 250 mil por instituição. Compare sempre o rendimento já descontado o imposto.'},
  {tag:'Juros compostos', title:'O tempo trabalha a seu favor',
   text:'Guardar R$ 100 por mês a 0,8% ao mês vira cerca de R$ 7.600 em 5 anos, sendo uns R$ 1.600 só de rendimento. Começar cedo, mesmo com pouco, faz mais diferença do que começar tarde com muito.'},
  {tag:'Cuidado', title:'Desconfie de promessa de lucro fácil',
   text:'Rendimento garantido muito acima do mercado, pressão para decidir rápido e ganho por indicar amigos são sinais clássicos de golpe (pirâmide). Na dúvida, não invista no que você não consegue explicar.'},
  {tag:'Diversificar', title:'Não coloque tudo no mesmo lugar',
   text:'Depois da reserva pronta, dividir o dinheiro entre tipos diferentes de investimento (renda fixa de prazos diferentes, por exemplo) reduz o risco de um único problema afetar tudo o que você juntou.'}
];
var HOW_TO = [
  ['Painel', 'mostra o resumo do mês: saldo, ganhos, gastos, previsões de entrada e gráficos. O botão “Relatório em PDF” gera um resumo para guardar ou compartilhar.'],
  ['Ganhos e gastos', 'é onde você anota o que entra e o que sai e deixa previsto o que ainda vai receber. Escolha a forma de pagamento (conta, dinheiro, vale ou cartão) e crie categorias próprias em “Minhas categorias”.'],
  ['Contas e cartões', 'cadastre suas contas de banco com o saldo de hoje, o cartão com limite, fechamento e vencimento e o seu vale-alimentação. O saldo de cada conta acompanha os ganhos e gastos ligados a ela; use “Transferir” para mover dinheiro entre contas e escolha a conta ao marcar uma fatura como paga.'],
  ['Planejar gastos', 'defina quanto quer gastar por categoria. A barra fica amarela perto do valor planejado e vermelha quando passa.'],
  ['Metas', 'crie objetivos com prazo, guarde valores aos poucos e escolha em “Me avise em” quando quer um lembrete na sua agenda.'],
  ['Dívidas', 'registre o que você deve, para banco ou para pessoas, e marque cada parcela paga.'],
  ['A receber', 'anote o que te devem e use “Cobrar” para enviar uma mensagem pronta.'],
  ['Botão +', 'fica sempre no canto da tela e abre o formulário para lançar um gasto ou ganho. Para corrigir um lançamento, toque no lápis ao lado dele.'],
  ['Chat de lançamento', 'aparece ao entrar, uma vez por dia, e também pelo link “Lance pelo chat” no botão +. Escreva como numa conversa: “gastei 30 no mercado e 20 no uber”.'],
  ['Conexões', 'mostra as integrações: app no celular e Google Agenda (já disponíveis), WhatsApp e Open Finance (em preparação).'],
  ['Seus dados e backup', 'abre pelo indicador “Só neste navegador”, no topo, ou pelo rodapé. Mostra onde os dados ficam e quando foi o último backup. Salve um backup de vez em quando: seus dados existem só neste navegador.']
];
var OPEN_FINANCE_BANKS = ['Nubank','Itaú','Bradesco','Banco do Brasil','Caixa','Santander','Inter','C6 Bank','Mercado Pago','PicPay'];
var INFO_PAGES = {
  'sobre': {title:'Sobre o projeto', body:
    '<p>O Grana Leve nasceu na Atividade Extensionista do curso de Engenharia de Software, com o tema “Tecnologia aplicada à inclusão digital”. A proposta é uma ferramenta gratuita e simples de controle financeiro para jovens e famílias da comunidade local.</p>' +
    '<p>As funcionalidades foram definidas a partir de uma pesquisa anônima com 48 pessoas sobre hábitos financeiros, relacionada aos Objetivos de Desenvolvimento Sustentável 1 (erradicação da pobreza), 8 (trabalho decente e crescimento econômico) e 10 (redução das desigualdades).</p>'},
  'privacidade': {title:'Privacidade', body:
    '<p>Nesta versão, seus dados ficam salvos <strong>somente neste navegador</strong>, no seu aparelho. Nada é enviado para servidores do Grana Leve.</p>' +
    '<ul><li><strong>Não há sincronização:</strong> a conta só existe neste navegador. Em outro aparelho, é outra conta, vazia.</li>' +
    '<li><strong>Não há recuperação de senha:</strong> como não existe servidor, ninguém consegue redefinir a senha.</li>' +
    '<li>Se você limpar os dados do navegador, as informações são apagadas. Guarde um backup em “Seus dados e backup”.</li>' +
    '<li>A senha é guardada embaralhada (hash PBKDF2 com sal), nunca em texto puro. Isso protege a senha, mas os lançamentos ficam legíveis para quem usa este aparelho.</li>' +
    '<li>Não usamos cookies de rastreamento nem anúncios.</li>' +
    '<li>Você pode apagar sua conta e todos os seus dados a qualquer momento pelo botão abaixo (quando estiver conectado).</li></ul>'},
  'termos': {title:'Termos de uso', body:
    '<p>O Grana Leve é um projeto acadêmico oferecido gratuitamente, “como está”. Ele ajuda a organizar suas finanças, mas não substitui orientação profissional.</p>' +
    '<ul><li>Os conteúdos da aba Aprenda são educativos e não são recomendação de investimento.</li><li>Você é responsável pelas informações que registra.</li><li>Como os dados ficam no seu navegador, recomendamos exportar seus lançamentos em CSV de tempos em tempos.</li></ul>'},
  'contato': {title:'Contato', body:
    '<p>Sugestões, dúvidas ou problemas? O código do projeto está no GitHub, onde você pode abrir uma <em>issue</em>:</p>' +
    '<p><strong>github.com/arthurliraaa/grana-leve</strong></p>'}
};





/* ============ Regras do domínio aplicadas ao estado atual ============ */
// As regras ficam em js/domain/ (funções puras, testadas em tests/unit). Aqui só ligamos ao State.
function expenseCats(){ return Cats.expenseCats(State.categories); }
function incomeCats(){ return Cats.incomeCats(State.categories); }
function catLabel(id, type, fallback){
  var c = findById(Cats.catsOfType(type, State.categories), id);
  return c ? c.label : (fallback || 'Sem categoria');
}
function catColor(id){
  var c = findById(expenseCats(), id);
  return c ? c.color : 'var(--text-muted)';
}
function categoryNameProblem(name, type, exceptId){ return Cats.categoryNameProblem(name, type, State.categories, exceptId); }
function txLabel(t){ return t.description || catLabel(t.category, t.type, t.categoryLabel); }
function sortTransactions(){ Tx.sortTransactions(State.transactions); }
function txForMonth(key){ return Tx.txForMonth(State.transactions, key); }
function monthTotals(key){ return Tx.monthTotals(State.transactions, key, todayKey()); }
function expenseCategoryTotals(key){ return Tx.expenseCategoryTotals(State.transactions, key); }
function maxTxMonthOffset(){ return Tx.maxMonthOffset(State.transactions, monthBounds(0).key); }
function expandInstallments(tx, n){ return Tx.expandInstallments(tx, n, uid(), tx.description || catLabel(tx.category, tx.type)); }
function installHint(n, amount){ return Tx.installHint(n, amount, fmtMoney); }
function installmentGroups(){ return Tx.installmentGroups(State.transactions, State.cards, todayKey()); }
function invoiceItems(card, key){ return Cards.invoiceItems(State.transactions, card, key); }
function invoiceStatus(card, key){ return Cards.invoiceStatus(card, key, todayKey()); }
function cardUsed(card){ return Cards.cardUsed(State.transactions, card, todayKey()); }
function forecastOccurrences(key){ return Fc.forecastOccurrences(State.forecasts, key); }
function voucherOf(t){ return Vouchers.voucherOf(t, State.vouchers); }
function voucherTx(v){ return Vouchers.voucherTx(v, State.transactions, State.vouchers); }
function voucherBalance(v){ return Vouchers.voucherBalance(v, State.transactions, State.vouchers, todayKey()); }
function budgetLimit(key, cat){ return Budgets.budgetLimit(State.budgetBase, State.budgetMonths, key, cat); }
function budgetLocked(key){ return Budgets.budgetLocked(key, monthBounds(0).key); }
async function setBudget(key, cat, val){
  var plan = Budgets.planWith(State.budgetBase, State.budgetMonths, key, cat, val);
  await Store.put(k(), 'budgets', 'plan-' + key, {month: key, limits: plan});
  State.budgetMonths[key] = plan;
}
function accountData(){ return {transactions: State.transactions, transfers: State.transfers, cards: State.cards, accounts: State.accounts}; }
function accountName(id){ return Accounts.accountName(State.accounts, id); }
function accountMoves(a){ return Accounts.accountMoves(a, accountData(), todayKey(), txLabel); }
function accountBalance(a){ return Accounts.accountBalance(a, accountData(), todayKey(), txLabel); }
function totalAccountsBalance(){ return sumMoney(State.accounts, accountBalance); }


/* ============ App state ============ */
var State = {
  session: null,        // {emailKey, name, email, expiresAt}
  transactions: [],
  budgetBase: {},       // planejamento antigo, de antes de cada mês ter o seu
  budgetMonths: {},     // {'2026-10': {categoria: valor}}
  goals: [],
  debts: [],
  cards: [],
  receivables: [],
  forecasts: [],
  categories: [],
  vouchers: [],
  accounts: [],         // contas bancárias, com o saldo informado no cadastro
  transfers: [],        // transferências entre contas (não contam como ganho nem gasto)
  txMonthOffset: 0,
  budgetMonthOffset: 0,
  invoiceOffsets: {},
  goalFilter: 'andamento',
  donutView: 'chart',
  barView: 'chart',
  barMonths: 6,
  activeTab: 'dashboard',
  persisted: null,      // o navegador aceitou não apagar os dados sozinho (navigator.storage.persist)
  authTab: 'login'
};

function k(){ return State.session.emailKey; }

/* ============ Tema claro/escuro ============ */
var THEME_KEY = 'granaleve_theme';
function currentTheme(){
  var t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(t){
  if (t) document.documentElement.setAttribute('data-theme', t);
  var btn = document.getElementById('themeToggle');
  var isDark = currentTheme() === 'dark';
  btn.innerHTML = icon(isDark ? 'sun' : 'moon');
  btn.setAttribute('aria-label', isDark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
  btn.title = isDark ? 'Modo claro' : 'Modo escuro';
}
function toggleTheme(){
  var next = currentTheme() === 'dark' ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); } catch(e){}
  applyTheme(next);
  if (State.session) renderAll();
}
(function initTheme(){
  var saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); } catch(e){}
  applyTheme(saved === 'dark' || saved === 'light' ? saved : null);
})();

/* ============ Rendering ============ */

function showView(name){
  ['viewLanding','viewAuth','viewApp'].forEach(function(id){
    document.getElementById(id).hidden = (id !== name);
  });
  document.getElementById('fabAdd').hidden = (name !== 'viewApp');
  window.scrollTo(0,0);
}

function renderTopbar(){
  var wrap = document.getElementById('topbarActions');
  if (State.session){
    var cloud = Store.mode === 'cloud';
    var where = cloud ? 'Dados salvos na nuvem do app.' : 'Dados salvos só neste navegador.';
    wrap.innerHTML =
      '<button type="button" class="sync-badge" id="storageBtn" title="' + where + ' Toque para ver detalhes e backup." aria-label="' + where + ' Ver detalhes e backup">' +
        '<span class="sync-dot ' + (cloud ? 'cloud' : 'local') + '" aria-hidden="true"></span><span class="sync-text">' + (cloud ? 'Na nuvem' : 'Só neste navegador') + '</span>' +
      '</button>' +
      '<span class="user-chip">Olá, <strong>' + escapeHtml(State.session.name.split(' ')[0]) + '</strong></span>' +
      '<button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Sair</button>';
    qs('#logoutBtn').addEventListener('click', logout);
    qs('#storageBtn').addEventListener('click', dataModal);
  } else {
    wrap.innerHTML =
      '<button class="btn btn-ghost btn-sm" data-action="go-login">Entrar</button>' +
      '<button class="btn btn-primary btn-sm" data-action="go-signup">Criar conta</button>';
  }
}

async function loadAllData(){
  var key = k();
  var res = await Promise.all(COLLECTIONS.map(function(c){ return Store.list(key, c); }));
  var byName = {};
  COLLECTIONS.forEach(function(c, i){ byName[c] = res[i]; });
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
}


function pctDelta(cur, prev){
  if (!prev) return null;
  return ((cur-prev)/Math.abs(prev))*100;
}
function deltaBadge(cur, prev, downIsGood){
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

/* ---------- Previsões de entrada ---------- */

function renderForecasts(){
  var cur = monthBounds(0);
  document.getElementById('forecastMonthLabel').textContent = cur.label;
  var occ = forecastOccurrences(cur.key);
  var list = document.getElementById('forecastList');
  var pending = occ.filter(function(o){ return o.received === undefined; });
  var receivedOcc = occ.filter(function(o){ return o.received !== undefined; });
  if (!occ.length){ list.innerHTML = '<p class="empty-state" style="padding:14px">Nenhuma entrada prevista para este mês.</p>'; return; }
  list.innerHTML = pending.concat(receivedOcc).map(function(o){
    var done = o.received !== undefined;
    return '<div class="list-row">' +
      '<span class="tx-cat-dot" style="background:' + (done ? 'var(--good)' : 'var(--accent)') + '"></span>' +
      '<div class="tx-main"><div class="tx-desc">' + escapeHtml(o.f.description) + (o.f.recurring ? ' <span class="pill">todo mês</span>' : '') + '</div>' +
      '<div class="tx-meta">' + (done ? 'Recebido · ' : 'Previsto para ') + formatDateFull(o.date) + '</div></div>' +
      '<span class="tx-amount income tabular">' + fmtMoney(done ? o.received : o.f.amount) + '</span>' +
      '<div class="row-actions">' +
        (done ? '<span class="status-pill good">recebido</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-fc-receive="' + o.f.id + '" data-fc-date="' + o.date + '">Recebi</button>') +
        '<button class="tx-del" type="button" data-fc-del="' + o.f.id + '" aria-label="Excluir previsão" title="Excluir">' + icon('trash') + '</button>' +
      '</div></div>';
  }).join('');
}

async function receiveForecast(id, date){
  var f = findById(State.forecasts, id);
  if (!f) return;
  var r = await askAmount({title:'Registrar recebimento', message:'Confirme quanto entrou de “' + f.description + '”. O valor vai para os seus ganhos.', value: f.amount, submitLabel:'Registrar', extraHtml: accountSelectHtml('askAcc', 'acc', 'Entrou em')});
  if (!r) return;
  var key = monthKeyOf(date);
  var tx = {type:'income', amount:r.amount, category: f.category || 'salario', date: date > todayKey() ? todayKey() : date, description: f.description, paymentMethod:null, accountId: r.accountId, createdAt: Date.now()};
  var saved = await Store.add(k(), 'transactions', tx);
  State.transactions.unshift(saved); sortTransactions();
  var received = Object.assign({}, f.received || {}); received[key] = r.amount;
  await Store.update(k(), 'forecasts', id, {received: received});
  f.received = received;
  renderDashboard(); renderTransactionsTab();
  toast('Ganho de ' + fmtMoney(r.amount) + ' registrado.');
}

/* ---------- Painel ---------- */
// O painel separa o que já aconteceu (data até hoje) do que ainda vai acontecer no mês,
// e o que existe agora (contas, faturas, metas, dívidas, a receber). Regras em docs/regras-financeiras.md.
function dashboardFigures(){
  var cur = monthBounds(0), today = todayKey();
  var t = monthTotals(cur.key);
  var pendingForecast = sumMoney(forecastOccurrences(cur.key).filter(function(o){ return o.received === undefined; }), function(o){ return o.f.amount; });
  var expectedIncome = money(pendingForecast + t.incomeScheduled);
  var balanceDone = money(t.incomeDone - t.expenseDone);
  return {
    t: t, expectedIncome: expectedIncome, balanceDone: balanceDone,
    balanceEnd: money(balanceDone + expectedIncome - t.expenseScheduled),
    invoices: Cards.invoicesSummary(State.transactions, State.cards, today),
    savedInGoals: sumMoney(State.goals.filter(function(g){ return !g.deletedAt; }), function(g){ return g.currentAmount; }),
    debtRemaining: money(sumMoney(State.debts, function(d){ return Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0)); }) +
      sumMoney(installmentGroups(), function(g){ return g.remaining; })),
    toReceive: sumMoney(State.receivables, recvRemaining)
  };
}
function renderStatTiles(){
  var f = dashboardFigures(), t = f.t;
  function tile(label, value, cls, sub){
    return '<div class="tile"><span class="tile-lbl">' + label + '</span><span class="tile-val tabular ' + (cls||'') + '">' + fmtMoney(value) + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';
  }
  var inv = f.invoices, invoiceSub = '';
  if (inv.toPay.length){
    var next = inv.toPay[0];
    invoiceSub = (next.status === 'vencida' ? '<span class="neg-text">venceu ' : 'vence ') + formatDateBr(next.due) + (next.status === 'vencida' ? '</span>' : '') + (inv.toPay.length > 1 ? ' · ' + inv.toPay.length + ' faturas' : '');
  } else if (inv.openTotal > 0) invoiceSub = 'Fatura aberta: ' + fmtMoney(inv.openTotal);
  var month = tile('Ganhos do mês', t.incomeDone, '', f.expectedIncome > 0 ? 'Esperado ainda: + ' + fmtMoney(f.expectedIncome) : '') +
    tile('Gastos do mês', t.expenseDone, '', t.expenseScheduled > 0 ? 'Agendado: + ' + fmtMoney(t.expenseScheduled) : '') +
    tile('Saldo do mês', f.balanceDone, f.balanceDone < 0 ? 'neg' : 'pos', f.balanceEnd !== f.balanceDone ? 'Previsto no fim do mês: ' + fmtMoney(f.balanceEnd) : '');
  var now = (State.accounts.length ? tile('Disponível nas contas', totalAccountsBalance(), totalAccountsBalance() < 0 ? 'neg' : '', 'hoje, em ' + State.accounts.length + (State.accounts.length > 1 ? ' contas' : ' conta')) : '') +
    (State.cards.length ? tile('Faturas a pagar', inv.toPayTotal, '', invoiceSub) : '') +
    tile('Guardado nas metas', f.savedInGoals) +
    tile('Dívida restante', f.debtRemaining) +
    tile('A receber', f.toReceive);
  document.getElementById('statTiles').innerHTML =
    '<p class="tiles-group">Neste mês <span>realizado até hoje</span></p><div class="stat-tiles stat-tiles-auto">' + month + '</div>' +
    '<p class="tiles-group">Agora</p><div class="stat-tiles stat-tiles-auto">' + now + '</div>';
}

var CALC_RULES = [
  ['Realizado e agendado', 'Ganhos e gastos do mês contam só o que tem data até hoje. O que tem data mais para frente no mês (uma parcela, um gasto agendado) aparece como “Agendado” e entra na previsão do fim do mês.'],
  ['Esperado', 'Soma as previsões de entrada ainda não recebidas e os ganhos com data futura no mês.'],
  ['Cartão de crédito', 'A compra conta como gasto na data da compra, no mês em que foi feita. Ela entra na fatura do mês em que a fatura fecha: compra feita depois do dia de fechamento vai para a fatura seguinte.'],
  ['Pagar a fatura', 'Não é um gasto novo (as compras já contaram). Se você escolher uma conta ao marcar a fatura como paga, o valor sai do saldo dessa conta.'],
  ['Faturas a pagar', 'Soma as faturas que já fecharam e não foram marcadas como pagas. A fatura aberta, que ainda recebe compras, aparece embaixo.'],
  ['Parcelas', 'Cada parcela é um gasto no mês dela. Os centavos que sobram da divisão ficam na 1ª parcela. As parcelas futuras somam em “Dívida restante”.'],
  ['Disponível nas contas', 'Parte do saldo que você informou e soma o que veio depois: ganhos e gastos ligados à conta, transferências e faturas pagas com ela. Transferência não é ganho nem gasto.']
];
async function calcHelp(){
  await openModal({
    title: 'Como o painel calcula', submitLabel: null, cancelLabel: 'Fechar',
    body: '<dl class="rules-list">' + CALC_RULES.map(function(r){ return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>'
  });
}

function renderComparison(){
  var cur = monthBounds(0), prev = monthBounds(-1);
  document.getElementById('comparisonMonthsLabel').textContent = cur.label + ' vs ' + prev.label;
  var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
  var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);

  document.getElementById('comparisonSummary').innerHTML =
    '<div class="tile tile-sm"><span class="tile-lbl">Ganhos</span><span class="tile-val tabular">'+fmtMoney(curT.income)+'</span>'+deltaBadge(curT.income, prevT.income, false)+'</div>' +
    '<div class="tile tile-sm"><span class="tile-lbl">Gastos</span><span class="tile-val tabular">'+fmtMoney(curT.expense)+'</span>'+deltaBadge(curT.expense, prevT.expense, true)+'</div>' +
    '<div class="tile tile-sm"><span class="tile-lbl">Saldo</span><span class="tile-val tabular">'+fmtMoney(curT.saldo)+'</span>'+deltaBadge(curT.saldo, prevT.saldo, false)+'</div>';

  var list = document.getElementById('comparisonList');
  var cats = expenseCats().map(function(c){
    return {label:c.label, color:c.color, cur: curCats[c.id]||0, prev: prevCats[c.id]||0};
  }).filter(function(c){ return c.cur>0 || c.prev>0; });
  if (!cats.length){
    list.innerHTML = '<p class="chart-empty">Ainda não há gastos suficientes para comparar os dois meses.</p>';
    return;
  }
  list.innerHTML = '<div class="cmp-row cmp-head"><span>Categoria</span><span class="tabular">'+cur.label.slice(0,3)+'</span><span class="tabular">'+prev.label.slice(0,3)+'</span><span>Variação</span></div>' +
    cats.map(function(c){
      return '<div class="cmp-row"><span class="cmp-cat"><span class="legend-swatch" style="background:'+resolveVar(c.color, list)+'"></span>'+escapeHtml(c.label)+'</span>' +
        '<span class="tabular">'+fmtMoney(c.cur)+'</span><span class="tabular">'+fmtMoney(c.prev)+'</span>' + deltaBadge(c.cur, c.prev, true) + '</div>';
    }).join('');
}

function renderDashboard(){
  var cur = monthBounds(0);
  document.getElementById('monthLabel').textContent = 'Painel de ' + cur.label;
  renderBackupBanner();
  renderStatTiles();
  renderForecasts();
  renderDonut(txForMonth(cur.key));
  renderBarChart();
  renderComparison();
  renderRecentTx();
}

function setToggleLabel(which){
  var btn = qs('[data-view-toggle="' + which + '"]');
  var view = which === 'donut' ? State.donutView : State.barView;
  btn.textContent = view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico';
}

function renderDonut(monthTx){
  var wrap = document.getElementById('donutWrap');
  setToggleLabel('donut');
  var byCat = {};
  monthTx.filter(function(t){ return t.type==='expense'; }).forEach(function(t){
    byCat[t.category] = (byCat[t.category]||0) + Number(t.amount||0);
  });
  var entries = expenseCats().map(function(c){ return {label:c.label, color:c.color, value: byCat[c.id]||0}; }).filter(function(e){ return e.value>0; });
  var total = sum(entries, function(e){ return e.value; });

  if (!total){
    wrap.innerHTML = '<p class="chart-empty">Sem gastos registrados neste mês ainda.</p>';
    return;
  }
  if (State.donutView === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' +
      entries.map(function(e){ return '<tr><td>'+escapeHtml(e.label)+'</td><td class="tabular">'+fmtMoney(e.value)+'</td><td class="tabular">'+Math.round(100*e.value/total)+'%</td></tr>'; }).join('') +
      '<tr><td><strong>Total</strong></td><td class="tabular"><strong>'+fmtMoney(total)+'</strong></td><td>100%</td></tr></tbody></table>';
    return;
  }
  var size = 220, r = 80, cx = size/2, cy = size/2, circumference = 2*Math.PI*r;
  var cum = 0;
  var circles = entries.map(function(e){
    var frac = e.value/total;
    var dash = frac*circumference;
    var offset = -cum*circumference;
    cum += frac;
    return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+resolveVar(e.color, wrap)+'" stroke-width="26" ' +
      'stroke-dasharray="'+dash.toFixed(2)+' '+(circumference-dash).toFixed(2)+'" stroke-dashoffset="'+offset.toFixed(2)+'" ' +
      'transform="rotate(-90 '+cx+' '+cy+')" tabindex="0" data-label="'+escapeHtml(e.label)+'" data-value="'+fmtMoney(e.value)+'" class="donut-seg"></circle>';
  }).join('');

  var svg = '<svg viewBox="0 0 '+size+' '+size+'" width="100%" height="240" role="img" aria-label="Gastos por categoria">' +
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--gridline)" stroke-width="26"></circle>' +
    circles +
    '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="13" fill="var(--text-secondary)">Total</text>' +
    '<text x="'+cx+'" y="'+(cy+16)+'" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text-primary)">'+fmtMoney(total)+'</text>' +
    '</svg>';
  var legend = '<div class="legend">' + entries.map(function(e){
    return '<span class="legend-item"><span class="legend-swatch" style="background:'+resolveVar(e.color,wrap)+'"></span>' + escapeHtml(e.label) + ' · ' + fmtMoney(e.value) + '</span>';
  }).join('') + '</div>';

  wrap.innerHTML = svg + legend;
  wireTooltips(wrap, '.donut-seg');
}


function renderBarChart(){
  var wrap = document.getElementById('barWrap');
  setToggleLabel('bar');
  var n = State.barMonths;
  var months = [];
  for (var i=n-1;i>=0;i--){ months.push(monthBounds(-i)); }
  var data = months.map(function(m){
    var t = monthTotals(m.key);
    return {label: m.label.slice(0,3), full: m.label, inc: t.income, exp: t.expense};
  });

  if (State.barView === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Mês</th><th>Ganhos</th><th>Gastos</th><th>Saldo</th></tr></thead><tbody>' +
      data.map(function(d){ return '<tr><td>'+d.full+'</td><td class="tabular">'+fmtMoney(d.inc)+'</td><td class="tabular">'+fmtMoney(d.exp)+'</td><td class="tabular">'+fmtMoney(d.inc-d.exp)+'</td></tr>'; }).join('') +
      '</tbody></table>';
    return;
  }

  var max = Math.max(1, Math.max.apply(null, data.map(function(d){ return Math.max(d.inc,d.exp); })));
  var W = 320, H = 200, padL = 34, padB = 22, padT = 10, padR = 6;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var groupW = plotW / data.length;
  var barW = Math.min(16, groupW/3);
  var incColor = resolveVar('var(--cat-1)', wrap), expColor = resolveVar('var(--cat-8)', wrap);
  var grid = [0,0.5,1].map(function(f){
    var y = padT + plotH*(1-f);
    return '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="var(--gridline)" stroke-width="1"></line>' +
      '<text x="'+(padL-6)+'" y="'+(y+3)+'" text-anchor="end" font-size="8">'+fmtMoney(max*f).replace('R$','').trim()+'</text>';
  }).join('');
  var bars = data.map(function(d, idx){
    var gx = padL + idx*groupW;
    var hInc = (d.inc/max)*plotH, hExp = (d.exp/max)*plotH;
    var x1 = gx + groupW/2 - barW - 1, x2 = gx + groupW/2 + 1;
    return '<rect class="bar-seg" data-label="Ganhos · '+d.full+'" data-value="'+fmtMoney(d.inc)+'" x="'+x1+'" y="'+(padT+plotH-hInc)+'" width="'+barW+'" height="'+Math.max(hInc,1)+'" rx="3" fill="'+incColor+'" tabindex="0"></rect>' +
      '<rect class="bar-seg" data-label="Gastos · '+d.full+'" data-value="'+fmtMoney(d.exp)+'" x="'+x2+'" y="'+(padT+plotH-hExp)+'" width="'+barW+'" height="'+Math.max(hExp,1)+'" rx="3" fill="'+expColor+'" tabindex="0"></rect>' +
      '<text x="'+(gx+groupW/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="'+(n > 6 ? 7 : 9)+'">'+d.label+'</text>';
  }).join('');
  var svg = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="220" role="img" aria-label="Ganhos e gastos dos últimos '+n+' meses">' +
    grid + '<line x1="'+padL+'" y1="'+(padT+plotH)+'" x2="'+(W-padR)+'" y2="'+(padT+plotH)+'" stroke="var(--baseline)" stroke-width="1"></line>' +
    bars + '</svg>';
  var legend = '<div class="legend">' +
    '<span class="legend-item"><span class="legend-swatch" style="background:'+incColor+'"></span>Ganhos</span>' +
    '<span class="legend-item"><span class="legend-swatch" style="background:'+expColor+'"></span>Gastos</span>' +
    '</div>';
  wrap.innerHTML = svg + legend;
  wireTooltips(wrap, '.bar-seg');
}

function renderRecentTx(){
  var list = document.getElementById('recentTxList');
  var today = todayKey();
  var recent = State.transactions.filter(function(t){ return t.date <= today; }).slice(0,5);
  if (!recent.length){ list.innerHTML = '<p class="empty-state">Nenhum lançamento ainda. Toque no botão “+” para começar.</p>'; return; }
  list.innerHTML = recent.map(txRowHtml).join('');
}

function paymentLabel(t){
  if (t.type === 'income'){ var ai = t.accountId && findById(State.accounts, t.accountId); return ai ? 'Em ' + ai.name : ''; }
  if (t.type !== 'expense' || !t.paymentMethod) return '';
  if (t.paymentMethod === 'cartao'){
    var c = findById(State.cards, t.cardId);
    return c ? 'Cartão ' + c.name : 'Cartão de crédito';
  }
  if (t.paymentMethod === 'vale'){
    var v = voucherOf(t);
    return v ? 'Vale ' + v.name : 'Vale';
  }
  var a = t.accountId && findById(State.accounts, t.accountId);
  return a ? a.name : '';
}

function txRowHtml(t){
  var isExpense = t.type === 'expense';
  var dot = isExpense ? resolveVar(catColor(t.category)) : 'var(--good)';
  var cat = catLabel(t.category, t.type, t.categoryLabel);
  var pay = paymentLabel(t);
  return '<div class="tx-row" data-id="'+escapeHtml(t.id)+'">' +
    '<span class="tx-cat-dot" style="background:'+dot+'"></span>' +
    '<div class="tx-main"><div class="tx-desc">'+escapeHtml(t.description || cat)+'</div>' +
    '<div class="tx-meta">'+escapeHtml(cat) + ' · ' + formatDateBr(t.date) + (pay ? ' · ' + escapeHtml(pay) : '') + '</div></div>' +
    '<span class="tx-amount ' + (isExpense ? 'expense' : 'income') + ' tabular">' + (isExpense ? '-' : '+') + ' ' + fmtMoney(t.amount) + '</span>' +
    '<button class="tx-del tx-edit" type="button" data-edit-tx="'+escapeHtml(t.id)+'" aria-label="Editar lançamento" title="Editar">' + icon('edit') + '</button>' +
    '<button class="tx-del" type="button" data-del-tx="'+escapeHtml(t.id)+'" aria-label="Excluir lançamento" title="Excluir">' + icon('trash') + '</button>' +
    '</div>';
}

/* ---------- Ganhos e gastos ---------- */
function currentTxType(){ return qs('#typeToggle button.active').getAttribute('data-type'); }

function populateCategorySelect(selected){
  var sel = document.getElementById('txCategory');
  var list = currentTxType() === 'income' ? incomeCats() : expenseCats();
  sel.innerHTML = optionsHtml(list, selected) + '<option value="__new">+ Nova categoria…</option>';
  if (!selected) sel.value = list[0].id;
}
// Formas de pagamento de um gasto (usadas no formulário da aba e no popup de lançamento).
function paymentOptions(){
  var opts = [];
  if (State.accounts.length){
    State.accounts.forEach(function(a){ opts.push({id:'acc:' + a.id, label:'Pix ou débito · ' + a.name}); });
    opts.push({id:'conta', label:'Dinheiro (fora das contas)'});
  } else opts.push({id:'conta', label: PAYMENT_LABELS.conta});
  if (State.vouchers.length) State.vouchers.forEach(function(v){ opts.push({id:'vale:' + v.id, label:'Vale · ' + v.name}); });
  else opts.push({id:'vale', label: PAYMENT_LABELS.vale});
  State.cards.forEach(function(c){ opts.push({id:'card:' + c.id, label:'Cartão de crédito · ' + c.name}); });
  if (!State.cards.length) opts.push({id:'card:none', label:'Cartão de crédito (cadastre em Contas e cartões)'});
  return opts;
}
// Valor do select de pagamento que corresponde a um lançamento já salvo.
function paymentValue(t){
  if (t.paymentMethod === 'cartao' && t.cardId) return 'card:' + t.cardId;
  if (t.paymentMethod === 'vale'){ var v = voucherOf(t); return v ? 'vale:' + v.id : 'vale'; }
  if (t.accountId && findById(State.accounts, t.accountId)) return 'acc:' + t.accountId;
  return 'conta';
}
// Contas para o campo “Entrou em” / “Saiu de”. A primeira conta vem marcada.
function accountOptions(){
  return State.accounts.map(function(a){ return {id: a.id, label: a.name}; }).concat([{id:'', label:'Não informar (dinheiro)'}]);
}
function accountSelectHtml(id, name, label, selected){
  if (!State.accounts.length) return '';
  return '<div class="field" id="' + id + 'Field"><label for="' + id + '">' + label + '</label><select id="' + id + '" name="' + name + '">' +
    optionsHtml(accountOptions(), selected === undefined ? State.accounts[0].id : (selected || '')) + '</select></div>';
}
// Grava no lançamento a forma de pagamento escolhida. Campos que não se aplicam ficam nulos,
// para que a edição apague o cartão ou o vale de antes.
function applyPayment(tx, pay){
  tx.cardId = null; tx.voucherId = null; tx.accountId = null;
  if (pay.indexOf('card:') === 0){ tx.paymentMethod = 'cartao'; tx.cardId = pay.slice(5); }
  else if (pay.indexOf('vale:') === 0){ tx.paymentMethod = 'vale'; tx.voucherId = pay.slice(5); }
  else if (pay.indexOf('acc:') === 0){ tx.paymentMethod = 'conta'; tx.accountId = pay.slice(4); }
  else tx.paymentMethod = pay;
}
function populatePaymentSelect(){
  var sel = document.getElementById('txPayment');
  var prev = sel.value;
  var opts = paymentOptions();
  sel.innerHTML = optionsHtml(opts, prev);
  // Ao cadastrar a primeira conta, ela passa a ser o padrão no lugar de “Dinheiro”.
  var hadAccounts = sel.getAttribute('data-accounts') === '1';
  if (!findById(opts, prev) || (prev === 'conta' && !hadAccounts)) sel.value = opts[0].id;
  sel.setAttribute('data-accounts', State.accounts.length ? '1' : '0');
  var acc = document.getElementById('txAccount');
  var prevAcc = acc.value;
  acc.innerHTML = optionsHtml(accountOptions(), prevAcc);
  if (!findById(accountOptions(), prevAcc)) acc.value = State.accounts.length ? State.accounts[0].id : '';
  syncTxFormVisibility();
}
/* ---------- Seletor de parcelas (− 3x +) ---------- */
function installStepperHtml(id, name){
  return '<div class="stepper"><button type="button" data-step="-1" data-for="' + id + '" aria-label="Menos parcelas">−</button>' +
    '<input id="' + id + '" name="' + name + '" type="number" min="1" max="' + MAX_INSTALLMENTS + '" step="1" value="1" inputmode="numeric">' +
    '<span class="stepper-x" aria-hidden="true">x</span><button type="button" data-step="1" data-for="' + id + '" aria-label="Mais parcelas">+</button></div>';
}
function populateInstallSelect(){
  var inp = document.getElementById('txInstall');
  document.getElementById('txInstallHint').textContent = installHint(clampInstall(inp.value), money(document.getElementById('txAmount').value));
}
// Os botões − e + funcionam em qualquer seletor de parcelas, inclusive dentro dos popups.
document.addEventListener('click', function(e){
  var b = e.target.closest('[data-step]');
  if (!b) return;
  var inp = document.getElementById(b.getAttribute('data-for'));
  if (!inp || inp.disabled) return;
  inp.value = clampInstall(clampInstall(inp.value) + Number(b.getAttribute('data-step')));
  inp.dispatchEvent(new Event('input', {bubbles:true}));
});
document.addEventListener('change', function(e){
  if (e.target.matches && e.target.matches('.stepper input')){ e.target.value = clampInstall(e.target.value); e.target.dispatchEvent(new Event('input', {bubbles:true})); }
});
function syncTxFormVisibility(){
  var isExpense = currentTxType() === 'expense';
  var onCard = isExpense && document.getElementById('txPayment').value.indexOf('card:') === 0 && document.getElementById('txPayment').value !== 'card:none';
  document.getElementById('txInstallField').hidden = !onCard;
  if (!onCard){ document.getElementById('txInstall').value = '1'; populateInstallSelect(); }
  document.getElementById('txPaymentField').hidden = !isExpense;
  document.getElementById('txAccountField').hidden = isExpense || !State.accounts.length;
  document.getElementById('txForOtherField').hidden = !isExpense;
  var other = document.getElementById('txForOther').checked;
  document.getElementById('txOtherName').hidden = !other;
  document.getElementById('txOtherHint').hidden = !other;
}


function renderTransactionsTab(){
  var mb = monthBounds(State.txMonthOffset);
  document.getElementById('txMonthLabel').textContent = mb.label;
  document.getElementById('nextMonth').disabled = State.txMonthOffset >= maxTxMonthOffset();
  var tx = filterTransactions(txForMonth(mb.key));
  var filtering = tx.length !== txForMonth(mb.key).length || isFiltering();
  var income = sum(tx.filter(function(t){ return t.type==='income'; }), function(t){ return t.amount; });
  var expenseTx = tx.filter(function(t){ return t.type==='expense'; });
  var expense = sum(expenseTx, function(t){ return t.amount; });
  var onCard = sum(expenseTx.filter(function(t){ return t.paymentMethod==='cartao'; }), function(t){ return t.amount; });
  var onVale = sum(expenseTx.filter(function(t){ return t.paymentMethod==='vale'; }), function(t){ return t.amount; });
  document.getElementById('txSummary').textContent = (filtering ? 'Filtrando: ' : '') + tx.length + ' lançamento(s) · ganhos ' + fmtMoney(income) + ' · gastos ' + fmtMoney(expense) +
    (onCard ? ' (no cartão ' + fmtMoney(onCard) + ')' : '') + (onVale ? ' · no vale ' + fmtMoney(onVale) : '');
  var list = document.getElementById('txList');
  if (!tx.length){ list.innerHTML = '<p class="empty-state">' + (filtering ? 'Nenhum lançamento encontrado com esses filtros.' : 'Nenhum lançamento neste mês.') + '</p>'; return; }
  list.innerHTML = tx.map(txRowHtml).join('');
}

// Busca sem diferenciar acentos e maiúsculas ("almoco" encontra "Almoço").
function fold(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function isFiltering(){
  return !!document.getElementById('txSearch').value.trim() || document.getElementById('txFilterType').value !== 'all' || document.getElementById('txFilterPay').value !== 'all';
}
function filterTransactions(list){
  var q = fold(document.getElementById('txSearch').value.trim());
  var type = document.getElementById('txFilterType').value;
  var pay = document.getElementById('txFilterPay').value;
  return list.filter(function(t){
    if (type !== 'all' && t.type !== type) return false;
    if (pay !== 'all' && (t.type !== 'expense' || (t.paymentMethod || 'conta') !== pay)) return false;
    if (q && fold((t.description || '') + ' ' + catLabel(t.category, t.type, t.categoryLabel) + ' ' + paymentLabel(t)).indexOf(q) < 0) return false;
    return true;
  });
}

// A mesma lista de categorias serve para “Ganhos e gastos” e “Planejar gastos”.
async function addCategory(name, type){
  name = String(name || '').trim();
  var problem = categoryNameProblem(name, type);
  if (problem) return {error: problem};
  var color = CUSTOM_COLORS[State.categories.length % CUSTOM_COLORS.length];
  var saved = await Store.add(k(), 'categories', {label:name, type:type, color:color, createdAt:Date.now()});
  State.categories.push(saved);
  return saved;
}
async function createCategory(type){
  var r = await openModal({
    title: 'Nova categoria de ' + (type === 'income' ? 'ganho' : 'gasto'),
    body: '<div class="field"><label for="newCatName">Nome</label><input id="newCatName" name="name" type="text" maxlength="30" placeholder="Ex: Pets, Academia"></div>' +
      '<p class="field-hint">A categoria aparece em “Ganhos e gastos”' + (type === 'income' ? '.' : ' e em “Planejar gastos”.') + '</p>',
    submitLabel: 'Criar categoria',
    onSubmit: function(form){ return addCategory(form.name.value, type); }
  });
  if (r && r.id){ toast('Categoria “' + r.label + '” criada.'); return r.id; }
  return null;
}

/* ---------- Popup de lançamento (botão + e edição) ---------- */
function txModalBody(t, isEdit){
  var inst = isEdit && t.installment;
  var type = t.type || 'expense';
  function typeBtn(id, label){ return '<button type="button" data-type="' + id + '"' + (type === id ? ' class="active"' : '') + (inst ? ' disabled' : '') + '>' + label + '</button>'; }
  return '<div class="type-toggle" id="mType" role="group" aria-label="Tipo de lançamento">' + typeBtn('expense', 'Gasto') + typeBtn('income', 'Ganho') + '</div>' +
    '<div class="field"><label for="mAmount">' + (inst ? 'Valor da parcela' : 'Valor') + '</label><span class="money-input"><span>R$</span><input id="mAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + (t.amount || '') + '"' + (inst ? ' disabled' : '') + '></span></div>' +
    '<div class="field"><label for="mCategory">Categoria</label><select id="mCategory" name="category"></select></div>' +
    '<div class="field" id="mNewCatField" hidden><label for="mNewCat">Nome da nova categoria</label><input id="mNewCat" name="newCat" type="text" maxlength="30" placeholder="Ex: Pets, Academia"></div>' +
    '<div class="field"><label for="mDate">Data</label><input id="mDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + escapeHtml(t.date || todayKey()) + '"' + (inst ? ' disabled' : '') + '></div>' +
    '<div class="field" id="mPayField"><label for="mPay">Forma de pagamento</label><select id="mPay" name="pay"' + (inst ? ' disabled' : '') + '></select></div>' +
    accountSelectHtml('mAcc', 'acc', 'Entrou em', isEdit ? (t.type === 'income' ? t.accountId : undefined) : undefined) +
    (isEdit ? '' : '<div class="field" id="mInstallField" hidden><label for="mInstall">Parcelas</label>' + installStepperHtml('mInstall', 'install') + '<span class="field-hint tabular" id="mInstallHint">À vista</span></div>') +
    '<div class="field"><label for="mDesc">Descrição (opcional)</label><input id="mDesc" name="desc" type="text" maxlength="80" placeholder="Ex: mercado da semana" value="' + escapeHtml(inst ? t.installment.baseDescription : (t.description || '')) + '"></div>' +
    (inst ? '<p class="field-hint">Parcela ' + t.installment.n + ' de ' + t.installment.total + '. A categoria e a descrição mudam em todas as parcelas. Para mudar valor, data ou número de parcelas, exclua a compra e lance de novo.</p>' : '') +
    (isEdit ? '' : '<button type="button" class="linklike" data-m-chat style="justify-self:start">Prefere escrever? Lance pelo chat</button>');
}

async function openTxModal(t){
  var isEdit = !!(t && t.id);
  t = t || {type: 'expense'};
  var inst = isEdit && t.installment;
  var mType = t.type || 'expense';
  await openModal({
    title: isEdit ? 'Editar lançamento' : 'Novo lançamento',
    body: txModalBody(t, isEdit),
    submitLabel: isEdit ? 'Salvar alterações' : 'Adicionar lançamento',
    onOpen: function(modal, close){
      var catSel = qs('#mCategory', modal), paySel = qs('#mPay', modal), instSel = qs('#mInstall', modal);
      function syncNewCat(){ qs('#mNewCatField', modal).hidden = catSel.value !== '__new'; }
      function fillCats(selected){
        var list = mType === 'income' ? incomeCats() : expenseCats();
        catSel.innerHTML = optionsHtml(list, selected) + '<option value="__new">+ Nova categoria…</option>';
        if (!findById(list, selected)) catSel.value = list[0].id;
        syncNewCat();
      }
      function fillInstall(){
        if (instSel) qs('#mInstallHint', modal).textContent = installHint(clampInstall(instSel.value), money(qs('#mAmount', modal).value));
      }
      function sync(){
        var isExp = mType === 'expense';
        qs('#mPayField', modal).hidden = !isExp;
        if (qs('#mAccField', modal)) qs('#mAccField', modal).hidden = isExp;
        if (!instSel) return;
        var onCard = isExp && paySel.value.indexOf('card:') === 0 && paySel.value !== 'card:none';
        qs('#mInstallField', modal).hidden = !onCard;
        if (!onCard){ instSel.value = '1'; fillInstall(); }
      }
      var payOpts = paymentOptions();
      paySel.innerHTML = optionsHtml(payOpts, isEdit ? paymentValue(t) : payOpts[0].id);
      fillCats(t.category); fillInstall(); sync();
      qs('#mType', modal).addEventListener('click', function(e){
        var b = e.target.closest('button[data-type]');
        if (!b || b.disabled) return;
        mType = b.getAttribute('data-type');
        qsa('button', qs('#mType', modal)).forEach(function(x){ x.classList.toggle('active', x === b); });
        fillCats(); sync();
      });
      catSel.addEventListener('change', syncNewCat);
      paySel.addEventListener('change', function(){
        if (paySel.value.indexOf('vale') === 0 && mType === 'expense') catSel.value = 'alimentacao';
        syncNewCat(); sync();
      });
      qs('#mAmount', modal).addEventListener('input', fillInstall);
      if (instSel) instSel.addEventListener('input', fillInstall);
      var chat = qs('[data-m-chat]', modal);
      if (chat) chat.addEventListener('click', function(){ close(null); openQuickEntry(false); });
    },
    onSubmit: async function(form){
      var amount = inst ? t.amount : money(form.amount.value);
      if (!(amount > 0)) return {error:'Informe um valor maior que zero.'};
      var date = inst ? t.date : (form.date.value || todayKey());
      if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
      var category = form.category.value;
      if (category === '__new'){
        var made = await addCategory(form.newCat.value, mType);
        if (made.error) return made;
        category = made.id;
      }
      var tx = {type: mType, amount: amount, category: category, categoryLabel: catLabel(category, mType), date: date, description: form.desc.value.trim()};
      if (mType === 'income'){ tx.paymentMethod = null; tx.cardId = null; tx.voucherId = null; tx.accountId = form.acc ? (form.acc.value || null) : null; }
      else if (!inst){
        if (form.pay.value === 'card:none') return {error:'Cadastre um cartão em “Contas e cartões” primeiro.'};
        applyPayment(tx, form.pay.value);
      }
      if (isEdit){ await saveTxEdit(t, tx); return true; }
      tx.createdAt = Date.now();
      var n = tx.paymentMethod === 'cartao' ? clampInstall(form.install.value) : 1;
      await saveTransactions(expandInstallments(tx, n));
      renderAll();
      toast((mType === 'expense' ? 'Gasto' : 'Ganho') + ' de ' + fmtMoney(amount) + (n > 1 ? ' em ' + n + 'x' : '') + ' registrado.');
      return true;
    }
  });
}

// Na compra parcelada, categoria e descrição mudam em todas as parcelas; valor e datas ficam como estão.
async function saveTxEdit(t, patch){
  if (t.installment){
    var base = patch.description || catLabel(patch.category, 'expense');
    var group = State.transactions.filter(function(x){ return x.installment && x.installment.group === t.installment.group; });
    for (var i=0;i<group.length;i++){
      var x = group[i];
      var p = {category: patch.category, categoryLabel: patch.categoryLabel, description: base + ' (' + x.installment.n + '/' + x.installment.total + ')',
        installment: Object.assign({}, x.installment, {baseDescription: base})};
      await Store.update(k(), 'transactions', x.id, p);
      Object.assign(x, p);
    }
  } else {
    await Store.update(k(), 'transactions', t.id, patch);
    Object.assign(t, patch);
  }
  sortTransactions();
  renderAll();
  toast('Lançamento atualizado.');
}

async function manageCategories(){
  var editing = null;
  function bodyHtml(){
    if (!State.categories.length) return '<p>Você ainda não criou categorias próprias. Use “+ Nova categoria” em “Planejar gastos” ou a opção “+ Nova categoria…” no campo Categoria.</p>';
    return '<div>' + State.categories.map(function(c){
      if (c.id === editing){
        return '<div class="list-row"><span class="tx-cat-dot" style="background:' + escapeHtml(c.color) + '"></span>' +
          '<input class="chat-input cat-rename" type="text" maxlength="30" value="' + escapeHtml(c.label) + '" aria-label="Novo nome da categoria">' +
          '<button class="btn btn-primary btn-sm" type="button" data-cat-save="' + escapeHtml(c.id) + '">Salvar</button></div>';
      }
      return '<div class="list-row"><span class="tx-cat-dot" style="background:' + escapeHtml(c.color) + '"></span>' +
        '<div class="tx-main"><div class="tx-desc">' + escapeHtml(c.label) + '</div><div class="tx-meta">' + (c.type === 'income' ? 'Ganho' : 'Gasto') + '</div></div>' +
        '<button class="tx-del tx-edit" type="button" data-cat-edit="' + escapeHtml(c.id) + '" aria-label="Renomear categoria" title="Renomear">' + icon('edit') + '</button>' +
        '<button class="tx-del" type="button" data-cat-del="' + escapeHtml(c.id) + '" aria-label="Excluir categoria" title="Excluir">' + icon('trash') + '</button></div>';
    }).join('') + '</div><p class="field-hint">Ao renomear, os lançamentos da categoria passam a mostrar o nome novo. Ao excluir, eles continuam guardados com o nome antigo.</p>';
  }
  await openModal({
    title: 'Minhas categorias',
    body: '<div id="catManageBody">' + bodyHtml() + '</div>',
    submitLabel: null, cancelLabel: 'Fechar',
    onOpen: function(root){
      var body = qs('#catManageBody', root);
      function redraw(){ body.innerHTML = bodyHtml(); var inp = qs('.cat-rename', body); if (inp){ inp.focus(); inp.select(); } }
      async function saveRename(id){
        var c = findById(State.categories, id);
        var name = qs('.cat-rename', body).value.trim();
        var problem = categoryNameProblem(name, c.type, c.id);
        if (problem){ qs('[data-modal-error]', root).textContent = problem; return; }
        qs('[data-modal-error]', root).textContent = '';
        await Store.update(k(), 'categories', id, {label: name});
        c.label = name;
        editing = null;
        redraw(); populateCategorySelect(document.getElementById('txCategory').value); renderAll();
        toast('Categoria renomeada para “' + name + '”.');
      }
      root.addEventListener('click', async function(e){
        var b;
        if ((b = e.target.closest('[data-cat-edit]'))){ editing = b.getAttribute('data-cat-edit'); redraw(); return; }
        if ((b = e.target.closest('[data-cat-save]'))){ saveRename(b.getAttribute('data-cat-save')); return; }
        if (!(b = e.target.closest('[data-cat-del]'))) return;
        var id = b.getAttribute('data-cat-del');
        await Store.remove(k(), 'categories', id);
        State.categories = State.categories.filter(function(c){ return c.id !== id; });
        redraw();
        populateCategorySelect();
        renderAll();
      });
      // Enter no campo de renomear salva, em vez de enviar o formulário do popup.
      root.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && e.target.classList.contains('cat-rename')){ e.preventDefault(); saveRename(editing); }
      });
    }
  });
}

/* ---------- Compras parceladas ---------- */
async function saveTransactions(list){
  var saved = [];
  for (var i=0;i<list.length;i++){
    var s = await Store.add(k(), 'transactions', list[i]);
    State.transactions.unshift(s);
    saved.push(s);
  }
  sortTransactions();
  checkBudgetAlerts(saved);
  return saved;
}

// Avisa na hora quando um gasto do mês atual faz a categoria chegar a 80% ou passar do planejado.
function checkBudgetAlerts(newTx){
  var cur = monthBounds(0).key, added = {};
  newTx.forEach(function(t){ if (t.type === 'expense' && monthKeyOf(t.date) === cur) added[t.category] = (added[t.category]||0) + Number(t.amount); });
  var spentNow = expenseCategoryTotals(cur);
  Object.keys(added).forEach(function(cat){
    var limit = budgetLimit(cur, cat);
    if (!limit) return;
    var after = spentNow[cat] || 0, before = after - added[cat];
    var name = catLabel(cat, 'expense');
    if (after > limit && before <= limit){
      toast('Atenção: você passou ' + fmtMoney(after - limit) + ' do planejado para ' + name + ' neste mês.');
    } else if (after >= 0.8 * limit && before < 0.8 * limit){
      toast('Você já usou ' + Math.round(100 * after / limit) + '% do planejado para ' + name + '. Restam ' + fmtMoney(limit - after) + '.');
    }
  });
}
function installmentRowHtml(g, withCard){
  var pct = g.total > 0 ? (g.paid.length + g.advanced) / g.total : 0;
  return '<div class="debt-card">' +
    '<div class="budget-top"><h4>' + escapeHtml(g.name) + '</h4><span class="pill">' + g.total + 'x' + (withCard && g.card ? ' · ' + escapeHtml(g.card.name) : '') + '</span></div>' +
    '<div class="progress"><span style="width:' + (pct*100) + '%; background:var(--good)"></span></div>' +
    '<div class="debt-figs"><span class="tabular">Parcela ' + Math.min(g.total, g.paid.length + g.advanced) + ' de ' + g.total + ' · ' + fmtMoney(g.perInstallment) + '</span><span class="tabular">Falta: ' + fmtMoney(g.remaining) + '</span></div>' +
    '<span class="tx-meta">Compra de ' + fmtMoney(g.totalAmount) + (g.advanced ? ' · ' + g.advanced + ' parcela(s) adiantada(s)' : '') + (g.future.length ? ' · última parcela em ' + formatDateFull(g.lastDate) : '') + '</span>' +
    '<div class="card-actions">' + (g.future.length ? '<button class="btn btn-ghost btn-sm" type="button" data-adv-group="' + escapeHtml(g.id) + '">Adiantar pagamento</button>' : '<span class="status-pill good">Quitada</span>') + '</div>' +
    '</div>';
}

async function advanceInstallments(groupId){
  var g = installmentGroups().filter(function(x){ return x.id === groupId; })[0];
  if (!g || !g.future.length) return;
  var R = g.future.length;
  var counts = [];
  for (var i=R;i>=1;i--) counts.push({id: String(i), label: i === R ? 'Todas as ' + R + ' restantes' : i + ' parcela(s)'});
  function totalFor(n){ return sum(g.future.slice(R - n), function(t){ return t.amount; }); }
  var r = await openModal({
    title: 'Adiantar pagamento',
    body: '<p>“' + escapeHtml(g.name) + '”: faltam ' + R + ' parcela(s) de ' + fmtMoney(g.perInstallment) + ', total de ' + fmtMoney(g.remaining) + '. As últimas parcelas são as adiantadas.</p>' +
      '<div class="field"><label for="advCount">Quantas parcelas quer adiantar?</label><select id="advCount" name="count">' + optionsHtml(counts, String(R)) + '</select></div>' +
      '<p>Valor sem desconto: <strong id="advTotal" class="tabular">' + fmtMoney(g.remaining) + '</strong></p>' +
      '<fieldset class="radio-group"><legend>Teve desconto adiantando o pagamento?</legend>' +
        '<label class="check"><input type="radio" name="disc" value="sim"> Sim</label>' +
        '<label class="check"><input type="radio" name="disc" value="nao" checked> Não</label>' +
      '</fieldset>' +
      '<div class="field" id="advPaidField" hidden><label for="advPaid">Quanto você pagou?</label><span class="money-input"><span>R$</span><input id="advPaid" name="paid" type="number" step="0.01" min="0.01" max="99999999"></span></div>' +
      '<div class="tip-box" id="advTip"><strong>Dica: veja se compensa.</strong> Sem desconto, adiantar não gera economia: o dinheiro sai antes e deixa de render até a data das parcelas. Costuma valer a pena só se você precisa liberar limite do cartão. Se a compra tem juros, peça o abatimento: o Código de Defesa do Consumidor (art. 52, §2º) garante a redução proporcional dos juros para quem antecipa o pagamento.</div>' +
      '<p class="field-hint">O valor pago entra na fatura atual do cartão' + (g.card ? ' ' + escapeHtml(g.card.name) : '') + '.</p>',
    submitLabel: 'Adiantar',
    onOpen: function(modal){
      function sync(){
        var n = Number(qs('#advCount', modal).value);
        qs('#advTotal', modal).textContent = fmtMoney(totalFor(n));
        var yes = qs('input[name=disc][value=sim]', modal).checked;
        qs('#advPaidField', modal).hidden = !yes;
        qs('#advTip', modal).hidden = yes;
      }
      modal.addEventListener('change', sync);
      sync();
    },
    onSubmit: function(form){
      var n = Number(form.count.value);
      var total = money(totalFor(n));
      var yes = form.disc.value === 'sim';
      var paid = yes ? money(form.paid.value) : total;
      if (yes && !(paid > 0)) return {error:'Informe quanto você pagou com o desconto.'};
      if (yes && paid >= total) return {error:'Com desconto, o valor pago precisa ser menor que ' + fmtMoney(total) + '. Se não teve desconto, marque “Não”.'};
      return {n: n, total: total, paid: paid};
    }
  });
  if (!r || !r.n) return;
  var toRemove = g.future.slice(R - r.n);
  for (var j=0;j<toRemove.length;j++){ await Store.remove(k(), 'transactions', toRemove[j].id); }
  var ids = toRemove.map(function(t){ return t.id; });
  State.transactions = State.transactions.filter(function(t){ return ids.indexOf(t.id) < 0; });
  await saveTransactions([{type:'expense', amount: r.paid, category: g.category, categoryLabel: catLabel(g.category, 'expense'), date: todayKey(),
    description: g.name + ' (adiantamento de ' + r.n + ' parcela' + (r.n > 1 ? 's' : '') + ')', paymentMethod:'cartao', cardId: g.cardId,
    installmentAdvance: {group: g.id, count: r.n, original: r.total, discount: money(r.total - r.paid)}, createdAt: Date.now()}]);
  renderAll();
  toast(r.total > r.paid ? 'Adiantamento registrado. Você economizou ' + fmtMoney(r.total - r.paid) + '!' : 'Adiantamento de ' + fmtMoney(r.paid) + ' registrado.');
}

/* ---------- Relatório por cartão ---------- */
async function cardReport(cardId){
  var c = findById(State.cards, cardId);
  var cats = [{id:'all', label:'Todas as categorias'}].concat(expenseCats().map(function(x){ return {id:x.id, label:x.label}; }));
  var periods = [{id:'1', label:'Fatura atual'}, {id:'3', label:'Últimas 3 faturas'}, {id:'6', label:'Últimas 6 faturas'}, {id:'12', label:'Últimas 12 faturas'}, {id:'next', label:'Próximas faturas (parcelas)'}];
  var st = {period:'6', cat:'all'};
  function keys(){
    var base = invoiceKeyFor(todayKey(), c), out = [];
    if (st.period === 'next'){ for (var i=1;i<=12;i++) out.push(shiftMonthKey(base, i)); return out; }
    for (var j=Number(st.period)-1;j>=0;j--) out.push(shiftMonthKey(base, -j));
    return out;
  }
  function data(){
    var ks = keys();
    var rows = ks.map(function(key){
      var items = invoiceItems(c, key).filter(function(t){ return st.cat === 'all' || t.category === st.cat; });
      return {key:key, items:items, total: sum(items, function(t){ return t.amount; })};
    });
    if (st.period === 'next') rows = rows.filter(function(r){ return r.total > 0; });
    var byCat = {};
    rows.forEach(function(r){ r.items.forEach(function(t){ byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); }); });
    var catRows = expenseCats().map(function(x){ return {label:x.label, color:x.color, value: byCat[x.id]||0}; }).filter(function(x){ return x.value > 0; }).sort(function(a,b){ return b.value - a.value; });
    return {rows: rows, catRows: catRows, total: sum(rows, function(r){ return r.total; })};
  }
  function render(modal){
    var d = data();
    var max = Math.max(1, Math.max.apply(null, d.rows.map(function(r){ return r.total; }).concat([0])));
    qs('#crBody', modal).innerHTML = !d.total ? '<p class="empty-state">Nenhuma compra neste período' + (st.cat !== 'all' ? ' nessa categoria' : '') + '.</p>' :
      '<div class="tile"><span class="tile-lbl">Total no período</span><span class="tile-val tabular">' + fmtMoney(d.total) + '</span></div>' +
      '<h4>Por fatura</h4><div class="report-bars">' + d.rows.map(function(r){
        return '<div class="report-bar"><span>' + monthLabelOf(r.key) + '</span><span class="bar-track"><span style="width:' + (100*r.total/max) + '%"></span></span><strong class="tabular">' + fmtMoney(r.total) + '</strong></div>';
      }).join('') + '</div>' +
      '<h4>Por categoria</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' + d.catRows.map(function(x){
        return '<tr><td><span class="legend-swatch" style="display:inline-block;margin-right:6px;background:' + resolveVar(x.color) + '"></span>' + escapeHtml(x.label) + '</td><td class="tabular">' + fmtMoney(x.value) + '</td><td class="tabular">' + Math.round(100*x.value/d.total) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function pdf(){
    if (!pdfReady()) return;
    var d = data();
    var w = pdfWriter('Relatório do cartão ' + c.name, labelOf(periods, st.period) + '  ·  ' + labelOf(cats, st.cat));
    w.section('Por fatura'); w.header(['Fatura', 'Total'], [220, 140]);
    d.rows.forEach(function(r){ w.row([monthLabelOf(r.key), fmtMoney(r.total)], [220, 140]); });
    w.row(['Total', fmtMoney(d.total)], [220, 140], {bold:true}); w.space(12);
    w.section('Por categoria');
    if (!d.catRows.length) w.text('Nenhuma compra no período.');
    else { w.header(['Categoria', 'Valor', '%'], [220, 140, 80]); d.catRows.forEach(function(x){ w.row([x.label, fmtMoney(x.value), Math.round(100*x.value/d.total) + '%'], [220, 140, 80]); }); }
    w.footer();
    saveFile('grana-leve-relatorio-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.pdf', w.doc.output('blob'), 'application/pdf').then(function(){ toast('Relatório baixado.'); });
  }
  await openModal({
    title: 'Relatório · ' + c.name, wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<div class="report-filters">' +
        '<div class="field"><label for="crPeriod">Período</label><select id="crPeriod">' + optionsHtml(periods, st.period) + '</select></div>' +
        '<div class="field"><label for="crCat">Categoria</label><select id="crCat">' + optionsHtml(cats, st.cat) + '</select></div>' +
      '</div><div id="crBody" class="stack"></div>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-cr-pdf>Baixar em PDF</button></div>',
    onOpen: function(modal){
      render(modal);
      modal.addEventListener('change', function(){ st.period = qs('#crPeriod', modal).value; st.cat = qs('#crCat', modal).value; render(modal); });
      qs('[data-cr-pdf]', modal).addEventListener('click', pdf);
    }
  });
}

/* ---------- Cartões e faturas ---------- */

var INVOICE_PILL = {aberta:'good', fechada:'warning', vencida:'critical', paga:'good'};

function renderCards(){
  var wrap = document.getElementById('cardList');
  if (!State.cards.length){ wrap.innerHTML = '<p class="empty-state">Nenhum cartão cadastrado. Cadastre acima para acompanhar faturas e limite.</p>'; return; }
  wrap.innerHTML = State.cards.map(function(c){
    var baseKey = invoiceKeyFor(todayKey(), c);
    var key = shiftMonthKey(baseKey, State.invoiceOffsets[c.id] || 0);
    var items = invoiceItems(c, key);
    var total = sum(items, function(t){ return t.amount; });
    var dates = invoiceDates(key, c);
    var status = invoiceStatus(c, key);
    var used = cardUsed(c);
    var limit = Number(c.limit) || 0;
    var pct = limit > 0 ? Math.min(1, used/limit) : 0;
    return '<div class="credit-card">' +
      '<div class="credit-card-top">' +
        '<div><h4>' + escapeHtml(c.name) + '</h4><span class="sub">Fecha dia ' + c.closingDay + ' · vence dia ' + c.dueDay + '</span></div>' +
        '<div class="avail"><span class="sub">Limite disponível</span><strong class="tabular">' + fmtMoney(Math.max(0, limit - used)) + '</strong><span class="sub">de ' + fmtMoney(limit) + '</span></div>' +
      '</div>' +
      '<div class="credit-card-body">' +
        '<div class="progress" title="Limite usado"><span style="width:' + (pct*100) + '%; background:' + (pct >= 0.9 ? 'var(--critical)' : pct >= 0.7 ? 'var(--warning)' : 'var(--brand)') + '"></span></div>' +
        '<div class="invoice-head">' +
          '<div class="month-switch">' +
            '<button type="button" data-inv-shift="' + c.id + '" data-dir="-1" aria-label="Fatura anterior">' + icon('chevron-left') + '</button>' +
            '<strong>Fatura de ' + monthLabelOf(key) + '</strong>' +
            '<button type="button" data-inv-shift="' + c.id + '" data-dir="1" aria-label="Próxima fatura">' + icon('chevron-right') + '</button>' +
          '</div>' +
          '<span class="status-pill ' + INVOICE_PILL[status] + '">' + status + ((c.invoicePayments || {})[key] ? ' com ' + escapeHtml(accountName(c.invoicePayments[key].accountId)) : '') + '</span>' +
        '</div>' +
        '<div class="invoice-head"><span class="invoice-total tabular">' + fmtMoney(total) + '</span>' +
          '<span class="meta-line"><span>Fecha ' + formatDateFull(dates.closing) + '</span><span>Vence ' + formatDateFull(dates.due) + '</span></span></div>' +
        (items.length ? '<details class="budget-details"><summary>Ver ' + items.length + ' compra(s)</summary>' + items.map(txRowHtml).join('') + '</details>' : '<p class="tx-meta">Nenhuma compra nesta fatura.</p>') +
        (function(){
          var gs = installmentGroups().filter(function(g){ return g.cardId === c.id && g.future.length; });
          return gs.length ? '<details class="budget-details" open><summary>Compras parceladas (' + gs.length + ')</summary><div class="debt-grid" style="margin-top:8px">' + gs.map(function(g){ return installmentRowHtml(g, false); }).join('') + '</div></details>' : '';
        })() +
        '<div class="card-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-inv-pdf="' + c.id + '" data-key="' + key + '">Ver fatura em PDF</button>' +
          (total > 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-inv-paid="' + c.id + '" data-key="' + key + '">' + (status === 'paga' ? 'Desmarcar paga' : 'Marcar como paga') + '</button>' : '') +
          '<button class="btn btn-ghost btn-sm" type="button" data-card-report="' + c.id + '">Relatório</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-card-edit="' + c.id + '">Editar</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-card-del="' + c.id + '">Excluir</button>' +
        '</div>' +
      '</div></div>';
  }).join('');
}

function cardFormBody(c){
  c = c || {};
  return '<div class="field"><label for="ecName">Nome do cartão</label><input id="ecName" name="name" type="text" maxlength="40" value="' + escapeHtml(c.name||'') + '"></div>' +
    '<div class="field"><label for="ecLimit">Limite</label><span class="money-input"><span>R$</span><input id="ecLimit" name="limit" type="number" step="0.01" min="0" max="99999999" value="' + (c.limit||'') + '"></span></div>' +
    '<div class="field"><label for="ecClosing">Dia do fechamento</label><input id="ecClosing" name="closing" type="number" min="1" max="31" value="' + (c.closingDay||'') + '"></div>' +
    '<div class="field"><label for="ecDue">Dia do vencimento</label><input id="ecDue" name="due" type="number" min="1" max="31" value="' + (c.dueDay||'') + '"></div>';
}
function readCardFields(name, limit, closing, due){
  name = String(name).trim();
  limit = money(limit); closing = Number(closing); due = Number(due);
  if (!name) return {error:'Dê um nome para o cartão.'};
  if (!(limit >= 0)) return {error:'Informe o limite do cartão.'};
  if (!(closing >= 1 && closing <= 31) || !(due >= 1 && due <= 31) || closing % 1 || due % 1) return {error:'Os dias de fechamento e vencimento vão de 1 a 31.'};
  return {name:name, limit:limit, closingDay:closing, dueDay:due};
}

async function editCard(id){
  var c = findById(State.cards, id);
  await openModal({
    title: 'Editar cartão', body: cardFormBody(c),
    onSubmit: async function(form){
      var v = readCardFields(form.name.value, form.limit.value, form.closing.value, form.due.value);
      if (v.error) return v;
      await Store.update(k(), 'cards', id, v);
      Object.assign(c, v);
      renderCards(); populatePaymentSelect();
      toast('Cartão atualizado.');
    }
  });
}

/* ---------- Contas bancárias ---------- */

function moveRowHtml(m){
  var pos = m.amount >= 0;
  return '<div class="tx-row">' +
    '<span class="tx-cat-dot" style="background:' + (pos ? 'var(--good)' : 'var(--text-muted)') + '"></span>' +
    '<div class="tx-main"><div class="tx-desc">' + escapeHtml(m.label) + '</div><div class="tx-meta">' + m.kind + ' · ' + formatDateBr(m.date) + '</div></div>' +
    '<span class="tx-amount tabular ' + (pos ? 'income' : 'expense') + '">' + (pos ? '+ ' : '- ') + fmtMoney(Math.abs(m.amount)) + '</span>' +
    (m.transferId ? '<button class="tx-del" type="button" data-transfer-del="' + escapeHtml(m.transferId) + '" aria-label="Excluir transferência" title="Excluir transferência">' + icon('trash') + '</button>' : '') +
    '</div>';
}

function renderAccounts(){
  document.getElementById('transferBtn').hidden = State.accounts.length < 2;
  var wrap = document.getElementById('accountList');
  if (!State.accounts.length){ wrap.innerHTML = '<p class="empty-state">Nenhuma conta cadastrada. Adicione acima para acompanhar o saldo de cada banco.</p>'; return; }
  var cur = monthBounds(0).key;
  wrap.innerHTML = State.accounts.map(function(a){
    var bal = accountBalance(a);
    var moves = accountMoves(a);
    var month = moves.filter(function(m){ return monthKeyOf(m.date) === cur; });
    return '<div class="goal-card account-card">' +
      '<div class="budget-top"><h4>' + icon('bank') + ' ' + escapeHtml(a.name) + '</h4></div>' +
      '<div class="goal-figs"><span>Saldo hoje</span><strong class="tabular account-balance ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
      '<div class="meta-line"><span>Entrou no mês: ' + fmtMoney(sum(month.filter(function(m){ return m.amount > 0; }), function(m){ return m.amount; })) + '</span>' +
        '<span>Saiu no mês: ' + fmtMoney(-sum(month.filter(function(m){ return m.amount < 0; }), function(m){ return m.amount; })) + '</span></div>' +
      (moves.length ? '<details class="budget-details"><summary>Ver movimentações (' + moves.length + ')</summary>' + moves.slice(0, 40).map(moveRowHtml).join('') + '</details>' : '<p class="tx-meta">Nenhuma movimentação desde o cadastro.</p>') +
      '<div class="card-actions">' +
        (State.accounts.length > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-acc-transfer="' + a.id + '">' + icon('swap') + 'Transferir</button>' : '') +
        '<button class="btn btn-ghost btn-sm" type="button" data-acc-edit="' + a.id + '">Editar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-acc-del="' + a.id + '">Excluir</button>' +
      '</div></div>';
  }).join('');
}

async function editAccount(id){
  var a = findById(State.accounts, id);
  var current = accountBalance(a);
  await openModal({
    title: 'Editar conta',
    body: '<div class="field"><label for="eaName">Nome da conta</label><input id="eaName" name="name" type="text" maxlength="40" value="' + escapeHtml(a.name) + '"></div>' +
      '<div class="field"><label for="eaBalance">Saldo hoje</label><span class="money-input"><span>R$</span><input id="eaBalance" name="balance" type="number" step="0.01" min="-99999999" max="99999999" value="' + current + '"></span>' +
      '<span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do banco. O app passa a contar a partir de agora.</span></div>',
    onSubmit: async function(form){
      var name = form.name.value.trim();
      if (!name) return {error:'Dê um nome para a conta.'};
      var patch = {name: name};
      var bal = money(form.balance.value);
      if (form.balance.value !== '' && bal !== current){ patch.initialBalance = bal; patch.baseDate = todayKey(); patch.baseAt = Date.now(); }
      await Store.update(k(), 'accounts', id, patch);
      Object.assign(a, patch);
      renderAll();
      toast('Conta atualizada.');
    }
  });
}

async function openTransfer(fromId){
  var opts = State.accounts.map(function(a){ return {id: a.id, label: a.name + ' (' + fmtMoney(accountBalance(a)) + ')'}; });
  var from = fromId || State.accounts[0].id;
  var to = State.accounts.filter(function(a){ return a.id !== from; })[0].id;
  var r = await openModal({
    title: 'Transferir entre contas',
    body: '<div class="field"><label for="trFrom">De</label><select id="trFrom" name="from">' + optionsHtml(opts, from) + '</select></div>' +
      '<div class="field"><label for="trTo">Para</label><select id="trTo" name="to">' + optionsHtml(opts, to) + '</select></div>' +
      '<div class="field"><label for="trAmount">Valor</label><span class="money-input"><span>R$</span><input id="trAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal"></span></div>' +
      '<div class="field"><label for="trDate">Data</label><input id="trDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + todayKey() + '"></div>' +
      '<div class="field"><label for="trDesc">Descrição (opcional)</label><input id="trDesc" name="desc" type="text" maxlength="60" placeholder="Ex: guardar na poupança"></div>' +
      '<p class="field-hint">Transferências mudam o saldo das duas contas, mas não contam como ganho nem como gasto.</p>',
    submitLabel: 'Transferir',
    onSubmit: async function(form){
      var amount = money(form.amount.value);
      if (!(amount > 0)) return {error:'Informe um valor maior que zero.'};
      if (form.from.value === form.to.value) return {error:'Escolha contas diferentes em “De” e “Para”.'};
      var date = form.date.value || todayKey();
      if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
      var saved = await Store.add(k(), 'transfers', {fromId: form.from.value, toId: form.to.value, amount: amount, date: date, description: form.desc.value.trim(), createdAt: Date.now()});
      State.transfers.push(saved);
      return saved;
    }
  });
  if (r && r.id){
    renderAccounts(); renderStatTiles();
    toast('Transferência de ' + fmtMoney(r.amount) + ' de ' + accountName(r.fromId) + ' para ' + accountName(r.toId) + ' registrada.');
  }
}

// Marcar fatura como paga: com contas cadastradas, pergunta de qual conta saiu o dinheiro.
// O pagamento da fatura só desconta da conta; as compras já contaram como gasto quando foram feitas.
async function toggleInvoicePaid(cardId, key){
  var card = findById(State.cards, cardId);
  var paid = (card.paidInvoices || []).slice();
  var pays = Object.assign({}, card.invoicePayments || {});
  var idx = paid.indexOf(key);
  if (idx >= 0){ paid.splice(idx, 1); delete pays[key]; }
  else {
    var total = money(sum(invoiceItems(card, key), function(t){ return t.amount; }));
    if (State.accounts.length){
      var opts = State.accounts.map(function(a){ return {id: a.id, label: a.name + ' (saldo ' + fmtMoney(accountBalance(a)) + ')'}; }).concat([{id:'', label:'Não descontar de nenhuma conta'}]);
      var choice = await openModal({
        title: 'Pagar fatura',
        body: '<p>Fatura de ' + monthLabelOf(key) + ' do ' + escapeHtml(card.name) + ': <strong class="tabular">' + fmtMoney(total) + '</strong>.</p>' +
          '<div class="field"><label for="ipAcc">Paguei com a conta</label><select id="ipAcc" name="acc">' + optionsHtml(opts, State.accounts[0].id) + '</select></div>' +
          '<div class="field"><label for="ipDate">Data do pagamento</label><input id="ipDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + todayKey() + '"></div>' +
          '<p class="field-hint">Pode ser a conta de outro banco: o valor sai do saldo da conta escolhida.</p>',
        submitLabel: 'Marcar como paga',
        onSubmit: function(form){
          var date = form.date.value || todayKey();
          if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
          return {accountId: form.acc.value, date: date};
        }
      });
      if (!choice) return;
      if (choice.accountId) pays[key] = {accountId: choice.accountId, amount: total, date: choice.date, createdAt: Date.now()};
    }
    paid.push(key);
  }
  await Store.update(k(), 'cards', card.id, {paidInvoices: paid, invoicePayments: pays});
  card.paidInvoices = paid; card.invoicePayments = pays;
  renderCards(); renderAccounts(); renderStatTiles();
  toast(idx >= 0 ? 'Fatura marcada como em aberto.' : 'Fatura marcada como paga' + (pays[key] ? ' com a conta ' + accountName(pays[key].accountId) : '') + '.');
}

/* ---------- Vale-alimentação / refeição ---------- */

function renderVouchers(){
  var wrap = document.getElementById('voucherList');
  if (!State.vouchers.length){ wrap.innerHTML = ''; return; }
  var cur = monthBounds(0).key;
  wrap.innerHTML = State.vouchers.map(function(v){
    var monthTx = voucherTx(v).filter(function(t){ return monthKeyOf(t.date) === cur; });
    var spent = sum(monthTx, function(t){ return t.amount; });
    var bal = voucherBalance(v);
    var pct = Number(v.amount) > 0 ? Math.min(1, spent / Number(v.amount)) : 0;
    return '<div class="goal-card">' +
      '<div class="budget-top"><h4>' + escapeHtml(v.name) + '</h4><span class="pill">' + (v.carryOver ? 'saldo acumula' : 'saldo zera todo mês') + '</span></div>' +
      '<div class="goal-figs"><span>Saldo disponível</span><strong class="tabular ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
      '<div class="progress" title="Gasto do crédito deste mês"><span style="width:' + (pct*100) + '%; background:' + (pct >= 1 ? 'var(--critical)' : pct >= 0.8 ? 'var(--warning)' : 'var(--brand)') + '"></span></div>' +
      '<div class="meta-line"><span>Cai por mês: ' + fmtMoney(v.amount) + '</span><span>Gasto em ' + monthLabelOf(cur) + ': ' + fmtMoney(spent) + '</span></div>' +
      (monthTx.length ? '<details class="budget-details"><summary>Ver ' + monthTx.length + ' gasto(s) deste mês</summary>' + monthTx.map(txRowHtml).join('') + '</details>' : '') +
      '<div class="card-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-voucher-edit="' + v.id + '">Editar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-voucher-del="' + v.id + '">Excluir</button>' +
      '</div></div>';
  }).join('');
}

async function editVoucher(id){
  var v = findById(State.vouchers, id);
  await openModal({
    title: 'Editar vale',
    body: '<div class="field"><label for="evName">Nome</label><input id="evName" name="name" type="text" maxlength="30" value="' + escapeHtml(v.name) + '"></div>' +
      '<div class="field"><label for="evAmount">Valor que cai por mês</label><span class="money-input"><span>R$</span><input id="evAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" value="' + v.amount + '"></span></div>' +
      '<div class="field"><label for="evBalance">Saldo atual</label><span class="money-input"><span>R$</span><input id="evBalance" name="balance" type="number" step="0.01" min="0" max="99999999" value="' + voucherBalance(v) + '"></span><span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do cartão.</span></div>' +
      '<label class="check"><input type="checkbox" name="carry"' + (v.carryOver ? ' checked' : '') + '> Saldo acumula de um mês para o outro</label>',
    onSubmit: async function(form){
      var name = form.name.value.trim(), amount = money(form.amount.value);
      if (!name || !(amount > 0)) return {error:'Informe o nome e o valor mensal do vale.'};
      var patch = {name:name, amount:amount, carryOver: form.carry.checked};
      var bal = money(form.balance.value);
      if (form.carry.checked && bal !== voucherBalance(v)){ patch.initialBalance = bal; patch.startDate = todayKey(); patch.adjustedAt = Date.now(); }
      // Ao reajustar o saldo, gastos de hoje já lançados não podem descontar de novo.
      if (patch.startDate){
        patch.initialBalance = money(bal + sum(voucherTx(v).filter(function(t){ return t.date >= patch.startDate; }), function(t){ return t.amount; }));
      }
      await Store.update(k(), 'vouchers', id, patch);
      Object.assign(v, patch);
      renderVouchers(); populatePaymentSelect();
      toast('Vale atualizado.');
    }
  });
}

/* ---------- PDF ---------- */



function generateInvoicePdf(cardId, key){
  if (!pdfReady()) return;
  var c = findById(State.cards, cardId);
  var items = invoiceItems(c, key);
  var dates = invoiceDates(key, c);
  var w = pdfWriter('Fatura ' + c.name + ' · ' + monthLabelOf(key), (State.session ? State.session.name : '') + '  ·  Fecha ' + formatDateFull(dates.closing) + '  ·  Vence ' + formatDateFull(dates.due));
  w.section('Resumo');
  w.row(['Total da fatura', fmtMoney(sum(items, function(t){ return t.amount; }))], [200, 200], {bold:true});
  w.row(['Situação', invoiceStatus(c, key)], [200, 200]);
  w.row(['Limite do cartão', fmtMoney(c.limit)], [200, 200]);
  w.space(12);
  w.section('Compras');
  if (!items.length){ w.text('Nenhuma compra nesta fatura.'); }
  else {
    var widths = [70, 190, 130, 100];
    w.header(['Data', 'Descrição', 'Categoria', 'Valor'], widths);
    items.forEach(function(t){ w.row([formatDateFull(t.date), t.description || '-', catLabel(t.category, 'expense', t.categoryLabel), fmtMoney(t.amount)], widths); });
  }
  w.footer();
  showPdf(w.doc, 'grana-leve-fatura-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + key + '.pdf', 'Fatura ' + c.name + ' · ' + monthLabelOf(key));
}

function pct1(n){ return (Math.round(n*10)/10).toString().replace('.',','); }

function generateMonthlyReport(){
  if (!pdfReady()) return;
  var cur = monthBounds(0), prev = monthBounds(-1);
  var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
  var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);
  var cats = expenseCats().map(function(c){ return {label:c.label, cur:curCats[c.id]||0, prev:prevCats[c.id]||0}; })
    .filter(function(c){ return c.cur>0 || c.prev>0; }).sort(function(a,b){ return b.cur-a.cur; });
  function deltaText(a, b){ var d = pctDelta(a, b); if (d === null) return (a>0 && !b) ? 'novo' : '-'; return (d>=0?'+':'') + pct1(d) + '%'; }

  var title = cur.label.charAt(0).toUpperCase() + cur.label.slice(1);
  var w = pdfWriter('Grana Leve · Relatório mensal', title + '  ·  ' + (State.session ? State.session.name : ''));
  var W4 = [140,130,130,80];
  w.section('Resumo do mês');
  w.header(['', 'Este mês', 'Mês anterior', 'Variação'], W4);
  w.row(['Ganhos', fmtMoney(curT.income), fmtMoney(prevT.income), deltaText(curT.income, prevT.income)], W4);
  w.row(['Gastos', fmtMoney(curT.expense), fmtMoney(prevT.expense), deltaText(curT.expense, prevT.expense)], W4);
  w.row(['Saldo', fmtMoney(curT.saldo), fmtMoney(prevT.saldo), deltaText(curT.saldo, prevT.saldo)], W4, {bold:true});
  w.space(12);

  w.section('Gastos por categoria');
  if (!cats.length) w.text('Nenhum gasto registrado neste mês.');
  else { w.header(['Categoria', 'Este mês', 'Mês anterior', 'Variação'], [160,120,120,80]); cats.forEach(function(c){ w.row([c.label, fmtMoney(c.cur), fmtMoney(c.prev), deltaText(c.cur, c.prev)], [160,120,120,80]); }); }
  w.space(12);

  var goals = State.goals.filter(function(g){ return !g.deletedAt; });
  w.section('Metas de economia');
  if (!goals.length) w.text('Nenhuma meta cadastrada.');
  else { w.header(['Meta', 'Guardado', 'Objetivo', 'Progresso'], [180,110,110,80]); goals.forEach(function(g){ var p = g.targetAmount>0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0; w.row([g.name, fmtMoney(g.currentAmount||0), fmtMoney(g.targetAmount), Math.round(p*100)+'%'], [180,110,110,80]); }); }
  w.space(12);

  w.section('Dívidas');
  if (!State.debts.length) w.text('Nenhuma dívida cadastrada.');
  else { w.header(['Dívida', 'Pago', 'Falta', 'Total'], [180,110,110,80]); State.debts.forEach(function(d){ w.row([d.name, fmtMoney(d.paidAmount||0), fmtMoney(Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0))), fmtMoney(d.totalAmount)], [180,110,110,80]); }); }
  var openGroups = installmentGroups().filter(function(g){ return g.future.length; });
  if (openGroups.length){
    w.space(8); w.section('Compras parceladas no cartão');
    w.header(['Compra', 'Parcela', 'Falta', 'Total'], [180,110,110,80]);
    openGroups.forEach(function(g){ w.row([g.name, (g.paid.length + g.advanced) + ' de ' + g.total, fmtMoney(g.remaining), fmtMoney(g.totalAmount)], [180,110,110,80]); });
  }
  w.space(12);

  w.section('A receber');
  var recv = State.receivables.filter(function(r){ return Number(r.receivedAmount||0) < Number(r.totalAmount||0); });
  if (!recv.length) w.text('Nada pendente para receber.');
  else { w.header(['Pessoa', 'Tipo', 'Falta receber', 'Combinado'], [160,140,100,80]); recv.forEach(function(r){ w.row([r.person, labelOf(RECV_KINDS, r.kind), fmtMoney(Number(r.totalAmount)-Number(r.receivedAmount||0)), r.dueDate ? formatDateFull(r.dueDate) : '-'], [160,140,100,80]); }); }

  w.footer();
  showPdf(w.doc, 'grana-leve-relatorio-' + cur.key + '.pdf', 'Relatório de ' + cur.label);
}

/* ---------- Planejar gastos (aba "limites") ---------- */
var statusLabel = {good:'sob controle', warning:'quase no limite', critical:'estourou'};


function renderBudgets(){
  var mb = monthBounds(State.budgetMonthOffset);
  var locked = budgetLocked(mb.key);
  document.getElementById('budgetMonthLabel').textContent = mb.label;
  document.getElementById('budgetNext').disabled = State.budgetMonthOffset >= 1;
  document.getElementById('budgetNote').innerHTML = locked ?
    icon('lock') + ' Mês encerrado: o planejamento fica como estava e não pode ser alterado.' :
    (State.budgetMonthOffset > 0 ? 'Planejando o próximo mês. Ele começa com os valores do mês atual.' : 'Os valores valem a partir deste mês. Os meses anteriores continuam como estavam.');
  document.getElementById('budgetNote').classList.toggle('locked', locked);
  document.getElementById('budgetNewCat').hidden = locked;
  var monthTx = txForMonth(mb.key).filter(function(t){ return t.type==='expense'; });
  var list = document.getElementById('budgetList');
  list.innerHTML = expenseCats().map(function(c){
    var catTx = monthTx.filter(function(t){ return t.category === c.id; });
    var limit = budgetLimit(mb.key, c.id);
    var spent = sum(catTx, function(t){ return t.amount; });
    var pct = limit > 0 ? spent/limit : 0;
    var status = limit > 0 ? statusForPct(pct) : 'good';
    var barColor = status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)';
    return '<div class="budget-row">' +
      '<div class="budget-top">' +
        '<span class="budget-cat"><span class="legend-swatch" style="background:'+resolveVar(c.color, list)+'"></span>'+escapeHtml(c.label)+'</span>' +
        '<span class="money-input sm"><span>R$</span><input class="tabular" type="number" min="0" step="10" max="99999999" data-budget-cat="'+escapeHtml(c.id)+'" value="'+(limit||'')+'" placeholder="'+(locked ? '—' : 'Sem limite')+'"'+(locked ? ' disabled' : '')+' aria-label="Quanto quero gastar com '+escapeHtml(c.label)+'"></span>' +
      '</div>' +
      (limit > 0 ?
        '<div class="progress"><span style="width:'+Math.min(100,pct*100)+'%; background:'+barColor+'"></span></div>' +
        '<div class="budget-top"><span class="budget-figs tabular">'+fmtMoney(spent)+' de '+fmtMoney(limit)+(limit > spent ? ' · restam ' + fmtMoney(limit-spent) : '')+'</span><span class="status-pill '+status+'">'+statusLabel[status]+'</span></div>'
        : (spent > 0 ? '<span class="budget-figs tabular">Gasto no mês: '+fmtMoney(spent)+(locked ? '' : ' (digite ao lado quanto quer gastar)')+'</span>' : '')
      ) +
      (catTx.length ? '<details class="budget-details"><summary>Ver com o que gastou (' + catTx.length + ')</summary>' + catTx.map(txRowHtml).join('') + '</details>' : '') +
      '</div>';
  }).join('');

  qsa('[data-budget-cat]', list).forEach(function(input){
    input.addEventListener('change', async function(){
      var cat = input.getAttribute('data-budget-cat');
      var key = monthBounds(State.budgetMonthOffset).key;
      if (budgetLocked(key)) return;
      await setBudget(key, cat, Math.max(0, money(input.value || 0)));
      renderBudgets();
      toast('Planejamento de ' + catLabel(cat,'expense') + ' em ' + monthLabelOf(key) + ' atualizado.');
    });
  });
}

/* ---------- Metas ---------- */
var GOAL_FILTERS = [
  {id:'andamento', label:'Em andamento'},
  {id:'concluidas', label:'Concluídas'},
  {id:'naobatidas', label:'Não batidas'},
  {id:'excluidas', label:'Excluídas'}
];
function goalStatus(g){
  if (g.deletedAt) return 'excluidas';
  if (Number(g.currentAmount||0) >= Number(g.targetAmount||0)) return 'concluidas';
  if (g.targetDate && g.targetDate < todayKey()) return 'naobatidas';
  return 'andamento';
}

function calendarUrl(title, dateIso, details){
  var d = dateIso.replace(/-/g,'');
  var next = toDateKey(new Date(parseDate(dateIso).getTime() + 86400000)).replace(/-/g,'');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
    '&dates=' + d + '/' + next + '&details=' + encodeURIComponent(details);
}

function renderGoals(){
  var counts = {};
  GOAL_FILTERS.forEach(function(f){ counts[f.id] = 0; });
  State.goals.forEach(function(g){ counts[goalStatus(g)]++; });
  document.getElementById('goalFilter').innerHTML = GOAL_FILTERS.map(function(f){
    return '<button type="button" role="tab" aria-selected="' + (State.goalFilter === f.id) + '" class="' + (State.goalFilter === f.id ? 'active' : '') + '" data-goal-filter="' + f.id + '">' + f.label + '<span class="count">' + counts[f.id] + '</span></button>';
  }).join('');

  var grid = document.getElementById('goalGrid');
  var goals = State.goals.filter(function(g){ return goalStatus(g) === State.goalFilter; });
  if (!goals.length){
    var empty = {andamento:'Nenhuma meta em andamento. Que tal criar a primeira acima?', concluidas:'Nenhuma meta concluída ainda. Você chega lá!', naobatidas:'Nenhuma meta com prazo vencido.', excluidas:'Nenhuma meta excluída.'};
    grid.innerHTML = '<p class="empty-state">' + empty[State.goalFilter] + '</p>';
    return;
  }
  grid.innerHTML = goals.map(function(g){
    var status = goalStatus(g);
    var pct = g.targetAmount > 0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0;
    var remindDate = g.reminderDate || g.targetDate;
    var actions;
    if (status === 'excluidas'){
      actions = '<button class="btn btn-ghost btn-sm" type="button" data-goal-restore="'+g.id+'">Restaurar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-goal-purge="'+g.id+'">Apagar de vez</button>';
    } else {
      actions = (status === 'concluidas' ? '<span class="status-pill good">Meta concluída</span>' :
          '<form class="deposit-form" data-goal-deposit="'+g.id+'"><span class="money-input sm"><span>R$</span><input type="number" step="0.01" min="0.01" max="99999999" name="amount" placeholder="Valor" aria-label="Valor para guardar"></span><button class="btn btn-primary btn-sm" type="submit">Guardar</button></form>') +
        '<button class="btn btn-ghost btn-sm" type="button" data-goal-edit="'+g.id+'">Editar</button>' +
        (remindDate ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(calendarUrl('Grana Leve: meta “' + g.name + '”', remindDate, 'Lembrete para guardar dinheiro na meta “' + g.name + '”. Faltam ' + fmtMoney(Math.max(0, g.targetAmount - (g.currentAmount||0))) + '.')) + '">' + icon('calendar') + 'Google Agenda</a>' : '') +
        '<button class="btn btn-ghost btn-sm" type="button" disabled title="Em breve: lembretes pelo WhatsApp">' + icon('chat') + 'WhatsApp (em breve)</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-goal-del="'+g.id+'">Excluir</button>';
    }
    return '<div class="goal-card">' +
      '<div class="budget-top"><h4>'+escapeHtml(g.name)+'</h4>' + (status === 'naobatidas' ? '<span class="status-pill critical">prazo vencido</span>' : '') + '</div>' +
      '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--brand)"></span></div>' +
      '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' de '+fmtMoney(g.targetAmount)+'</span><span>'+Math.round(pct*100)+'%</span></div>' +
      '<div class="meta-line">' +
        (g.targetDate ? '<span>Prazo: '+formatDateFull(g.targetDate)+'</span>' : '<span>Sem prazo</span>') +
        (g.reminderDate ? '<span>Me avise em: '+formatDateFull(g.reminderDate)+'</span>' : '') +
      '</div>' +
      (g.note ? '<div class="note">'+escapeHtml(g.note)+'</div>' : '') +
      '<div class="card-actions">' + actions + '</div></div>';
  }).join('');
}

function goalFormBody(g){
  return '<div class="field"><label for="egName">Nome da meta</label><input id="egName" name="name" type="text" maxlength="50" value="' + escapeHtml(g.name) + '"></div>' +
    '<div class="field"><label for="egTarget">Valor alvo</label><span class="money-input"><span>R$</span><input id="egTarget" name="target" type="number" step="0.01" min="1" max="99999999" value="' + g.targetAmount + '"></span></div>' +
    '<div class="field"><label for="egCurrent">Já guardado</label><span class="money-input"><span>R$</span><input id="egCurrent" name="current" type="number" step="0.01" min="0" max="99999999" value="' + (g.currentAmount||0) + '"></span></div>' +
    '<div class="field"><label for="egDate">Prazo</label><input id="egDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.targetDate||'') + '"></div>' +
    '<div class="field"><label for="egReminder">Me avise em</label><input id="egReminder" name="reminder" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.reminderDate||'') + '"></div>' +
    '<div class="field"><label for="egNote">Observação</label><textarea id="egNote" name="note" rows="3" maxlength="300">' + escapeHtml(g.note||'') + '</textarea></div>';
}

async function editGoal(id){
  var g = findById(State.goals, id);
  await openModal({
    title: 'Editar meta', body: goalFormBody(g),
    onSubmit: async function(form){
      var v = {
        name: form.name.value.trim(), targetAmount: money(form.target.value), currentAmount: Math.max(0, money(form.current.value)),
        targetDate: form.date.value || null, reminderDate: form.reminder.value || null, note: form.note.value.trim()
      };
      if (!v.name || !(v.targetAmount > 0)) return {error:'Informe o nome e um valor alvo maior que zero.'};
      if (!validDateStr(v.targetDate) || !validDateStr(v.reminderDate)) return {error:'Use datas entre os anos de 1900 e 3000.'};
      await Store.update(k(), 'goals', id, v);
      Object.assign(g, v);
      renderGoals(); renderDashboard();
      toast('Meta atualizada.');
    }
  });
}

/* ---------- Dívidas ---------- */
function renderDebts(){
  var gs = installmentGroups().filter(function(g){ return g.future.length; });
  document.getElementById('installDebtWrap').innerHTML = gs.length ?
    '<div class="card"><div class="card-head"><h3>Compras parceladas no cartão</h3><span class="pill brand">automático</span></div>' +
    '<p class="card-sub">Vêm das compras parceladas em “Ganhos e gastos”. Cada parcela entra sozinha na fatura do mês, então não precisa registrar pagamento. Se quiser quitar antes, use “Adiantar pagamento”.</p>' +
    '<div class="debt-grid">' + gs.map(function(g){ return installmentRowHtml(g, true); }).join('') + '</div></div>' : '';
  var grid = document.getElementById('debtGrid');
  if (!State.debts.length){ grid.innerHTML = gs.length ? '' : '<p class="empty-state">Nenhuma dívida cadastrada. Se você não tem dívidas, ótimo: pode pular esta seção.</p>'; return; }
  grid.innerHTML = State.debts.map(function(d){
    var remaining = Math.max(0, Number(d.totalAmount||0) - Number(d.paidAmount||0));
    var pct = d.totalAmount > 0 ? Math.min(1, Number(d.paidAmount||0)/Number(d.totalAmount)) : 0;
    var done = remaining <= 0;
    return '<div class="debt-card">' +
      '<div class="budget-top"><h4>'+escapeHtml(d.name)+'</h4><span class="pill">' + escapeHtml(labelOf(DEBT_KINDS, d.kind) || 'Dívida') + '</span></div>' +
      (d.creditor ? '<span class="tx-meta">Com: ' + escapeHtml(d.creditor) + '</span>' : '') +
      '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
      '<div class="debt-figs"><span class="tabular">Pago: '+fmtMoney(d.paidAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
      (d.monthlyPayment ? '<span class="tx-meta">Parcela mensal: '+fmtMoney(d.monthlyPayment)+(remaining > 0 ? ' · cerca de ' + Math.ceil(remaining / d.monthlyPayment) + ' parcela(s) restante(s)' : '')+'</span>' : '') +
      '<div class="card-actions">' +
        (done ? '<span class="status-pill good">Quitada</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-debt-pay="'+d.id+'">Registrar pagamento</button>') +
        '<button class="btn btn-danger btn-sm" type="button" data-debt-del="'+d.id+'">Excluir</button>' +
      '</div></div>';
  }).join('');
}

async function payDebt(id){
  var d = findById(State.debts, id);
  var remaining = Math.max(0, Number(d.totalAmount) - Number(d.paidAmount||0));
  var r = await askAmount({
    title: 'Registrar pagamento', message: '“' + d.name + '”: faltam ' + fmtMoney(remaining) + '.',
    value: Number(d.monthlyPayment) > 0 ? Math.min(d.monthlyPayment, remaining) : remaining, max: remaining,
    checkbox: 'Lançar também como gasto do mês', checkboxDefault: true, submitLabel: 'Registrar', extraHtml: accountSelectHtml('askAcc', 'acc', 'Saiu de')
  });
  if (!r) return;
  var newPaid = money(Math.min(Number(d.totalAmount), Number(d.paidAmount||0) + r.amount));
  await Store.update(k(), 'debts', id, {paidAmount: newPaid});
  d.paidAmount = newPaid;
  if (r.extra){
    var saved = await Store.add(k(), 'transactions', {type:'expense', amount:r.amount, category:'dividas', date: todayKey(), description:'Pagamento: ' + d.name, paymentMethod:'conta', accountId: r.accountId, createdAt: Date.now()});
    State.transactions.unshift(saved); sortTransactions();
  }
  renderAll();
  toast('Pagamento de ' + fmtMoney(r.amount) + ' registrado em “' + d.name + '”.');
}

/* ---------- A receber ---------- */

// Mostra no formulário só o que vale para o que foi escolhido (parcelas, cartão).
function syncRecvForm(){
  var n = clampInstall(document.getElementById('recvInstall').value);
  var perMode = n > 1 && qs('input[name=recvMode][value=parcela]').checked;
  var typed = money(document.getElementById('recvTotal').value);
  document.getElementById('recvModeField').hidden = n <= 1;
  document.getElementById('recvTotalLabel').textContent = n <= 1 ? 'Valor' : (perMode ? 'Valor de cada parcela' : 'Valor total');
  document.getElementById('recvDueLabel').textContent = n <= 1 ? 'Combinado para' : '1ª parcela em';
  document.getElementById('recvInstallHint').textContent = installHint(n, perMode ? money(typed * n) : typed);
  var onCard = document.getElementById('recvKind').value === 'cartao';
  document.getElementById('recvCardField').hidden = !onCard || !State.cards.length;
  document.getElementById('recvLaunchField').hidden = !onCard || !State.cards.length;
}
function populateRecvCards(){
  var sel = document.getElementById('recvCard');
  var prev = sel.value;
  sel.innerHTML = optionsHtml(State.cards.map(function(c){ return {id: c.id, label: c.name}; }), prev);
  syncRecvForm();
}

function renderReceivables(){
  populateRecvCards();
  var grid = document.getElementById('recvGrid');
  if (!State.receivables.length){ grid.innerHTML = '<p class="empty-state">Ninguém te deve nada por aqui. Quando emprestar dinheiro ou alguém usar seu cartão, anote acima.</p>'; return; }
  var items = State.receivables.slice().sort(function(a,b){
    var ad = Number(a.receivedAmount||0) >= Number(a.totalAmount), bd = Number(b.receivedAmount||0) >= Number(b.totalAmount);
    return (ad - bd) || String(recvNextDue(a)||'9999').localeCompare(String(recvNextDue(b)||'9999'));
  });
  grid.innerHTML = items.map(function(r){
    var remaining = Math.max(0, Number(r.totalAmount||0) - Number(r.receivedAmount||0));
    var pct = r.totalAmount > 0 ? Math.min(1, Number(r.receivedAmount||0)/Number(r.totalAmount)) : 0;
    var done = remaining <= 0;
    var info = recvInstallInfo(r);
    var due = recvNextDue(r);
    var late = !done && due && due < todayKey();
    var lateHtml = late ? ' · <strong style="color:var(--critical)">atrasado</strong>' : '';
    return '<div class="debt-card">' +
      '<div class="budget-top"><h4>'+escapeHtml(r.person)+'</h4><span class="pill brand">' + escapeHtml(labelOf(RECV_KINDS, r.kind)) + (info ? ' · ' + info.n + 'x' : '') + '</span></div>' +
      (r.description ? '<span class="tx-meta">' + escapeHtml(r.description) + '</span>' : '') +
      '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
      '<div class="debt-figs"><span class="tabular">Recebido: '+fmtMoney(r.receivedAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
      (info ? '<span class="tx-meta">' + (done ? info.n + ' parcelas de ' + fmtMoney(info.per) + ', todas recebidas' :
          'Parcela ' + info.next + ' de ' + info.n + ' · ' + fmtMoney(info.per) + (due ? ' · vence ' + formatDateFull(due) : '') + lateHtml) + '</span>' :
        (r.dueDate ? '<span class="tx-meta">Combinado para ' + formatDateFull(r.dueDate) + lateHtml + '</span>' : '')) +
      '<div class="card-actions">' +
        (done ? '<span class="status-pill good">Recebido</span>' :
          '<button class="btn btn-ghost btn-sm" type="button" data-recv-get="'+r.id+'">Registrar recebimento</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-recv-charge="'+r.id+'">' + icon('chat') + 'Cobrar</button>') +
        '<button class="btn btn-danger btn-sm" type="button" data-recv-del="'+r.id+'">Excluir</button>' +
      '</div></div>';
  }).join('');
}

async function receiveReceivable(id){
  var r = findById(State.receivables, id);
  var remaining = Math.max(0, Number(r.totalAmount) - Number(r.receivedAmount||0));
  var info = recvInstallInfo(r);
  var a;
  if (info){
    // Parcelado: registra o valor da parcela com um toque, ou outro valor (pagou a mais, a menos ou várias de uma vez).
    var suggested = money(Math.min(info.next === info.n ? remaining : info.per, remaining));
    a = await openModal({
      title: 'Registrar recebimento',
      body: '<p>' + escapeHtml(r.person) + ' te deve ' + fmtMoney(remaining) + '. Próxima: parcela ' + info.next + ' de ' + info.n + '.</p>' +
        '<fieldset class="radio-group"><legend>Quanto entrou?</legend>' +
          '<label class="check"><input type="radio" name="mode" value="parcela" checked> Valor da parcela (' + fmtMoney(suggested) + ')</label>' +
          '<label class="check"><input type="radio" name="mode" value="outro"> Outro valor</label>' +
        '</fieldset>' +
        '<div class="field" id="rcvOtherField" hidden><label for="rcvOther">Valor recebido</label><span class="money-input"><span>R$</span><input id="rcvOther" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal"></span></div>' +
        '<label class="check"><input type="checkbox" name="extra"' + (r.kind !== 'cartao' ? ' checked' : '') + '> Lançar também como ganho do mês</label>' +
        accountSelectHtml('rcvAcc', 'acc', 'Entrou em'),
      submitLabel: 'Registrar',
      onOpen: function(modal){
        modal.addEventListener('change', function(e){
          if (e.target.name !== 'mode') return;
          var other = e.target.value === 'outro';
          qs('#rcvOtherField', modal).hidden = !other;
          if (other) qs('#rcvOther', modal).focus();
        });
      },
      onSubmit: function(form){
        var v = form.mode.value === 'outro' ? money(form.amount.value) : suggested;
        if (!(v > 0)) return {error:'Informe um valor maior que zero.'};
        if (v > remaining + 0.001) return {error:'O valor não pode passar de ' + fmtMoney(remaining) + '.'};
        return {amount: v, extra: form.extra.checked, accountId: form.acc ? (form.acc.value || null) : null};
      }
    });
    if (!a || !a.amount) return;
  } else {
    a = await askAmount({title:'Registrar recebimento', message: r.person + ' te deve ' + fmtMoney(remaining) + '.', value: remaining, max: remaining,
      checkbox:'Lançar também como ganho do mês', checkboxDefault: r.kind !== 'cartao', submitLabel:'Registrar', extraHtml: accountSelectHtml('askAcc', 'acc', 'Entrou em')});
    if (!a) return;
  }
  var newReceived = money(Math.min(Number(r.totalAmount), Number(r.receivedAmount||0) + a.amount));
  await Store.update(k(), 'receivables', id, {receivedAmount: newReceived});
  r.receivedAmount = newReceived;
  if (a.extra){
    var saved = await Store.add(k(), 'transactions', {type:'income', amount:a.amount, category:'recebimento', date: todayKey(), description:'Recebido de ' + r.person, paymentMethod:null, accountId: a.accountId, createdAt: Date.now()});
    State.transactions.unshift(saved); sortTransactions();
  }
  renderAll();
  toast('Recebimento de ' + fmtMoney(a.amount) + ' registrado.');
}

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

async function chargeReceivable(id){
  var r = findById(State.receivables, id);
  var remaining = Math.max(0, Number(r.totalAmount) - Number(r.receivedAmount||0));
  var first = State.session.name.split(' ')[0];
  var info = recvInstallInfo(r), due = recvNextDue(r);
  var what = info ? 'da parcela ' + info.next + ' de ' + info.n + ', de ' + fmtMoney(Math.min(info.per, remaining)) : 'do valor de ' + fmtMoney(remaining);
  var msg = 'Oi, ' + r.person.split(' ')[0] + '! Tudo bem? Passando para lembrar ' + what +
    (r.description ? ' (' + r.description + ')' : '') + (due ? ', combinad' + (info ? 'a' : 'o') + ' para ' + formatDateFull(due) : '') +
    '. Quando puder, me avisa. Obrigado! ' + first;
  await openModal({
    title: 'Cobrar ' + r.person,
    body: '<div class="field"><label for="chargeMsg">Mensagem (pode editar)</label><textarea id="chargeMsg" name="msg" rows="5" maxlength="600">' + escapeHtml(msg) + '</textarea></div>' +
      '<div class="field"><label for="chargePhone">WhatsApp da pessoa (opcional)</label><input id="chargePhone" name="phone" type="tel" maxlength="20" value="' + escapeHtml(r.phone||'') + '" placeholder="(11) 98888-7777"></div>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-charge="copy">Copiar mensagem</button></div>',
    submitLabel: 'Abrir no WhatsApp', cancelLabel: 'Fechar',
    onOpen: function(root){
      qs('[data-charge="copy"]', root).addEventListener('click', function(){
        var text = qs('#chargeMsg', root).value;
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('Mensagem copiada.'); }, function(){ toast('Não foi possível copiar.'); });
      });
    },
    onSubmit: async function(form){
      var phone = onlyDigits(form.phone.value);
      if (phone && phone.length >= 10 && phone.length <= 11) phone = '55' + phone;
      if (phone !== onlyDigits(r.phone) && form.phone.value.trim()){ await Store.update(k(), 'receivables', id, {phone: form.phone.value.trim()}); r.phone = form.phone.value.trim(); }
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(form.msg.value), '_blank', 'noopener');
      return true;
    }
  });
}

/* ---------- Aprenda ---------- */
function renderLearn(){
  function tipCards(list){
    return '<div class="tips-grid">' + list.map(function(t){
      return '<div class="tip-card"><span class="tip-tag">'+escapeHtml(t.tag)+'</span><h4>'+escapeHtml(t.title)+'</h4><p>'+escapeHtml(t.text)+'</p></div>';
    }).join('') + '</div>';
  }
  document.getElementById('learnWrap').innerHTML =
    '<section class="learn-section"><h3>Organizar o dinheiro</h3>' + tipCards(TIPS) + '</section>' +
    '<section class="learn-section"><h3>Fazer o dinheiro render</h3>' + tipCards(TIPS_GROW) +
      '<p class="disclaimer" style="margin-top:10px">Conteúdo educativo. Não é recomendação de investimento. Valores e taxas são exemplos e mudam com o tempo.</p></section>' +
    '<section class="learn-section card"><h3>Como usar o Grana Leve</h3><ol class="howto-list">' +
      HOW_TO.map(function(h){ return '<li><strong>' + escapeHtml(h[0]) + '</strong> ' + escapeHtml(h[1]) + '</li>'; }).join('') +
    '</ol></section>';
}

/* ---------- Lançamento por mensagem (chat) ---------- */
// O leitor de mensagens (domain/parser.js) é baseado em regras. Por isso nada é salvo direto:
// cada item vira um rascunho editável, com destaque no que foi suposto, e só grava ao confirmar.
// Grava lançamentos vindos de fora do formulário. Hoje: o chat. No futuro: WhatsApp e Open Finance
// (basta o servidor entregar itens no mesmo formato do parser de mensagens (domain/parser.js) e indicar a origem em `source`).
export async function importTransactions(items, source){
  var saved = [];
  for (var i=0;i<items.length;i++){
    var it = items[i];
    var tx = {type: it.type, amount: money(it.amount), category: it.category, categoryLabel: catLabel(it.category, it.type),
      date: it.date || todayKey(), description: it.description || '', paymentMethod: null, source: source, createdAt: Date.now() + i};
    if (validateNewTransaction(Object.assign({}, tx, {paymentMethod: it.type === 'expense' ? (it.paymentMethod || 'conta') : null}))) continue;
    if (it.type === 'expense'){
      tx.paymentMethod = it.paymentMethod || 'conta';
      if (tx.paymentMethod === 'cartao'){
        if (State.cards.length) tx.cardId = State.cards[0].id;
        else tx.paymentMethod = 'conta';
      }
      if (tx.paymentMethod === 'vale' && State.vouchers.length) tx.voucherId = State.vouchers[0].id;
    }
    var list = await saveTransactions(expandInstallments(tx, it.installments || 1));
    saved.push(list[0]);
  }
  renderAll();
  return saved;
}

function bubble(who, html){ return '<div class="bubble ' + who + '">' + html + '</div>'; }

function describeSaved(t){
  var cat = catLabel(t.category, t.type, t.categoryLabel);
  var pay = paymentLabel(t);
  var inst = t.installment;
  return '<strong>' + (t.type === 'income' ? 'Ganho' : 'Gasto') + ' de ' + fmtMoney(inst ? inst.totalAmount : t.amount) + (inst ? ' em ' + inst.total + 'x' : '') + '</strong> em ' + escapeHtml(cat) +
    (inst ? ' (' + escapeHtml(inst.baseDescription) + ')' : (t.description && t.description.toLowerCase() !== cat.toLowerCase() ? ' (' + escapeHtml(t.description) + ')' : '')) +
    (pay ? ' · ' + escapeHtml(pay) : '') + (t.date !== todayKey() ? ' · ' + formatDateFull(t.date) : '') +
    ' <button type="button" class="linklike" data-undo-tx="' + escapeHtml(t.id) + '">Desfazer</button>';
}

// Rascunho de um item lido da mensagem, com as escolhas padrão do app.
function draftFromItem(it){
  var opts = paymentOptions(), pay = opts[0].id;
  if (it.type === 'expense'){
    if (it.paymentMethod === 'cartao' && State.cards.length) pay = 'card:' + State.cards[0].id;
    else if (it.paymentMethod === 'vale') pay = State.vouchers.length ? 'vale:' + State.vouchers[0].id : 'vale';
  }
  var rec = Object.assign({type: true, category: true, payment: true, date: true}, it.recognized || {});
  // Pediu cartão mas não há cartão cadastrado: o pagamento precisa ser conferido.
  if (it.paymentMethod === 'cartao' && !State.cards.length) rec.payment = false;
  return {type: it.type, amount: it.amount, date: it.date || todayKey(), category: it.category, desc: it.description || '',
    pay: pay, acc: State.accounts.length ? State.accounts[0].id : '', install: clampInstall(it.installments || 1), recognized: rec, removed: false};
}

function draftHtml(pid, i, d){
  var rec = d.recognized, id = 'd' + pid + '_' + i + '_';
  var cats = d.type === 'income' ? incomeCats() : expenseCats();
  var onCard = d.type === 'expense' && d.pay.indexOf('card:') === 0 && d.pay !== 'card:none';
  function flag(ok, text){ return ok ? '' : ' <span class="review-flag">' + text + '</span>'; }
  function cls(ok){ return ok ? '' : ' class="needs-review"'; }
  function field(label, f, control){ return '<div class="field"><label for="' + id + f + '">' + label + '</label>' + control + '</div>'; }
  return '<fieldset class="draft" data-draft="' + i + '">' +
    '<legend class="sr-only">Item ' + (i + 1) + '</legend>' +
    '<div class="draft-head">' +
      '<select id="' + id + 'type" data-f="type" aria-label="Gasto ou ganho"' + cls(rec.type) + '>' + optionsHtml([{id:'expense', label:'Gasto'}, {id:'income', label:'Ganho'}], d.type) + '</select>' +
      '<span class="money-input sm"><span>R$</span><input id="' + id + 'amount" data-f="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + d.amount + '" aria-label="Valor"></span>' +
      '<button type="button" class="tx-del" data-draft-del aria-label="Remover este item" title="Remover">' + icon('trash') + '</button>' +
    '</div>' +
    '<div class="draft-grid">' +
      field('Descrição', 'desc', '<input id="' + id + 'desc" data-f="desc" type="text" maxlength="80" value="' + escapeHtml(d.desc) + '">') +
      field('Categoria' + flag(rec.category, 'não reconheci'), 'category', '<select id="' + id + 'category" data-f="category"' + cls(rec.category) + '>' + optionsHtml(cats, d.category) + '</select>') +
      field('Data' + flag(rec.date, d.date === todayKey() ? 'suposto: hoje' : 'confira'), 'date', '<input id="' + id + 'date" data-f="date" type="date" min="1900-01-01" max="3000-12-31" value="' + escapeHtml(d.date) + '"' + cls(rec.date) + '>') +
      (d.type === 'expense' ?
        field('Pagamento' + flag(rec.payment, 'confira'), 'pay', '<select id="' + id + 'pay" data-f="pay"' + cls(rec.payment) + '>' + optionsHtml(paymentOptions(), d.pay) + '</select>') :
        (State.accounts.length ? field('Entrou em', 'acc', '<select id="' + id + 'acc" data-f="acc">' + optionsHtml(accountOptions(), d.acc) + '</select>') : '')) +
      (onCard ? '<div class="field"><label for="' + id + 'install">Parcelas</label>' + installStepperHtml(id + 'install', 'install').replace('<input ', '<input data-f="install" value="' + d.install + '" ').replace(' value="1"', '') + '</div>' : '') +
    '</div>' +
    '<p class="form-error" data-draft-error role="alert"></p>' +
    '</fieldset>';
}

function previewHtml(pid, drafts){
  var n = drafts.filter(function(d){ return !d.removed; }).length;
  var guessed = drafts.some(function(d){ var r = d.recognized; return !d.removed && (!r.category || !r.payment || !r.date || !r.type); });
  return '<p class="chat-preview-title"><strong>Confira antes de salvar.</strong>' + (guessed ? ' Os campos marcados foram supostos por mim.' : '') + '</p>' +
    drafts.map(function(d, i){ return d.removed ? '' : draftHtml(pid, i, d); }).join('') +
    '<div class="card-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-preview-save>' + (n === 1 ? 'Salvar lançamento' : 'Salvar ' + n + ' lançamentos') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-preview-discard>Descartar</button>' +
    '</div>';
}

// Converte o rascunho em lançamento. Retorna {tx, n} ou {error}.
function draftToTx(d, i){
  var tx = {type: d.type, amount: money(d.amount), category: d.category, categoryLabel: catLabel(d.category, d.type), date: d.date,
    description: d.desc.trim(), paymentMethod: null, accountId: null, cardId: null, voucherId: null, source: 'chat', createdAt: Date.now() + i};
  if (d.type === 'expense'){
    if (d.pay === 'card:none') return {error: 'Cadastre um cartão em “Contas e cartões” ou escolha outra forma de pagamento.'};
    applyPayment(tx, d.pay);
  } else tx.accountId = d.acc || null;
  var problem = validateNewTransaction(tx);
  if (problem) return {error: problem === 'valor inválido' ? 'Informe um valor maior que zero.' : problem === 'data inválida' ? 'Confira a data.' : 'Confira este item.'};
  return {tx: tx, n: tx.paymentMethod === 'cartao' ? clampInstall(d.install) : 1};
}

async function openQuickEntry(welcome){
  var first = escapeHtml(State.session.name.split(' ')[0]);
  var closeFn = null, rootEl = null, warned = false;
  var previews = {}, seq = 0;   // previews[pid] = {drafts, state: 'pending' | 'saved' | 'discarded'}
  function log(){ return qs('#chatLog', rootEl || document); }
  function say(who, html){
    var l = log(); if (!l) return null;
    l.insertAdjacentHTML('beforeend', bubble(who, html));
    l.scrollTop = l.scrollHeight;
    return l.lastElementChild;
  }
  function pending(){ return Object.keys(previews).filter(function(pid){ return previews[pid].state === 'pending'; }); }
  function previewEl(pid){ return qs('[data-preview="' + pid + '"]', rootEl); }
  function redraw(pid, focusSel){
    var el = previewEl(pid);
    el.innerHTML = previewHtml(pid, previews[pid].drafts);
    if (focusSel){ var f = qs(focusSel, el); if (f) f.focus(); }
  }
  function handle(text){
    say('me', escapeHtml(text));
    var r = parseMessage(text);
    if (r.nothing){
      if (pending().length){ say('bot', 'Tudo bem. Ainda faltam os itens acima: salve ou descarte antes de sair.'); return; }
      say('bot', 'Beleza! Então é só usar o Grana Leve à vontade.');
      setTimeout(function(){ if (closeFn) closeFn(true); }, 900);
      return;
    }
    if (r.error){ say('bot', escapeHtml(r.error)); return; }
    var pid = String(++seq);
    previews[pid] = {drafts: r.items.map(draftFromItem), state: 'pending'};
    warned = false;
    var b = say('bot preview', '');
    b.setAttribute('data-preview', pid);
    redraw(pid);
    log().scrollTop = b.offsetTop - log().offsetTop - 8;  // mostra a prévia desde o começo
  }
  async function save(pid){
    var p = previews[pid], el = previewEl(pid), built = [], ok = true;
    p.drafts.forEach(function(d, i){
      if (d.removed) return;
      var r = draftToTx(d, i);
      var err = qs('[data-draft="' + i + '"] [data-draft-error]', el);
      err.textContent = r.error || '';
      if (r.error){ ok = false; return; }
      built.push(r);
    });
    if (!ok || !built.length) return;
    var saved = [];
    for (var j = 0; j < built.length; j++){ var list = await saveTransactions(expandInstallments(built[j].tx, built[j].n)); saved.push(list[0]); }
    p.state = 'saved';
    renderAll();
    el.innerHTML = 'Anotei:<ul class="chat-list">' + saved.map(function(t){ return '<li data-chat-tx="' + escapeHtml(t.id) + '">' + describeSaved(t) + '</li>'; }).join('') + '</ul>' +
      '<span class="chat-hint">Mais alguma coisa? Quando terminar, é só fechar.</span>';
    qs('#chatInput', rootEl).focus();
  }
  await openModal({
    title: welcome ? 'Antes de começar…' : 'Chat de lançamento',
    wide: true,
    body: '<div class="chat-log" id="chatLog" aria-live="polite">' +
        bubble('bot', (welcome ? 'Oi, ' + first + '! Teve algum gasto ou ganho desde a última vez?' : 'Me conta o que entrou ou saiu.') +
          '<br><span class="chat-hint">Escreva do seu jeito: “gastei 30 no mercado”, “recebi 1.500 de salário ontem”, “paguei 120 de luz e 80 de internet”. Antes de salvar, eu mostro o que entendi para você conferir.</span>') +
      '</div>' +
      '<div class="chips" id="chatChips">' +
        '<button type="button" class="chip" data-chip-send="Não, nada">Não, nada</button>' +
        '<button type="button" class="chip" data-chip="gastei ">Gastei…</button>' +
        '<button type="button" class="chip" data-chip="recebi ">Recebi…</button>' +
      '</div>' +
      '<input id="chatInput" class="chat-input" name="msg" type="text" maxlength="200" autocomplete="off" placeholder="Ex: gastei 25 no almoço" aria-label="Mensagem">' +
      '<button type="button" class="linklike" data-chat-form style="justify-self:start">Prefiro preencher o formulário completo</button>' +
      (welcome ? '<label class="check"><input type="checkbox" name="off"' + (getPrefs().quickEntryOff ? ' checked' : '') + '> Não perguntar ao entrar</label>' : ''),
    submitLabel: 'Enviar', cancelLabel: welcome ? 'Pular' : 'Fechar',
    // Itens ainda não salvos: avisa uma vez antes de deixar fechar (e descartar).
    beforeClose: function(){
      var n = pending().length;
      if (!n || warned) return true;
      warned = true;
      say('bot', '<strong>Ainda não salvei os itens acima.</strong> Toque em “Salvar” ou “Descartar”. Se fechar de novo, eles serão descartados.');
      return false;
    },
    onOpen: function(root, close){
      closeFn = close; rootEl = root;
      root.addEventListener('click', async function(e){
        var b;
        if ((b = e.target.closest('[data-chip-send]'))){ handle(b.getAttribute('data-chip-send')); return; }
        if (e.target.closest('[data-chat-form]')){ close(null); showTab('lancamentos'); document.getElementById('txAmount').focus(); return; }
        if ((b = e.target.closest('[data-chip]'))){ var inp = qs('#chatInput', root); inp.value = b.getAttribute('data-chip'); inp.focus(); return; }
        var box = e.target.closest('[data-preview]');
        if (box){
          var pid = box.getAttribute('data-preview');
          if (e.target.closest('[data-preview-save]')){ await save(pid); return; }
          if (e.target.closest('[data-preview-discard]')){
            previews[pid].state = 'discarded';
            box.innerHTML = '<span class="chat-hint">Descartado. Nada foi salvo.</span>';
            qs('#chatInput', root).focus();
            return;
          }
          var del = e.target.closest('[data-draft-del]');
          if (del){
            var i = Number(del.closest('[data-draft]').getAttribute('data-draft'));
            previews[pid].drafts[i].removed = true;
            if (!previews[pid].drafts.some(function(d){ return !d.removed; })){ previews[pid].state = 'discarded'; box.innerHTML = '<span class="chat-hint">Todos os itens foram removidos. Nada foi salvo.</span>'; }
            else redraw(pid, '[data-preview-save]');
            return;
          }
        }
        if ((b = e.target.closest('[data-undo-tx]'))){
          var id = b.getAttribute('data-undo-tx');
          await Store.remove(k(), 'transactions', id);
          State.transactions = State.transactions.filter(function(x){ return x.id !== id; });
          renderAll();
          var li = b.closest('[data-chat-tx]');
          li.innerHTML = '<s>' + li.textContent.replace('Desfazer','').trim() + '</s> · desfeito';
        }
      });
      // Edição dos rascunhos: o campo alterado deixa de ser "suposto".
      function onEdit(e){
        var f = e.target.getAttribute && e.target.getAttribute('data-f');
        var row = f && e.target.closest('[data-draft]');
        if (!row) return;
        var pid = row.closest('[data-preview]').getAttribute('data-preview');
        var d = previews[pid].drafts[Number(row.getAttribute('data-draft'))];
        d[f] = e.target.value;
        var recKey = {category:'category', date:'date', pay:'payment', type:'type'}[f];
        if (recKey && e.type === 'change'){ d.recognized[recKey] = true; e.target.classList.remove('needs-review'); var flagEl = row.querySelector('label[for="' + e.target.id + '"] .review-flag'); if (flagEl) flagEl.remove(); }
        if (e.type === 'change' && (f === 'type' || f === 'pay')){
          if (f === 'type'){ d.category = Cats.FALLBACK_CATEGORY[d.type]; d.recognized.category = false; }
          redraw(pid, '[data-draft="' + row.getAttribute('data-draft') + '"] [data-f="' + f + '"]');
        }
      }
      root.addEventListener('input', onEdit);
      root.addEventListener('change', onEdit);
      var off = root.querySelector('input[name=off]');
      if (off) off.addEventListener('change', function(){ setPref('quickEntryOff', off.checked); });
    },
    onSubmit: function(form){
      var text = form.msg.value.trim();
      form.msg.value = '';
      if (text) handle(text);
      form.msg.focus();
      return {keepOpen: true};
    }
  });
}

// Ao entrar no app, pergunta uma vez por dia (dá para desligar no próprio chat).
function maybeWelcome(){
  var p = getPrefs();
  if (p.quickEntryOff || p.lastWelcome === todayKey()) return;
  setPref('lastWelcome', todayKey());
  setTimeout(function(){ if (State.session && document.getElementById('modalRoot').hidden) openQuickEntry(true); }, 350);
}

/* ---------- Conexões ---------- */
function renderConnections(){
  var opt = getPrefs().waOptin;
  document.getElementById('connWrap').innerHTML =
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('chat') + '</span><h3>WhatsApp</h3><span class="status-pill warning">Em breve</span></div>' +
      '<p>Registre gastos mandando uma mensagem, do jeito que você fala. O Grana Leve entende, lança sozinho e também te lembra das metas e das contas a receber.</p>' +
      '<div class="phone-mock" aria-hidden="true">' +
        bubble('me', 'gastei 25 no almoço no vale') +
        bubble('bot', 'Anotei: <strong>Gasto de R$ 25,00</strong> em Alimentação · Vale') +
        bubble('bot', 'Lembrete: faltam R$ 750,00 para a meta “Viagem”.') +
      '</div>' +
      '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-conn="chat">' + icon('chat') + 'Testar o chat agora</button></div>' +
      (opt ? '<p class="field-hint">Pronto! Vamos te avisar no número ' + escapeHtml(opt.phone) + ' quando estiver disponível. <button type="button" class="linklike" data-conn="wa-remove">Remover</button></p>' :
        '<form id="waOptinForm" class="deposit-form"><input class="select-sm" style="padding:8px 10px" name="phone" type="tel" maxlength="20" placeholder="Seu WhatsApp" aria-label="Seu número de WhatsApp"><button class="btn btn-ghost btn-sm" type="submit">Quero ser avisado</button></form>') +
    '</div>' +
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('bank') + '</span><h3>Open Finance</h3><span class="status-pill warning">Em breve</span></div>' +
      '<p>Conecte sua conta do banco para trazer extratos e faturas automaticamente, já com categoria, sem digitar nada.</p>' +
      '<ol class="howto-list"><li>Escolha o seu banco.</li><li>Autorize no app do banco: você decide o que compartilhar e por quanto tempo.</li><li>Os lançamentos aparecem aqui sozinhos.</li></ol>' +
      '<div class="chips">' + OPEN_FINANCE_BANKS.map(function(b){ return '<button type="button" class="chip" disabled title="Em breve">' + escapeHtml(b) + '</button>'; }).join('') + '</div>' +
      '<p class="field-hint">' + icon('lock') + ' O Open Finance é regulado pelo Banco Central. O Grana Leve nunca vai pedir a senha do seu banco.</p>' +
    '</div>' +
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('phone') + '</span><h3>App no celular</h3><span class="status-pill good">Disponível</span></div>' +
      '<p>Instale o Grana Leve na tela inicial: ele abre como um aplicativo e funciona mesmo sem internet.</p>' +
      (installPrompt ? '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-conn="install">Instalar agora</button></div>' :
        (isStandalone() ? '<p class="field-hint">O Grana Leve já está instalado neste aparelho.</p>' :
        '<ul class="howto-list"><li><strong>Android (Chrome):</strong> menu ⋮ e depois “Instalar app” ou “Adicionar à tela inicial”.</li><li><strong>iPhone (Safari):</strong> botão Compartilhar e depois “Adicionar à Tela de Início”.</li></ul>')) +
    '</div>' +
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('calendar') + '</span><h3>Google Agenda</h3><span class="status-pill good">Disponível</span></div>' +
      '<p>Crie lembretes das suas metas na sua agenda com um toque. É só preencher “Me avise em” ou o prazo na meta e tocar em “Google Agenda”.</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" type="button" data-conn="metas">Ir para Metas</button></div>' +
    '</div>';
}

/* ---------- Tudo ---------- */
function renderAll(){
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
  renderLearn();
  renderConnections();
}

/* ============ Tabs / navigation ============ */
var TABS = ['dashboard','lancamentos','cartoes','limites','metas','dividas','receber','aprenda','conexoes'];
function showTab(name){
  State.activeTab = name;
  qsa('#tabbar button').forEach(function(b){
    var on = b.getAttribute('data-tab') === name;
    b.classList.toggle('active', on);
    if (on) b.scrollIntoView({block:'nearest', inline:'nearest'});
  });
  TABS.forEach(function(t){ document.getElementById('tab-' + t).hidden = (t !== name); });
}

function showAuthTab(name){
  State.authTab = name;
  qsa('[data-authtab]').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-authtab') === name); });
  document.getElementById('loginForm').hidden = (name !== 'login');
  document.getElementById('signupForm').hidden = (name !== 'signup');
  document.getElementById('authFoot').textContent = name === 'login' ? 'Ainda não tem conta? Clique em “Criar conta” acima.' : 'Já é cadastrado? Clique em “Entrar” acima.';
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
  qsa('[data-local-only]').forEach(function(el){ el.hidden = Store.mode !== 'local'; });
}

async function enterApp(){
  setPrefsOwner(k());
  showView('viewApp');
  await Store.migrate(k());
  await loadAllData();
  Store.persist().then(function(v){ State.persisted = v; });
  document.getElementById('txDate').value = todayKey();
  document.getElementById('fcDate').value = todayKey();
  populateCategorySelect();
  populateInstallSelect();
  renderAll();
  syncTxFormVisibility();
  showTab('dashboard');
  maybeWelcome();
}

function logout(){
  clearSession();
  State.session = null;
  setPrefsOwner(null);
  showView('viewLanding');
  renderTopbar();
}

function backupCounts(){
  var n = function(list, one, many){ return list.length + ' ' + (list.length === 1 ? one : many); };
  return [n(State.transactions, 'lançamento', 'lançamentos'), n(State.accounts, 'conta', 'contas'), n(State.cards, 'cartão', 'cartões'),
    n(State.goals, 'meta', 'metas'), n(State.debts, 'dívida', 'dívidas')].join(', ');
}
function backupFile(){
  var data = {
    transactions: State.transactions, goals: State.goals, debts: State.debts, cards: State.cards, receivables: State.receivables,
    forecasts: State.forecasts, categories: State.categories, vouchers: State.vouchers, accounts: State.accounts, transfers: State.transfers,
    budgets: Object.keys(State.budgetBase).map(function(id){ return {id:id, limit: State.budgetBase[id]}; })
      .concat(Object.keys(State.budgetMonths).map(function(m){ return {id:'plan-' + m, month:m, limits: State.budgetMonths[m]}; }))
  };
  return buildBackup(data, getPrefs(), {name: State.session.name, email: State.session.email});
}
async function exportBackup(){
  await saveFile('grana-leve-backup-' + todayKey() + '.json', JSON.stringify(backupFile(), null, 2), 'application/json');
  setPref('lastBackup', Date.now());
  setPref('backupSnoozeUntil', null);
  renderBackupBanner();
  toast('Backup salvo. Guarde o arquivo fora deste aparelho (no Google Drive, por exemplo).');
}
function daysAgoText(ts){
  var d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : 'há ' + d + ' dias';
}

// Lembrete no painel: só no armazenamento do navegador, com dados de verdade e sem backup há 30 dias.
var BACKUP_EVERY_DAYS = 30;
function backupDue(){
  if (Store.mode !== 'local' || !State.session) return false;
  var p = getPrefs(), now = Date.now();
  if (p.backupSnoozeUntil && p.backupSnoozeUntil > now) return false;
  var count = State.transactions.length + State.accounts.length + State.cards.length + State.goals.length + State.debts.length + State.receivables.length;
  if (count < 5) return false;
  return !p.lastBackup || now - p.lastBackup > BACKUP_EVERY_DAYS * 86400000;
}
function renderBackupBanner(){
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

async function dataModal(){
  if (!State.session){
    await openModal({title:'Seus dados e backup', body:'<p>Os dados do Grana Leve ficam salvos só no navegador em que a conta foi criada. Entre na sua conta para salvar ou restaurar um backup.</p>', submitLabel:null, cancelLabel:'Fechar'});
    return;
  }
  var local = Store.mode === 'local';
  var last = getPrefs().lastBackup;
  var persistText = State.persisted === true ? 'o navegador foi avisado para não apagar estes dados sozinho.' :
    'o navegador pode apagar estes dados se faltar espaço no aparelho. Por isso o backup é importante.';
  await openModal({
    title: 'Seus dados e backup',
    body: '<div class="storage-status">' + icon('lock') + '<div><strong>' + (local ? 'Onde ficam: só neste navegador' : 'Onde ficam: na nuvem deste app') + '</strong>' +
        (local ? '<ul><li>Não sincroniza com outros aparelhos e não tem recuperação de senha.</li><li>Proteção: ' + persistText + '</li>' +
          '<li>Último backup: <strong>' + (last ? formatDateFull(toDateKey(new Date(last))) + ' (' + daysAgoText(last) + ')' : 'nunca') + '</strong></li></ul>' :
          '<p>Seus dados ficam salvos no armazenamento do app e aparecem onde você abrir este app.</p>') +
      '</div></div>' +
      '<div class="tip-box"><strong>Agora você tem:</strong> ' + backupCounts() + '.</div>' +
      '<p>O backup é um arquivo com todos os seus dados e preferências. Guarde fora deste aparelho (no Google Drive, por exemplo).</p>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-primary btn-sm" data-backup="export">Salvar backup</button></div>' +
      '<h4>Restaurar um backup</h4>' +
      '<p>Escolha um arquivo salvo antes. Ele <strong>substitui</strong> os dados atuais desta conta. Sua senha não muda.</p>' +
      '<input type="file" id="backupFile" accept="application/json,.json" aria-label="Arquivo de backup">' +
      '<p class="form-error" id="backupError" role="alert"></p>',
    submitLabel: null, cancelLabel: 'Fechar',
    onOpen: function(modal, close){
      qs('[data-backup="export"]', modal).addEventListener('click', function(){ exportBackup().then(function(){ close(null); }); });
      qs('#backupFile', modal).addEventListener('change', function(e){
        var file = e.target.files[0];
        var err = qs('#backupError', modal);
        err.textContent = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024){ err.textContent = 'Arquivo grande demais para ser um backup do Grana Leve.'; return; }
        var reader = new FileReader();
        reader.onload = async function(){
          var obj;
          try{ obj = JSON.parse(reader.result); } catch(ex){ err.textContent = 'Não foi possível ler o arquivo.'; return; }
          var r = readBackup(obj);
          if (r.error){ err.textContent = r.error; return; }
          close(null);
          var ok = await confirmAction({title:'Restaurar backup?', message:'O backup de ' + (r.exportedAt ? new Date(r.exportedAt).toLocaleDateString('pt-BR') : 'data desconhecida') + ' tem ' + r.count + ' lançamentos. Os dados atuais desta conta serão substituídos.', confirmLabel:'Restaurar'});
          if (!ok) return;
          await Store.replaceAll(k(), r.data);
          Object.keys(r.prefs).forEach(function(key){ if (key !== 'lastBackup') setPref(key, r.prefs[key]); });
          await loadAllData();
          renderAll();
          toast('Backup restaurado.');
        };
        reader.readAsText(file);
      });
    }
  });
}

async function showInfo(id){
  if (id === 'backup'){ dataModal(); return; }
  var page = INFO_PAGES[id];
  if (id === 'como-usar'){
    page = {title:'Como usar o Grana Leve', body:'<ol class="howto-list">' + HOW_TO.map(function(h){ return '<li><strong>' + escapeHtml(h[0]) + '</strong> ' + escapeHtml(h[1]) + '</li>'; }).join('') + '</ol>'};
  }
  var canDelete = id === 'privacidade' && State.session;
  var r = await openModal({
    title: page.title, body: page.body, wide: false,
    submitLabel: canDelete ? 'Apagar minha conta e dados' : null, danger: true, cancelLabel: 'Fechar'
  });
  if (r && canDelete){
    var ok = await confirmAction({title:'Apagar conta?', message:'Todos os seus lançamentos, cartões, metas, dívidas e valores a receber serão apagados deste navegador. Isso não pode ser desfeito.', confirmLabel:'Apagar tudo'});
    if (!ok) return;
    await Store.deleteUser(k());
    try{ localStorage.removeItem(prefsKey()); } catch(e){}
    logout();
    toast('Conta e dados apagados.');
  }
}

/* ============ Event wiring ============ */
document.getElementById('footerYear').textContent = new Date().getFullYear();
attachCounters(document);
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

document.addEventListener('click', async function(e){
  var t = e.target;
  var el;
  if ((el = t.closest('[data-action]'))){
    var action = el.getAttribute('data-action');
    if (action === 'go-login'){ showView('viewAuth'); showAuthTab('login'); }
    if (action === 'go-signup'){ showView('viewAuth'); showAuthTab('signup'); }
    if (action === 'go-tab-lancamentos'){ showTab('lancamentos'); }
    return;
  }
  if ((el = t.closest('[data-info]'))){ showInfo(el.getAttribute('data-info')); return; }
  if (!State.session) return;
  if (t.closest('#modalRoot')) return;

  if ((el = t.closest('[data-edit-tx]'))){
    var et = findById(State.transactions, el.getAttribute('data-edit-tx'));
    if (et) openTxModal(et);
    return;
  }
  if (t.closest('[data-backup-now]')){ exportBackup(); return; }
  if (t.closest('[data-backup-snooze]')){
    setPref('backupSnoozeUntil', Date.now() + 7 * 86400000);
    renderBackupBanner();
    toast('Combinado, lembramos de novo em 7 dias.');
    return;
  }
  if ((el = t.closest('[data-del-tx]'))){
    var id = el.getAttribute('data-del-tx');
    var tx = findById(State.transactions, id);
    if (!tx) return;
    var ok, ids = [id];
    if (tx.installment){
      ids = State.transactions.filter(function(x){ return x.installment && x.installment.group === tx.installment.group; }).map(function(x){ return x.id; });
      ok = await confirmAction({title:'Excluir compra parcelada?', message:'“' + tx.installment.baseDescription + '” foi parcelada em ' + tx.installment.total + 'x. Excluir apaga as ' + ids.length + ' parcelas desta compra.'});
    } else {
      ok = await confirmAction({title:'Excluir lançamento?', message:'Tem certeza que deseja excluir “' + (tx.description || catLabel(tx.category, tx.type, tx.categoryLabel)) + '” de ' + fmtMoney(tx.amount) + '?', skipKey:'deleteTx'});
    }
    if (!ok) return;
    for (var di=0;di<ids.length;di++){ await Store.remove(k(), 'transactions', ids[di]); }
    State.transactions = State.transactions.filter(function(x){ return ids.indexOf(x.id) < 0; });
    renderAll();
    toast('Lançamento excluído.');
    return;
  }
  if ((el = t.closest('[data-view-toggle]'))){
    var which = el.getAttribute('data-view-toggle');
    if (which === 'donut'){ State.donutView = State.donutView === 'chart' ? 'table' : 'chart'; renderDonut(txForMonth(monthBounds(0).key)); }
    else { State.barView = State.barView === 'chart' ? 'table' : 'chart'; renderBarChart(); }
    return;
  }
  if ((el = t.closest('[data-fc-receive]'))){ receiveForecast(el.getAttribute('data-fc-receive'), el.getAttribute('data-fc-date')); return; }
  if ((el = t.closest('[data-fc-del]'))){
    var f = findById(State.forecasts, el.getAttribute('data-fc-del'));
    if (!(await confirmAction({title:'Excluir previsão?', message:'Excluir a previsão “' + f.description + '”' + (f.recurring ? ' de todos os meses' : '') + '? Os ganhos já registrados continuam.'}))) return;
    await Store.remove(k(), 'forecasts', f.id);
    State.forecasts = State.forecasts.filter(function(x){ return x.id !== f.id; });
    renderDashboard();
    return;
  }
  // Cartões
  if ((el = t.closest('[data-inv-shift]'))){
    var cid = el.getAttribute('data-inv-shift');
    State.invoiceOffsets[cid] = (State.invoiceOffsets[cid] || 0) + Number(el.getAttribute('data-dir'));
    renderCards();
    return;
  }
  if ((el = t.closest('[data-inv-pdf]'))){ generateInvoicePdf(el.getAttribute('data-inv-pdf'), el.getAttribute('data-key')); return; }
  if ((el = t.closest('[data-inv-paid]'))){ toggleInvoicePaid(el.getAttribute('data-inv-paid'), el.getAttribute('data-key')); return; }
  // Contas bancárias
  if ((el = t.closest('[data-acc-transfer]'))){ openTransfer(el.getAttribute('data-acc-transfer')); return; }
  if ((el = t.closest('[data-acc-edit]'))){ editAccount(el.getAttribute('data-acc-edit')); return; }
  if ((el = t.closest('[data-acc-del]'))){
    var ac = findById(State.accounts, el.getAttribute('data-acc-del'));
    if (!(await confirmAction({title:'Excluir conta?', message:'Excluir a conta “' + ac.name + '”? Os ganhos e gastos ligados a ela continuam nos seus lançamentos, sem conta.'}))) return;
    await Store.remove(k(), 'accounts', ac.id);
    State.accounts = State.accounts.filter(function(x){ return x.id !== ac.id; });
    renderAll();
    return;
  }
  if ((el = t.closest('[data-transfer-del]'))){
    var tr = findById(State.transfers, el.getAttribute('data-transfer-del'));
    if (!tr || !(await confirmAction({title:'Excluir transferência?', message:'Excluir a transferência de ' + fmtMoney(tr.amount) + ' de ' + accountName(tr.fromId) + ' para ' + accountName(tr.toId) + '? O saldo das duas contas volta ao que era.'}))) return;
    await Store.remove(k(), 'transfers', tr.id);
    State.transfers = State.transfers.filter(function(x){ return x.id !== tr.id; });
    renderAccounts(); renderStatTiles();
    toast('Transferência excluída.');
    return;
  }
  if ((el = t.closest('[data-card-edit]'))){ editCard(el.getAttribute('data-card-edit')); return; }
  if ((el = t.closest('[data-card-report]'))){ cardReport(el.getAttribute('data-card-report')); return; }
  if ((el = t.closest('[data-adv-group]'))){ advanceInstallments(el.getAttribute('data-adv-group')); return; }
  if ((el = t.closest('[data-voucher-edit]'))){ editVoucher(el.getAttribute('data-voucher-edit')); return; }
  if ((el = t.closest('[data-voucher-del]'))){
    var vd = findById(State.vouchers, el.getAttribute('data-voucher-del'));
    if (!(await confirmAction({title:'Excluir vale?', message:'Excluir o vale “' + vd.name + '”? Os gastos feitos com ele continuam nos seus lançamentos.'}))) return;
    await Store.remove(k(), 'vouchers', vd.id);
    State.vouchers = State.vouchers.filter(function(x){ return x.id !== vd.id; });
    renderAll();
    return;
  }
  if ((el = t.closest('[data-card-del]'))){
    var c = findById(State.cards, el.getAttribute('data-card-del'));
    if (!(await confirmAction({title:'Excluir cartão?', message:'Excluir o cartão “' + c.name + '”? As compras feitas nele continuam nos seus gastos.'}))) return;
    await Store.remove(k(), 'cards', c.id);
    State.cards = State.cards.filter(function(x){ return x.id !== c.id; });
    renderAll();
    return;
  }
  // Conexões
  if ((el = t.closest('[data-conn]'))){
    var conn = el.getAttribute('data-conn');
    if (conn === 'chat') openQuickEntry(false);
    if (conn === 'metas') showTab('metas');
    if (conn === 'wa-remove'){ setPref('waOptin', null); renderConnections(); }
    if (conn === 'install' && installPrompt){
      installPrompt.prompt();
      installPrompt.userChoice.then(function(){ installPrompt = null; if (State.session) renderConnections(); });
    }
    return;
  }
  // Metas
  if ((el = t.closest('[data-goal-filter]'))){ State.goalFilter = el.getAttribute('data-goal-filter'); renderGoals(); return; }
  if ((el = t.closest('[data-goal-edit]'))){ editGoal(el.getAttribute('data-goal-edit')); return; }
  if ((el = t.closest('[data-goal-del]'))){
    var g = findById(State.goals, el.getAttribute('data-goal-del'));
    if (!(await confirmAction({title:'Excluir meta?', message:'Tem certeza que deseja excluir a meta “' + g.name + '”? Ela vai para “Excluídas” e pode ser restaurada.'}))) return;
    g.deletedAt = Date.now();
    await Store.update(k(), 'goals', g.id, {deletedAt: g.deletedAt});
    renderGoals(); renderDashboard();
    return;
  }
  if ((el = t.closest('[data-goal-restore]'))){
    var gr = findById(State.goals, el.getAttribute('data-goal-restore'));
    gr.deletedAt = null;
    await Store.update(k(), 'goals', gr.id, {deletedAt: null});
    renderGoals(); renderDashboard();
    toast('Meta restaurada.');
    return;
  }
  if ((el = t.closest('[data-goal-purge]'))){
    var gp = findById(State.goals, el.getAttribute('data-goal-purge'));
    if (!(await confirmAction({title:'Apagar de vez?', message:'A meta “' + gp.name + '” será apagada permanentemente.'}))) return;
    await Store.remove(k(), 'goals', gp.id);
    State.goals = State.goals.filter(function(x){ return x.id !== gp.id; });
    renderGoals();
    return;
  }
  // Dívidas
  if ((el = t.closest('[data-debt-pay]'))){ payDebt(el.getAttribute('data-debt-pay')); return; }
  if ((el = t.closest('[data-debt-del]'))){
    var d = findById(State.debts, el.getAttribute('data-debt-del'));
    if (!(await confirmAction({title:'Excluir dívida?', message:'Tem certeza que deseja excluir a dívida “' + d.name + '”?'}))) return;
    await Store.remove(k(), 'debts', d.id);
    State.debts = State.debts.filter(function(x){ return x.id !== d.id; });
    renderDebts(); renderDashboard();
    return;
  }
  // A receber
  if ((el = t.closest('[data-recv-get]'))){ receiveReceivable(el.getAttribute('data-recv-get')); return; }
  if ((el = t.closest('[data-recv-charge]'))){ chargeReceivable(el.getAttribute('data-recv-charge')); return; }
  if ((el = t.closest('[data-recv-del]'))){
    var r = findById(State.receivables, el.getAttribute('data-recv-del'));
    if (!(await confirmAction({title:'Excluir?', message:'Tem certeza que deseja excluir o valor a receber de ' + r.person + '?'}))) return;
    await Store.remove(k(), 'receivables', r.id);
    State.receivables = State.receivables.filter(function(x){ return x.id !== r.id; });
    renderReceivables(); renderDashboard();
    return;
  }
});

// Guardar valor em uma meta (formulário dentro do card).
document.addEventListener('submit', function(e){
  if (e.target.id !== 'waOptinForm') return;
  e.preventDefault();
  var phone = e.target.phone.value.trim();
  if (onlyDigits(phone).length < 10){ toast('Informe o número com DDD.'); return; }
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
  var newAmount = money(Number(g.currentAmount||0) + amount);
  await Store.update(k(), 'goals', g.id, {currentAmount: newAmount});
  g.currentAmount = newAmount;
  renderGoals(); renderStatTiles();
  toast(newAmount >= g.targetAmount ? 'Meta “' + g.name + '” concluída! Parabéns!' : 'Você guardou mais ' + fmtMoney(amount) + ' na meta “' + g.name + '”.');
});

document.getElementById('brandHome').addEventListener('click', function(){
  if (State.session) { showView('viewApp'); showTab('dashboard'); } else { showView('viewLanding'); }
});

qsa('[data-authtab]').forEach(function(b){ b.addEventListener('click', function(){ showAuthTab(b.getAttribute('data-authtab')); }); });

document.getElementById('typeToggle').addEventListener('click', function(e){
  var btn = e.target.closest('button[data-type]');
  if (!btn) return;
  qsa('button', document.getElementById('typeToggle')).forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  populateCategorySelect();
  syncTxFormVisibility();
});
document.getElementById('txCategory').addEventListener('change', async function(e){
  if (e.target.value !== '__new') return;
  var id = await createCategory(currentTxType());
  populateCategorySelect(id || undefined);
  if (id){ renderBudgets(); }
});
document.getElementById('txForOther').addEventListener('change', syncTxFormVisibility);
// Pagou com vale: já sugere a categoria Alimentação.
document.getElementById('txPayment').addEventListener('change', function(e){
  if (e.target.value.indexOf('vale') === 0 && currentTxType() === 'expense') document.getElementById('txCategory').value = 'alimentacao';
  syncTxFormVisibility();
});
document.getElementById('txAmount').addEventListener('input', populateInstallSelect);
document.getElementById('txInstall').addEventListener('input', populateInstallSelect);
['txSearch','txFilterType','txFilterPay'].forEach(function(id){
  document.getElementById(id).addEventListener(id === 'txSearch' ? 'input' : 'change', renderTransactionsTab);
});
document.getElementById('manageCatsBtn').addEventListener('click', manageCategories);

document.getElementById('tabbar').addEventListener('click', function(e){
  var btn = e.target.closest('button[data-tab]');
  if (btn) showTab(btn.getAttribute('data-tab'));
});

document.getElementById('fabAdd').addEventListener('click', function(){ openTxModal(); });

document.getElementById('prevMonth').addEventListener('click', function(){ State.txMonthOffset--; renderTransactionsTab(); });
document.getElementById('nextMonth').addEventListener('click', function(){ if (State.txMonthOffset < maxTxMonthOffset()){ State.txMonthOffset++; renderTransactionsTab(); } });
document.getElementById('budgetPrev').addEventListener('click', function(){ State.budgetMonthOffset--; renderBudgets(); });
document.getElementById('budgetNext').addEventListener('click', function(){ if (State.budgetMonthOffset < 1){ State.budgetMonthOffset++; renderBudgets(); } });
document.getElementById('budgetNewCat').addEventListener('click', async function(){
  var id = await createCategory('expense');
  if (id){ populateCategorySelect(document.getElementById('txCategory').value); renderBudgets(); var inp = qs('[data-budget-cat="' + id + '"]'); if (inp) inp.focus(); }
});
document.getElementById('budgetManageCats').addEventListener('click', manageCategories);
document.getElementById('barPeriod').addEventListener('change', function(e){ State.barMonths = Number(e.target.value); renderBarChart(); });

document.getElementById('loginForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var errEl = document.getElementById('loginError');
  errEl.textContent = '';
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
  var emailKey = sanitizeEmailKey(email);
  try{
    if (await Store.getUser(emailKey)){ errEl.textContent = 'Já existe uma conta com esse e-mail. Tente entrar.'; return; }
    var profile = Object.assign({name: name, email: email, createdAt: Date.now()}, await makePasswordRecord(password));
    await Store.createUser(emailKey, profile);
    State.session = newSession(emailKey, profile);
    saveSession(State.session);
    document.getElementById('signupPassword').value = '';
    toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.');
    await enterApp();
  } catch(err){ errEl.textContent = 'Não foi possível criar a conta agora. Tente novamente.'; }
});

document.getElementById('txForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var type = currentTxType();
  var amount = money(document.getElementById('txAmount').value);
  var category = document.getElementById('txCategory').value;
  var date = document.getElementById('txDate').value || todayKey();
  var desc = document.getElementById('txDesc').value.trim();
  if (!(amount > 0)){ toast('Informe um valor válido.'); return; }
  if (!validDateStr(date)){ toast('Use uma data entre 1900 e 3000.'); return; }
  if (category === '__new'){ toast('Escolha uma categoria.'); return; }
  var tx = {type:type, amount:amount, category:category, categoryLabel: catLabel(category, type), date:date, description:desc, paymentMethod:null, accountId:null, createdAt: Date.now()};
  if (type === 'income') tx.accountId = document.getElementById('txAccount').value || null;
  var forOther = null;
  if (type === 'expense'){
    var pay = document.getElementById('txPayment').value;
    if (pay === 'card:none'){ toast('Cadastre um cartão em “Contas e cartões” primeiro.'); showTab('cartoes'); return; }
    applyPayment(tx, pay);
    if (document.getElementById('txForOther').checked){
      forOther = document.getElementById('txOtherName').value.trim();
      if (!forOther){ toast('Informe quem vai te devolver o valor.'); return; }
    }
  }
  var n = tx.paymentMethod === 'cartao' ? clampInstall(document.getElementById('txInstall').value) : 1;
  await saveTransactions(expandInstallments(tx, n));
  if (forOther){
    var recvData = {person:forOther, kind: tx.paymentMethod === 'cartao' ? 'cartao' : 'combinado', description: desc || catLabel(category, type), totalAmount: amount, receivedAmount: 0, dueDate: null, createdAt: Date.now()};
    if (n > 1){
      var usedCard = findById(State.cards, tx.cardId);
      recvData.installments = n; recvData.installmentAmount = Math.floor(amount * 100 / n) / 100; recvData.cardId = tx.cardId;
      if (usedCard) recvData.dueDate = invoiceDates(invoiceKeyFor(date, usedCard), usedCard).due;
    }
    var recv = await Store.add(k(), 'receivables', recvData);
    State.receivables.push(recv);
    document.getElementById('txForOther').checked = false;
    document.getElementById('txOtherName').value = '';
    syncTxFormVisibility();
  }
  document.getElementById('txAmount').value = '';
  document.getElementById('txDesc').value = '';
  document.getElementById('txInstall').value = '1';
  populateInstallSelect();
  renderAll();
  toast((type === 'expense' ? 'Gasto' : 'Ganho') + ' de ' + fmtMoney(amount) + (n > 1 ? ' em ' + n + 'x' : '') + ' registrado.' + (forOther ? ' ' + forOther + ' foi para “A receber”.' : ''));
});

document.getElementById('forecastForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var desc = document.getElementById('fcDesc').value.trim();
  var amount = money(document.getElementById('fcAmount').value);
  var date = document.getElementById('fcDate').value;
  if (!desc || !(amount > 0) || !date){ toast('Preencha descrição, valor e data prevista.'); return; }
  if (!validDateStr(date)){ toast('Use uma data entre 1900 e 3000.'); return; }
  var f = {description: desc, amount: amount, date: date, recurring: document.getElementById('fcRecurring').checked, category: /sal[aá]rio/i.test(desc) ? 'salario' : 'outros_receita', received: {}, createdAt: Date.now()};
  var saved = await Store.add(k(), 'forecasts', f);
  State.forecasts.push(saved);
  e.target.reset();
  document.getElementById('fcDate').value = todayKey();
  renderDashboard();
  toast('Previsão de ' + fmtMoney(amount) + ' adicionada.');
});

document.getElementById('accountForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var name = document.getElementById('accName').value.trim();
  var raw = document.getElementById('accBalance').value;
  if (!name){ toast('Dê um nome para a conta.'); return; }
  var a = {name: name, initialBalance: raw === '' ? 0 : money(raw), baseDate: todayKey(), baseAt: Date.now(), createdAt: Date.now()};
  var saved = await Store.add(k(), 'accounts', a);
  State.accounts.push(saved);
  e.target.reset();
  renderAll();
  toast('Conta “' + name + '” adicionada com saldo de ' + fmtMoney(a.initialBalance) + '.');
});
document.getElementById('transferBtn').addEventListener('click', function(){ openTransfer(); });

document.getElementById('cardForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var v = readCardFields(document.getElementById('cardName').value, document.getElementById('cardLimit').value, document.getElementById('cardClosing').value, document.getElementById('cardDue').value);
  if (v.error){ toast(v.error); return; }
  v.paidInvoices = []; v.createdAt = Date.now();
  var saved = await Store.add(k(), 'cards', v);
  State.cards.push(saved);
  e.target.reset();
  renderCards(); populatePaymentSelect();
  toast('Cartão “' + v.name + '” adicionado.');
});

document.getElementById('voucherForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var name = document.getElementById('vName').value.trim();
  var amount = money(document.getElementById('vAmount').value);
  var balRaw = document.getElementById('vBalance').value;
  if (!name || !(amount > 0)){ toast('Informe o nome e quanto cai por mês no vale.'); return; }
  var v = {name:name, amount:amount, carryOver: document.getElementById('vCarry').checked, initialBalance: balRaw === '' ? null : money(balRaw), startDate: todayKey(), createdAt: Date.now()};
  var saved = await Store.add(k(), 'vouchers', v);
  State.vouchers.push(saved);
  e.target.reset();
  document.getElementById('vCarry').checked = true;
  renderVouchers(); populatePaymentSelect();
  toast('Vale “' + name + '” adicionado.');
});

document.getElementById('goalForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var name = document.getElementById('goalName').value.trim();
  var target = money(document.getElementById('goalTarget').value);
  var date = document.getElementById('goalDate').value;
  var reminder = document.getElementById('goalReminder').value;
  var note = document.getElementById('goalNote').value.trim();
  if (!name || !(target > 0)){ toast('Informe nome e valor alvo da meta.'); return; }
  if (!validDateStr(date) || !validDateStr(reminder)){ toast('Use datas entre os anos de 1900 e 3000.'); return; }
  var goal = {name:name, targetAmount:target, currentAmount:0, targetDate:date||null, reminderDate:reminder||null, note:note, deletedAt:null, createdAt:Date.now()};
  var saved = await Store.add(k(), 'goals', goal);
  State.goals.push(saved);
  e.target.reset();
  State.goalFilter = 'andamento';
  renderGoals(); renderDashboard();
  toast('Meta “' + name + '” criada.');
});

document.getElementById('debtForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var name = document.getElementById('debtName').value.trim();
  var total = money(document.getElementById('debtTotal').value);
  var paid = Math.max(0, money(document.getElementById('debtPaid').value || 0));
  var installment = Math.max(0, money(document.getElementById('debtInstallment').value || 0));
  if (!name || !(total > 0)){ toast('Informe nome e valor total da dívida.'); return; }
  if (paid > total){ toast('O valor já pago não pode ser maior que o total.'); return; }
  var debt = {name:name, kind: document.getElementById('debtKind').value, creditor: document.getElementById('debtCreditor').value.trim(), totalAmount:total, paidAmount:paid, monthlyPayment:installment, createdAt:Date.now()};
  var saved = await Store.add(k(), 'debts', debt);
  State.debts.push(saved);
  e.target.reset();
  renderDebts(); renderDashboard();
  toast('Dívida “' + name + '” adicionada.');
});

document.getElementById('recvForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var person = document.getElementById('recvPerson').value.trim();
  var typed = money(document.getElementById('recvTotal').value);
  var due = document.getElementById('recvDue').value;
  var kind = document.getElementById('recvKind').value;
  var desc = document.getElementById('recvDesc').value.trim();
  var n = clampInstall(document.getElementById('recvInstall').value);
  var perMode = n > 1 && qs('input[name=recvMode][value=parcela]').checked;
  if (!person || !(typed > 0)){ toast('Informe quem vai pagar e o valor.'); return; }
  if (!validDateStr(due)){ toast('Use uma data entre 1900 e 3000.'); return; }
  var total = perMode ? money(typed * n) : typed;
  var r = {person:person, kind: kind, description: desc, phone: document.getElementById('recvPhone').value.trim(), totalAmount: total, receivedAmount: 0, dueDate: due || null, createdAt: Date.now()};
  if (n > 1){ r.installments = n; r.installmentAmount = perMode ? typed : Math.floor(total * 100 / n) / 100; }
  // Compra feita no meu cartão: pode entrar também na fatura, já parcelada.
  var card = kind === 'cartao' && document.getElementById('recvLaunch').checked ? findById(State.cards, document.getElementById('recvCard').value) : null;
  if (card){
    r.cardId = card.id;
    if (!r.dueDate) r.dueDate = invoiceDates(invoiceKeyFor(todayKey(), card), card).due;
    var tx = {type:'expense', amount: total, category:'compras', categoryLabel: catLabel('compras', 'expense'), date: todayKey(),
      description: desc || 'Compra para ' + person, paymentMethod:'cartao', cardId: card.id, voucherId: null, createdAt: Date.now()};
    await saveTransactions(expandInstallments(tx, n));
  }
  var saved = await Store.add(k(), 'receivables', r);
  State.receivables.push(saved);
  e.target.reset();
  if (card) renderAll(); else { renderReceivables(); renderDashboard(); }
  toast(person + ' foi adicionado(a) em “A receber”' + (n > 1 ? ' em ' + n + 'x' : '') + '.' + (card ? ' A compra entrou na fatura do ' + card.name + '.' : ''));
});

document.getElementById('debtKind').innerHTML = optionsHtml(DEBT_KINDS, 'banco');
document.getElementById('recvKind').innerHTML = optionsHtml(RECV_KINDS, 'emprestimo');
['recvInstall','recvTotal'].forEach(function(id){ document.getElementById(id).addEventListener('input', syncRecvForm); });
document.getElementById('recvForm').addEventListener('change', syncRecvForm);
document.getElementById('recvForm').addEventListener('reset', function(){ setTimeout(syncRecvForm, 0); });

document.getElementById('exportCsvBtn').addEventListener('click', async function(){
  var mb = monthBounds(State.txMonthOffset);
  var tx = txForMonth(mb.key);
  if (!tx.length){ toast('Não há lançamentos neste mês para exportar.'); return; }
  var rows = [['Data','Tipo','Categoria','Descrição','Forma de pagamento','Valor (R$)']];
  tx.forEach(function(t){
    rows.push([t.date, t.type==='income'?'Ganho':'Gasto', catLabel(t.category,t.type,t.categoryLabel), t.description||'', paymentLabel(t) || (t.type==='expense' ? PAYMENT_LABELS.conta : ''), String(t.amount).replace('.',',')]);
  });
  var csv = rows.map(function(r){ return r.map(csvCell).join(';'); }).join('\r\n');
  try{
    await saveFile('grana-leve-' + mb.key + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    toast('Lançamentos baixados.');
  } catch(err){ toast('Não foi possível baixar o arquivo agora.'); }
});

document.getElementById('pdfReportBtn').addEventListener('click', generateMonthlyReport);
document.getElementById('calcHelpBtn').addEventListener('click', calcHelp);

/* ============ Boot ============ */
async function boot(){
  Store.onWriteError = function(){ toast('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.'); };
  await Store.init();
  if (Store.cloudError){
    var retry = await openModal({
      title: 'Não foi possível acessar seus dados',
      body: '<p>O Grana Leve não conseguiu conectar ao armazenamento na nuvem (' + escapeHtml(Store.cloudError) + '). Nada foi apagado.</p>' +
        '<p>Se continuar, esta sessão usa <strong>só este navegador</strong>: o que você lançar agora não aparece nos seus dados da nuvem.</p>',
      submitLabel: 'Tentar de novo', cancelLabel: 'Continuar só neste navegador'
    });
    if (retry){ location.reload(); return; }
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

/* ============ App instalável (PWA) ============ */
var installPrompt = null;
function isStandalone(){ return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches; }
window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  installPrompt = e;
  if (State.session) renderConnections();
});
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}

export function start(){
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
}
