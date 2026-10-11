/*
 * Estado da tela (State) e as regras do domínio aplicadas a ele (atalhos usados por todas as abas).
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {todayKey, monthBounds} from '../domain/dates.js';
import {sumMoney, fmtMoney} from '../domain/money.js';
import {findById, uid} from '../domain/util.js';
import * as Cats from '../domain/categories.js';
import * as Tx from '../domain/transactions.js';

import * as Cards from '../domain/cards.js';
import * as Budgets from '../domain/budgets.js';

import * as Accounts from '../domain/accounts.js';
import * as Vouchers from '../domain/vouchers.js';
import * as Fc from '../domain/forecasts.js';
import {URGENCY, urgencyOf, urgencyLabel} from '../domain/urgency.js';

import {Store} from '../data/store.js';
import {escapeHtml, optionsHtml, toast} from './dom.js';

import {renderDebts, renderReceivables} from './commitments-tab.js';
import {renderDashboard} from './home-tab.js';
import {renderGoals} from './planning-tab.js';

/* ============ Regras do domínio aplicadas ao estado atual ============ */
// As regras ficam em js/domain/ (funções puras, testadas em tests/unit). Aqui só ligamos ao State.
export function expenseCats(){ return Cats.expenseCats(State.categories); }
export function incomeCats(){ return Cats.incomeCats(State.categories); }
export function catLabel(id, type, fallback){
  var c = findById(Cats.catsOfType(type, State.categories), id);
  return c ? c.label : (fallback || 'Sem categoria');
}
/* ---------- Urgência (dívidas, a receber e metas) ---------- */
export var URGENCY_MARK = {alta: '🔴', media: '🟡', baixa: '🟢'};
export var URGENCY_RANK = {alta: 0, media: 1, baixa: 2};
export function urgencyOptions(){ return URGENCY.map(function(u){ return {id: u.id, label: URGENCY_MARK[u.id] + ' ' + u.label}; }); }
// Seletor no card: troca a urgência sem abrir nada. coll = 'debts' | 'receivables' | 'goals'.
export function urgencySelectHtml(coll, item, name){
  var u = urgencyOf(item);
  return '<select class="urgency-select u-' + u + '" data-urgency="' + coll + ':' + escapeHtml(item.id) + '" aria-label="Urgência de ' + escapeHtml(name) + '" title="Urgência">' +
    optionsHtml(urgencyOptions(), u) + '</select>';
}
export async function setUrgency(coll, id, value){
  var list = {debts: State.debts, receivables: State.receivables, goals: State.goals}[coll];
  var item = findById(list, id);
  if (!item) return;
  await Store.update(k(), coll, id, {urgency: value});
  item.urgency = value;
  if (coll === 'debts') renderDebts(); else if (coll === 'receivables') renderReceivables(); else renderGoals();
  renderDashboard();
  toast('Urgência de “' + (item.name || item.person) + '” agora é ' + urgencyLabel(value).toLowerCase() + '.');
}

