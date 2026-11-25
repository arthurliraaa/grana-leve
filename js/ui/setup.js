/*
 * Configuração rápida (primeiro uso): três passos para deixar o app útil logo de começo, todos pulavéis.
 *   1. Bancos e cartões: o saldo da conta e, nos cartões, o limite e os dias de fechamento e vencimento (dá para cadastrar vários).
 *   2. Salário: a calculadora e a previsão do “já caiu?” (ou “não tenho salário fixo”).
 *   3. Outras coisas úteis: vale-alimentação, contas fixas, limites por categoria, metas, importar extrato e avisos.
 * Abre depois do tutorial, em Perfil (“Configuração rápida”) e pelos “Primeiros passos” do Início. Parte sob demanda (withPart('setup')).
 */
import {fmtMoney} from '../domain/money.js';
import {getPrefs, setPref} from '../data/session.js';
import {escapeHtml, qs, toast, autoFocus} from './dom.js';
import {openModal} from './modal.js';
import {State} from './state.js';
import {showTab, withPart, renderAll} from './shell.js';
import {addBank} from './accounts-tab.js';
import {hasSalaryData} from './home-tab.js';

var TOTAL = 3;
var added = [];   // bancos cadastrados nesta configuração: [{name, hasAcc, hasCard}]

function stepTitle(n){ return 'Configuração rápida · passo ' + n + ' de ' + TOTAL; }

/* ---------- Passo 1: bancos e cartões ---------- */
function bankBody(){
  return (added.length ? '<p class="setup-added"><strong>Já adicionados:</strong> ' + added.map(function(b){ return '<span class="pill">' + escapeHtml(b.name) + ' · ' + (b.hasAcc && b.hasCard ? 'conta e cartão' : b.hasCard ? 'cartão' : 'conta') + '</span>'; }).join(' ') + '</p>' : '') +
    '<p class="field-hint">Cadastre cada banco onde você tem conta ou cartão de crédito. Com o cartão, o app monta as faturas sozinho e mostra quanto sobra depois de pagá-las. Dá para adicionar vários e editar tudo depois em Contas e cartões.</p>' +
    '<div class="field"><label for="sbName">Nome do banco</label><input id="sbName" name="name" type="text" maxlength="30" autocomplete="off" placeholder="Ex: Nubank, Itaú, Caixa"></div>' +
    '<label class="check"><input type="checkbox" name="hasAcc" checked> Tenho conta neste banco</label>' +
    '<div class="field" data-sb="acc"><label for="sbBalance">Saldo atual da conta</label><span class="money-input"><span>R$</span><input id="sbBalance" name="balance" type="text" data-money autocomplete="off" inputmode="decimal" placeholder="0,00"></span></div>' +
    '<label class="check"><input type="checkbox" name="hasCard"> Tenho cartão de crédito neste banco</label>' +
    '<div data-sb="card" hidden><div class="field"><label for="sbLimit">Limite do cartão</label><span class="money-input"><span>R$</span><input id="sbLimit" name="limit" type="text" data-money autocomplete="off" inputmode="decimal" placeholder="0,00"></span></div>' +
      '<div class="sc-grid"><div class="field"><label for="sbClosing">Dia em que a fatura fecha</label><input id="sbClosing" name="closing" type="number" min="1" max="31" step="1" inputmode="numeric" placeholder="Ex: 3"></div>' +
      '<div class="field"><label for="sbDue">Dia em que vence</label><input id="sbDue" name="due" type="number" min="1" max="31" step="1" inputmode="numeric" placeholder="Ex: 10"></div></div>' +
      '<span class="field-hint">Os dias estão na fatura ou no app do banco.</span></div>' +
    '<div class="setup-more"><button type="button" class="btn btn-ghost btn-sm" data-setup-more>Salvar e adicionar outro banco</button><button type="button" class="btn btn-ghost btn-sm" data-setup-skip>Pular este passo</button></div>';
}
async function saveBank(form){
  var name = form.name.value.trim();
  if (!name) return {empty: true};
  var r = await addBank({name: name, hasAcc: form.hasAcc.checked, balance: form.balance.value, hasCard: form.hasCard.checked, limit: form.limit.value, closing: form.closing.value, due: form.due.value});
  if (r.error) return r;
  added.push({name: name, hasAcc: !!r.acc, hasCard: !!r.card});
  return {ok: true};
}
async function stepBanks(){
  var r = await openModal({
    title: stepTitle(1), submitLabel: 'Continuar', cancelLabel: 'Sair', body: bankBody(),
    onOpen: function(modal, close){
      var form = qs('form', modal);
      function sync(){ qs('[data-sb="acc"]', modal).hidden = !form.hasAcc.checked; qs('[data-sb="card"]', modal).hidden = !form.hasCard.checked; }
      form.hasAcc.addEventListener('change', sync); form.hasCard.addEventListener('change', sync); sync();
      qs('[data-setup-skip]', modal).addEventListener('click', function(){ close({skip: true}); });
      qs('[data-setup-more]', modal).addEventListener('click', async function(){
        var res = await saveBank(form), err = qs('[data-modal-error]', modal);
        if (res.error){ err.textContent = res.error; return; }
        if (res.empty){ err.textContent = 'Escreva o nome do banco.'; return; }
        close({more: true});
      });
    },
    onSubmit: async function(form){
      var res = await saveBank(form);
      if (res.error) return res;
      return {next: true};   // campo vazio = nada a salvar, segue para o próximo passo
    }
  });
  if (!r || r === true) return 'exit';
  return r.more ? 'again' : 'next';
}

