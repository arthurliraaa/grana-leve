/*
 * Painel de administração. Toda permissão é verificada no banco (funções admin_* em
 * supabase/migrations): esconder o menu é só conforto, não segurança.
 * Esta área nunca lê lançamentos nem valores de ninguém.
 */
import {Store} from '../data/store.js';
import {authMessage} from '../data/supabase.js';
import {qs, qsa, escapeHtml, optionsHtml, icon, toast, saveFile, csvCell} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {formatDateFull, todayKey} from '../domain/dates.js';

var ctx = null;          // {state(): State, defaults: {tip: [...], tip_grow: [...]}, onContentChange(), siteUrl()}
var section = 'metricas';
var accounts = [];        // última lista de contas carregada
var accountFilter = '';

var EVENT_LABELS = {
  'usou:chat': 'Usou o lançamento por mensagem', 'salvou:chat': 'Salvou pelo chat', 'corrigiu:chat': 'Corrigiu o que o chat entendeu',
  'abriu:inicio': 'Abriu Início', 'abriu:lancamentos': 'Abriu Ganhos e gastos', 'abriu:contas': 'Abriu Contas e cartões',
  'abriu:planejar': 'Abriu Planejar gastos', 'abriu:metas': 'Abriu Metas', 'abriu:compromissos': 'Abriu Compromissos',
  'abriu:aprenda': 'Abriu Aprenda', 'abriu:conexoes': 'Abriu Conexões'
};
var FIELD_LABELS = {category: 'Categoria', date: 'Data', amount: 'Valor', payment: 'Forma de pagamento', type: 'Gasto/ganho', description: 'Descrição'};
var KIND_LABELS = [{id: 'tip', label: 'Organizar o dinheiro'}, {id: 'tip_grow', label: 'Fazer o dinheiro render'}];

function dateBr(ts){ return ts ? formatDateFull(String(ts).slice(0, 10)) : '—'; }
function body(){ return document.getElementById('adminBody'); }
function loading(){ body().innerHTML = '<p class="empty-state">Carregando…</p>'; }
function failed(err){
  body().innerHTML = '<p class="empty-state">Não foi possível carregar: ' + escapeHtml(/42501|restrit/i.test(String(err && (err.message || err))) ? 'acesso restrito à administração.' : 'verifique a internet.') + '</p>';
}
function bars(title, obj, labels){
  var entries = Object.keys(obj || {}).map(function(k){ return [k, Number(obj[k])]; }).sort(function(a, b){ return b[1] - a[1]; });
  if (!entries.length) return '<div class="card"><h3>' + title + '</h3><p class="tx-meta">Ainda sem dados.</p></div>';
  var max = entries[0][1] || 1;
  return '<div class="card"><h3>' + title + '</h3><div class="report-bars">' + entries.map(function(e){
    return '<div class="report-bar"><span>' + escapeHtml((labels && labels[e[0]]) || e[0]) + '</span><span class="bar-track"><span style="width:' + (100 * e[1] / max) + '%"></span></span><strong class="tabular">' + e[1] + '</strong></div>';
  }).join('') + '</div></div>';
}

