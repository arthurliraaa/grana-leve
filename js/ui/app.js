/*
 * Ponto de entrada da interface do Grana Leve: liga os eventos de cada área e inicia o app.
 *
 * Mapa do código (js/):
 *   domain/   regras puras, sem tela: dinheiro em centavos, datas, faturas, parcelas, saldos, contas
 *             fixas, estornos, divisão de compras… (testadas em tests/unit)
 *   data/     onde os dados ficam: Store (Supabase, navegador ou nuvem do Claude), login, backup
 *   ui/       a tela, uma área por arquivo:
 *     state.js            State (o estado da tela) e atalhos das regras aplicadas a ele
 *     constants.js        textos e listas fixas (dicas, páginas de informação, rótulos)
 *     shell.js            estrutura: telas, topo, navegação entre abas, carregar dados, renderAll
 *     theme.js            tema claro/escuro/automático
 *     home-tab.js         Início (resumo, gráficos, previsões de entrada)
 *     tx-list.js          Ganhos e gastos (lista, filtros, calendário, parcelas, divisão)
 *     tx-edit.js          popup de lançamento, edição, estorno e compra parcelada inteira
 *     accounts-tab.js     contas bancárias, transferências e vales
 *     cards-tab.js        cartões, faturas e relatório por cartão
 *     planning-tab.js     Planejar gastos e Metas
 *     commitments-tab.js  Compromissos: dívidas e A receber
 *     bills.js            Compromissos: contas fixas
 *     chat.js             lançamento por mensagem
 *     learn-tab.js        Aprenda e Conexões
 *     reports.js          relatórios em PDF (pdf.js gera e mostra)
 *     online.js           conta no servidor: login, cadastro, links de e-mail, registro do estudo
 *     my-data.js          seus dados: backup, pesquisa, páginas de informação, excluir conta
 *     profile.js, admin.js, calendar.js, brand-picker.js, password.js, captcha.js, pwa.js
 *     dom.js, modal.js, charts.js  peças reaproveitadas pela tela toda
 *
 * Cada área exporta uma função wireX() com os seus eventos; aqui elas são chamadas em ordem.
 */
import {initAdmin} from './admin.js';
import {initProfile} from './profile.js';
import {initBills} from './bills.js';
import {Store} from '../data/store.js';
import {saveSession} from '../data/session.js';
import {wireWallet} from './accounts-tab.js';
import {wireCommitments} from './commitments-tab.js';
import {TIPS, TIPS_GROW} from './constants.js';
import {wireHome} from './home-tab.js';
import {renderLearn} from './learn-tab.js';
import {dataModal, deleteMyAccount, researchModal, researchStatusHtml} from './my-data.js';
import {siteUrl, wireAuth} from './online.js';
import {wirePlanning} from './planning-tab.js';
import {wirePwa} from './pwa.js';
import {boot, logout, renderAll, wireShell} from './shell.js';
import {State, catLabel, catOptions, expenseCats, k} from './state.js';
import {setThemePref, themePref, wireTheme} from './theme.js';
import {saveTransactions} from './tx-edit.js';
import {applyPayment, paymentOptions, wireTransactions} from './tx-list.js';

// Liga os eventos de cada área (cada função fica no módulo da área).
wireTheme();
wireShell();
wireAuth();
wireHome();
wireTransactions();
wireWallet();
wirePlanning();
wireCommitments();
wirePwa();

initAdmin({state: function(){ return State; }, defaults: {tip: TIPS, tip_grow: TIPS_GROW}, onContentChange: renderLearn, siteUrl: siteUrl});
initBills({
  state: function(){ return State; }, k: k, paymentOptions: paymentOptions, applyPayment: applyPayment,
  catOptions: function(){ return catOptions(expenseCats()); }, catLabel: function(id){ return catLabel(id, 'expense'); }, renderAll: renderAll,
  addTx: async function(tx){ var list = await saveTransactions([tx]); return list[0]; },
  removeTx: async function(id){ await Store.remove(k(), 'transactions', id); State.transactions = State.transactions.filter(function(t){ return t.id !== id; }); }
});
initProfile({
  state: function(){ return State; },
  onNameChange: function(name){
    State.session.name = name;
    if (Store.mode !== 'supabase') saveSession(State.session);
    renderAll();
  },
  themePref: themePref, setThemePref: setThemePref,
  openResearch: researchModal, researchStatus: researchStatusHtml,
  openData: dataModal, deleteAccount: deleteMyAccount, logout: logout, siteUrl: siteUrl
});

export function start(){
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
}