export function catOf(id, type){ return findById(Cats.catsOfType(type, State.categories), id); }
// Selo da categoria: o emoji num círculo da cor dela.
export function catBadge(id, type){
  var c = catOf(id, type);
  return '<span class="cat-badge" style="--cat:' + escapeHtml(c ? c.color : 'var(--text-muted)') + '" aria-hidden="true">' + escapeHtml(c ? c.emoji : Cats.DEFAULT_EMOJI) + '</span>';
}
// Opções de select com o emoji antes do nome.
export function catOptions(list){ return list.map(function(c){ return {id: c.id, label: (c.emoji ? c.emoji + ' ' : '') + c.label}; }); }
export function categoryNameProblem(name, type, exceptId){ return Cats.categoryNameProblem(name, type, State.categories, exceptId); }
export function txLabel(t){ return t.description || catLabel(t.category, t.type, t.categoryLabel); }
export function sortTransactions(){ Tx.sortTransactions(State.transactions); }
// Competência das compras no cartão: o mês em que vence a fatura da parcela (ver Tx.monthOf).
Tx.setMonthResolver(function(t){
  if (t.type !== 'expense' || t.paymentMethod !== 'cartao') return null;
  var c = findById(State.cards, t.cardId);
  return c ? Cards.invoiceDates(Cards.txInvoiceKey(t, c), c).due.slice(0, 7) : null;
});
export function txForMonth(key){ return Tx.txForMonth(State.transactions, key); }
export function monthTotals(key){ return Tx.monthTotals(State.transactions, key, todayKey()); }
export function expenseCategoryTotals(key){ return Tx.expenseCategoryTotals(State.transactions, key); }
export function maxTxMonthOffset(){ return Tx.maxMonthOffset(State.transactions, monthBounds(0).key); }
// Parcelas a partir da data da compra (tx.date); start = primeira ainda não vencida (padrão 1).
export function expandInstallments(tx, n, start){ return Tx.expandPurchase(tx, n, uid(), tx.description || catLabel(tx.category, tx.type), start); }
export function installHint(n, amount, start){ return Tx.installHint(n, amount, fmtMoney, start); }
export function installmentGroups(){ return Tx.installmentGroups(State.transactions, State.cards, todayKey()); }
export function invoiceItems(card, key){ return Cards.invoiceItems(State.transactions, card, key); }
export function invoiceStatus(card, key){ return Cards.invoiceStatus(card, key, todayKey()); }
export function cardUsed(card){ return Cards.cardUsed(State.transactions, card, todayKey()); }
export function forecastOccurrences(key){ return Fc.forecastOccurrences(State.forecasts, key); }
export function voucherOf(t){ return Vouchers.voucherOf(t, State.vouchers); }
export function voucherTx(v){ return Vouchers.voucherTx(v, State.transactions, State.vouchers); }
export function voucherBalance(v){ return Vouchers.voucherBalance(v, State.transactions, State.vouchers, todayKey()); }
export function budgetLimit(key, cat){ return Budgets.budgetLimit(State.budgetBase, State.budgetMonths, key, cat); }
export function budgetLocked(key){ return Budgets.budgetLocked(key, monthBounds(0).key); }
export async function setBudget(key, cat, val){
  var plan = Budgets.planWith(State.budgetBase, State.budgetMonths, key, cat, val);
  await Store.put(k(), 'budgets', 'plan-' + key, {month: key, limits: plan});
  State.budgetMonths[key] = plan;
}
export function accountData(){ return {transactions: State.transactions, transfers: State.transfers, cards: State.cards, accounts: State.accounts}; }
export function accountName(id){ return Accounts.accountName(State.accounts, id); }
export function accountMoves(a){ return Accounts.accountMoves(a, accountData(), todayKey(), txLabel); }
export function accountBalance(a){ return Accounts.accountBalance(a, accountData(), todayKey(), txLabel); }
export function totalAccountsBalance(){ return sumMoney(State.accounts, accountBalance); }

/* ============ App state ============ */
export var State = {
  session: null,        // {emailKey, name, email, expiresAt}
  transactions: [],
  budgetBase: {},       // planejamento antigo, de antes de cada mês ter o seu
  budgetMonths: {},     // {'2026-10': {categoria: valor}}
  goals: [],
  debts: [],
  cards: [],
  receivables: [],
  forecasts: [],
  bills: [],
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
  commitTab: 'dividas',
  sumOpen: {},          // cartões do Início com os detalhes abertos (+)
  dashDetails: false,   // "Ver todos os detalhes do mês" aberto
  research: null,       // consentimento da pesquisa {consent, version, at, ageRange, uf}
  isAdmin: false,       // papel admin confirmado pelo banco (is_admin)
  content: [],          // dicas da aba Aprenda editadas no painel (vazio = dicas padrão)  // parte aberta de Compromissos: 'dividas' (Eu devo) ou 'receber' (Me devem)
  persisted: null,      // o navegador aceitou não apagar os dados sozinho (navigator.storage.persist)
  authTab: 'login'
};

export function k(){ return State.session.emailKey; }