/* ---------- Métricas ---------- */
async function renderMetrics(){
  loading();
  var m;
  try { m = await Store.adminMetrics(); } catch(e){ failed(e); return; }
  function tile(label, v, sub){ return '<div class="tile"><span class="tile-lbl">' + label + '</span><span class="tile-val tabular">' + v + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>'; }
  var corrections = Object.keys(m.chat_corrections || {}).reduce(function(n, k){ return n + Number(m.chat_corrections[k]); }, 0);
  body().innerHTML =
    '<div class="card-head"><p class="tx-meta">Atualizado agora · só números agregados</p><button class="btn btn-ghost btn-sm" type="button" data-adm-refresh>Atualizar</button></div>' +
    '<div class="stat-tiles stat-tiles-auto">' +
      tile('Contas', m.accounts, m.accounts_new_7d + ' novas em 7 dias') +
      tile('Ativas em 7 dias', m.active_7d, 'gravaram algo na semana') +
      tile('Participantes do estudo', m.participants, m.accounts ? Math.round(100 * m.participants / m.accounts) + '% das contas' : '') +
      tile('Chat salvo / corrigido', m.chat_saves + ' / ' + corrections, m.chat_saves ? 'correções por salvamento: ' + (corrections / m.chat_saves).toFixed(1) : '') +
      tile('Bloqueadas', m.blocked) +
    '</div>' +
    '<div class="admin-grid">' +
      bars('Uso nos últimos 30 dias (participantes)', m.events_30d, EVENT_LABELS) +
      bars('Correções do chat por campo', m.chat_corrections, FIELD_LABELS) +
      bars('Faixa etária dos participantes', m.age_ranges) +
      bars('Estado dos participantes', m.ufs) +
    '</div>';
}

/* ---------- Contas ---------- */
function accountRows(){
  var me = ctx.state().session.emailKey;
  var q = accountFilter.toLowerCase();
  var list = accounts.filter(function(a){ return !q || (a.email || '').toLowerCase().indexOf(q) >= 0 || (a.name || '').toLowerCase().indexOf(q) >= 0; });
  if (!list.length) return '<p class="empty-state">Nenhuma conta encontrada.</p>';
  return '<div class="table-scroll"><table class="data-table admin-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Criada</th><th>Último acesso</th><th>Estudo</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    list.map(function(a){
      var self = a.id === me;
      return '<tr><td>' + escapeHtml(a.name || '—') + '</td><td>' + escapeHtml(a.email) + '</td><td class="tabular">' + dateBr(a.created_at) + '</td><td class="tabular">' + dateBr(a.last_sign_in_at) + '</td>' +
        '<td>' + (a.participating ? 'Participa' : '—') + '</td>' +
        '<td>' + (a.role === 'admin' ? '<span class="pill brand">Admin</span> ' : '') + (a.blocked ? '<span class="status-pill critical">Bloqueada</span>' : '<span class="status-pill good">Ativa</span>') + '</td>' +
        '<td class="admin-actions">' + (self ? '<span class="tx-meta">você</span>' :
          '<button class="btn btn-ghost btn-sm" type="button" data-adm-reset="' + a.id + '">Redefinir senha</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-adm-block="' + a.id + '" data-blocked="' + a.blocked + '">' + (a.blocked ? 'Desbloquear' : 'Bloquear') + '</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-adm-delete="' + a.id + '">Excluir</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
async function renderAccounts(reload){
  if (reload !== false){
    loading();
    try { accounts = await Store.adminAccounts(); } catch(e){ failed(e); return; }
  }
  body().innerHTML =
    '<div class="admin-toolbar"><input type="search" id="admSearch" class="chat-input" maxlength="80" placeholder="Buscar por nome ou e-mail" aria-label="Buscar contas" value="' + escapeHtml(accountFilter) + '">' +
      '<span class="tx-meta">' + accounts.length + ' conta(s)</span></div>' +
    '<p class="field-hint">“Redefinir senha” manda para a pessoa o e-mail de criar nova senha; você não vê nem define a senha. Excluir apaga a conta, os dados e a participação no estudo, sem volta: use só a pedido da pessoa (direito de exclusão da LGPD).</p>' +
    '<div id="admAccounts">' + accountRows() + '</div>';
}

/* ---------- Conteúdos (aba Aprenda) ---------- */
function contentList(){ return ctx.state().content || []; }
async function reloadContent(){
  ctx.state().content = await Store.listContent();
  ctx.onContentChange();
}
function renderContents(){
  var list = contentList();
  body().innerHTML = (list.length ?
      '<p class="field-hint">A aba Aprenda mostra as dicas abaixo, na ordem da posição.</p>' :
      '<div class="tip-box"><strong>A aba Aprenda está usando as dicas padrão do app.</strong> Para editar, copie as dicas padrão para cá primeiro.' +
        '<div class="card-actions" style="margin-top:8px"><button class="btn btn-primary btn-sm" type="button" data-adm-seed>Copiar dicas padrão para editar</button></div></div>') +
    '<div class="card-actions"><button class="btn btn-ghost btn-sm" type="button" data-adm-new>' + icon('plus') + 'Nova dica</button></div>' +
    KIND_LABELS.map(function(k){
      var items = list.filter(function(c){ return c.kind === k.id; });
      return '<section class="cat-section"><h4>' + k.label + '</h4>' + (items.length ? items.map(function(c){
        return '<div class="list-row"><span class="pill">' + c.position + '</span><div class="tx-main"><div class="tx-desc">' + escapeHtml(c.data.title || '') + '</div><div class="tx-meta">' + escapeHtml(c.data.tag || '') + '</div></div>' +
          '<button class="tx-del tx-edit" type="button" data-adm-edit="' + escapeHtml(c.id) + '" aria-label="Editar ' + escapeHtml(c.data.title || '') + '" title="Editar">' + icon('edit') + '</button>' +
          '<button class="tx-del" type="button" data-adm-del="' + escapeHtml(c.id) + '" aria-label="Excluir ' + escapeHtml(c.data.title || '') + '" title="Excluir">' + icon('trash') + '</button></div>';
      }).join('') : '<p class="tx-meta">Nenhuma dica nesta seção.</p>') + '</section>';
    }).join('');
}
async function editContent(id){
  var c = id ? contentList().filter(function(x){ return x.id === id; })[0] : {id: 'dica-' + Date.now().toString(36), kind: 'tip', position: contentList().length + 1, data: {}};
  var r = await openModal({
    title: id ? 'Editar dica' : 'Nova dica', wide: true,
    body: '<div class="field"><label for="acKind">Seção</label><select id="acKind" name="kind">' + optionsHtml(KIND_LABELS, c.kind) + '</select></div>' +
      '<div class="field"><label for="acTag">Etiqueta</label><input id="acTag" name="tag" type="text" maxlength="40" value="' + escapeHtml(c.data.tag || '') + '" placeholder="Ex: Planejamento mensal"></div>' +
      '<div class="field"><label for="acTitle">Título</label><input id="acTitle" name="title" type="text" maxlength="80" value="' + escapeHtml(c.data.title || '') + '"></div>' +
      '<div class="field"><label for="acText">Texto</label><textarea id="acText" name="text" rows="6" maxlength="700">' + escapeHtml(c.data.text || '') + '</textarea></div>' +
      '<div class="field"><label for="acPos">Posição</label><input id="acPos" name="pos" type="number" min="0" max="999" step="1" value="' + c.position + '"></div>',
    submitLabel: 'Salvar dica',
    onSubmit: async function(form){
      var data = {tag: form.tag.value.trim(), title: form.title.value.trim(), text: form.text.value.trim()};
      if (!data.title || !data.text) return {error: 'Preencha o título e o texto.'};
      try { await Store.adminSaveContent(c.id, form.kind.value, Math.max(0, Math.round(Number(form.pos.value) || 0)), data); }
      catch(e){ return {error: 'Não foi possível salvar. Verifique se você ainda é admin e se há internet.'}; }
      return true;
    }
  });
  if (!r) return;
  await reloadContent();
  renderContents();
  toast('Dica salva. A aba Aprenda já mostra a versão nova.');
}
async function seedContent(){
  var d = ctx.defaults, pos = 0, all = [];
  ['tip', 'tip_grow'].forEach(function(kind){ d[kind].forEach(function(t){ all.push([kind, ++pos, t]); }); });
  try {
    for (var i = 0; i < all.length; i++) await Store.adminSaveContent('padrao-' + all[i][1], all[i][0], all[i][1], {tag: all[i][2].tag, title: all[i][2].title, text: all[i][2].text});
  } catch(e){ toast('Não foi possível copiar as dicas agora.'); return; }
  await reloadContent();
  renderContents();
  toast(all.length + ' dicas copiadas. Agora dá para editar.');
}

/* ---------- Estudo ---------- */
function renderStudy(){
  body().innerHTML = '<div class="card"><h3>Exportar dados do estudo</h3>' +
    '<p class="card-sub">CSV anonimizado, só de quem aceitou o termo: código aleatório do participante, evento, campo corrigido (quando houver), data e hora, faixa etária e estado. Sem nomes, e-mails, valores ou textos.</p>' +
    '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-adm-export>Baixar CSV do estudo</button></div>' +
    '<p class="field-hint">Antes de usar dados reais no trabalho, confirme com o orientador se o estudo precisa de aprovação do Comitê de Ética em Pesquisa.</p></div>';
}
async function exportStudy(){
  var rows;
  try { rows = await Store.adminExportStudy(); } catch(e){ toast('Não foi possível exportar agora.'); return; }
  var head = ['participante', 'evento', 'campo', 'quando', 'faixa_etaria', 'uf'];
  var csv = [head].concat(rows.map(function(r){ return head.map(function(h){ return r[h] == null ? '' : r[h]; }); }))
    .map(function(r){ return r.map(csvCell).join(';'); }).join('\r\n');
  await saveFile('grana-leve-estudo-' + todayKey() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  toast(rows.length + ' registro(s) exportado(s).');
}

/* ---------- Navegação e ações ---------- */
export function renderAdmin(){
  if (!ctx || !ctx.state().isAdmin){ body().innerHTML = '<p class="empty-state">Área restrita à administração.</p>'; return; }
  qsa('[data-admin]').forEach(function(b){
    var on = b.getAttribute('data-admin') === section;
    b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
  });
  ({metricas: renderMetrics, contas: renderAccounts, conteudos: renderContents, estudo: renderStudy})[section]();
}

export function initAdmin(context){
  ctx = context;
  qsa('[data-admin]').forEach(function(b){
    b.addEventListener('click', function(){ section = b.getAttribute('data-admin'); renderAdmin(); });
  });
  var panel = document.getElementById('tab-admin');
  panel.addEventListener('input', function(e){
    if (e.target.id !== 'admSearch') return;
    accountFilter = e.target.value;
    qs('#admAccounts').innerHTML = accountRows();
  });
  panel.addEventListener('click', async function(e){
    var b;
    if (e.target.closest('[data-adm-refresh]')){ renderMetrics(); return; }
    if (e.target.closest('[data-adm-export]')){ exportStudy(); return; }
    if (e.target.closest('[data-adm-seed]')){ seedContent(); return; }
    if (e.target.closest('[data-adm-new]')){ editContent(null); return; }
    if ((b = e.target.closest('[data-adm-edit]'))){ editContent(b.getAttribute('data-adm-edit')); return; }
    if ((b = e.target.closest('[data-adm-del]'))){
      var cid = b.getAttribute('data-adm-del');
      if (!(await confirmAction({title: 'Excluir dica?', message: 'A dica sai da aba Aprenda para todo mundo.'}))) return;
      try { await Store.adminDeleteContent(cid); } catch(err){ toast('Não foi possível excluir agora.'); return; }
      await reloadContent(); renderContents();
      return;
    }
    if ((b = e.target.closest('[data-adm-reset]'))){
      var racc = accounts.filter(function(a){ return a.id === b.getAttribute('data-adm-reset'); })[0];
      if (!(await confirmAction({title: 'Enviar redefinição de senha?', danger: false, confirmLabel: 'Enviar e-mail',
        message: 'Vamos mandar para ' + racc.email + ' o e-mail com o link para criar uma nova senha. Você não vê nem define a senha, e a senha atual continua valendo até a pessoa criar a nova.' +
          (racc.blocked ? ' Atenção: a conta está bloqueada; mesmo com a senha nova, ela só volta a acessar depois de desbloqueada.' : '')}))) return;
      try { await Store.resetPassword(racc.email, ctx.siteUrl()); }
      catch(err){ toast(authMessage(err.cause || err)); return; }
      toast('E-mail de redefinição enviado para ' + racc.email + '.');
      return;
    }
    if ((b = e.target.closest('[data-adm-block]'))){
      var id = b.getAttribute('data-adm-block'), blocked = b.getAttribute('data-blocked') === 'true';
      var acc = accounts.filter(function(a){ return a.id === id; })[0];
      if (!(await confirmAction({title: blocked ? 'Desbloquear conta?' : 'Bloquear conta?', danger: !blocked, confirmLabel: blocked ? 'Desbloquear' : 'Bloquear',
        message: (blocked ? 'A conta ' : 'A conta ') + acc.email + (blocked ? ' volta a acessar os próprios dados.' : ' deixa de acessar os próprios dados até ser desbloqueada. Nada é apagado.')}))) return;
      try { await Store.adminSetBlocked(id, !blocked); } catch(err){ toast('Não foi possível alterar agora.'); return; }
      toast(blocked ? 'Conta desbloqueada.' : 'Conta bloqueada.');
      renderAccounts();
      return;
    }
    if ((b = e.target.closest('[data-adm-delete]'))){
      var did = b.getAttribute('data-adm-delete');
      var dacc = accounts.filter(function(a){ return a.id === did; })[0];
      if (!(await confirmAction({title: 'Excluir conta?', confirmLabel: 'Excluir de vez',
        message: 'A conta ' + dacc.email + ', todos os dados dela e a participação no estudo serão apagados. Isso não pode ser desfeito. Faça isso só a pedido da pessoa.'}))) return;
      try { await Store.adminDeleteAccount(did); } catch(err){ toast('Não foi possível excluir agora.'); return; }
      toast('Conta excluída.');
      renderAccounts();
    }
  });
}