/* ---------- Passo 2: salário ---------- */
async function stepSalary(){
  var has = hasSalaryData();
  var r = await openModal({
    title: stepTitle(2), submitLabel: 'Continuar', cancelLabel: 'Sair',
    body: '<p>' + (has ? '<strong>Seu salário já está informado.</strong> Dá para revisar ou acrescentar outro emprego.' : 'Você recebe um salário fixo?') + '</p>' +
      '<p class="field-hint">A calculadora estima o líquido (INSS, imposto, descontos, horas extras, 13º e férias), aceita mais de um emprego e, no dia do pagamento, o Início pergunta “já caiu?”. Se o salário deste mês você já recebeu, dá para marcar isso lá.</p>' +
      '<div class="setup-more"><button type="button" class="btn btn-primary btn-sm" data-setup-salary>' + (has ? 'Revisar o meu salário' : 'Calcular o meu salário') + '</button>' +
      (has ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-setup-nosalary>Não tenho salário fixo</button>') + '</div>',
    onOpen: function(modal, close){
      qs('[data-setup-salary]', modal).addEventListener('click', function(){ close({salary: true}); });
      var no = qs('[data-setup-nosalary]', modal);
      if (no) no.addEventListener('click', function(){ setPref('noSalary', true); close({next: true}); });
    },
    onSubmit: function(){ return {next: true}; }
  });
  if (!r || r === true) return 'exit';
  if (r.salary){ var m = await import('./salary-plan.js'); await m.openSalaryPlan(); return 'next'; }
  return 'next';
}

/* ---------- Passo 3: outras coisas úteis ---------- */
var EXTRAS = [
  {id: 'vale', title: 'Vale-alimentação ou refeição', text: 'Saldo do vale e o dia em que ele cai.'},
  {id: 'fixas', title: 'Contas fixas', text: 'Aluguel, luz, assinaturas: entram sozinhas no dia.'},
  {id: 'limites', title: 'Quanto quero gastar', text: 'Um limite por categoria, com aviso antes de passar.'},
  {id: 'metas', title: 'Uma meta', text: 'Juntar dinheiro para um objetivo.'},
  {id: 'extrato', title: 'Importar o extrato do banco', text: 'Traz os lançamentos de uma vez (OFX, CSV ou PDF).'},
  {id: 'avisos', title: 'Avisos no celular', text: 'Fatura, conta, salário e os seus lembretes.'}
];
async function stepMore(){
  var r = await openModal({
    title: stepTitle(3), submitLabel: 'Concluir', cancelLabel: 'Sair',
    body: '<p class="field-hint">Mais algumas coisas que deixam o app útil de verdade. Toque no que fizer sentido para você agora; o resto fica para depois.</p>' +
      '<div class="setup-grid">' + EXTRAS.map(function(x){ return '<button type="button" class="setup-opt" data-setup-go="' + x.id + '"><strong>' + escapeHtml(x.title) + '</strong><small>' + escapeHtml(x.text) + '</small></button>'; }).join('') + '</div>',
    onOpen: function(modal, close){
      modal.addEventListener('click', function(e){ var b = e.target.closest('[data-setup-go]'); if (b) close({go: b.getAttribute('data-setup-go')}); });
    },
    onSubmit: function(){ return {done: true}; }
  });
  if (!r || r === true) return 'exit';
  return r.go ? r : 'done';
}
function go(id){
  if (id === 'vale'){ showTab('cartoes'); setTimeout(function(){ var f = document.getElementById('voucherForm'); if (f){ f.scrollIntoView({block: 'center'}); autoFocus(document.getElementById('vName')); } }, 200); }
  else if (id === 'fixas'){ showTab('lancamentos'); setTimeout(function(){ var b = document.getElementById('segbtn-fixas'); if (b) b.click(); }, 150); }
  else if (id === 'limites') showTab('limites');
  else if (id === 'metas') showTab('metas');
  else if (id === 'extrato'){ showTab('lancamentos'); withPart('statement', function(m){ m.openStatementImport(); }); }
  else if (id === 'avisos'){ showTab('perfil'); setTimeout(function(){ var h = document.getElementById('pfT10'); if (h) h.scrollIntoView({block: 'start'}); }, 200); }
}

async function runSetup(){
  added = [];
  var step = 1, safety = 0;
  while (step <= TOTAL && safety++ < 30){
    var out = step === 1 ? await stepBanks() : step === 2 ? await stepSalary() : await stepMore();
    if (out === 'exit'){ setPref('setupDone', true); return; }
    if (out === 'again') continue;
    if (out && out.go){ setPref('setupDone', true); go(out.go); return; }
    step++;
  }
  setPref('setupDone', true);
  var n = State.accounts.length + State.cards.length;
  toast(n ? 'Tudo certo! ' + (State.accounts.length ? 'Saldo total das contas: ' + fmtMoney(State.accounts.reduce(function(s, a){ return s + (Number(a.initialBalance) || 0); }, 0)) + '. ' : '') + 'Agora é só lançar os seus gastos pelo botão +.' : 'Configuração concluída. Você pode refazê-la em Perfil.');
}
// Abre a configuração; ao terminar (de qualquer jeito), redesenha as telas: o Início mostra os Primeiros passos já atualizados.
export async function openSetup(){
  try { await runSetup(); } finally { renderAll(); }
}
export function setupDone(){ return !!getPrefs().setupDone; }
