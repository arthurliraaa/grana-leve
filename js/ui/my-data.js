/*
 * Seus dados: pesquisa acadêmica, backup, páginas de informação e exclusão da conta.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */
import {ONLINE_PAGES} from './constants.js';
import {toDateKey, formatDateFull} from '../domain/dates.js';
import * as Research from '../domain/research.js';
import {termHtml} from './research-term.js';
import {renderProfile} from './profile.js';

import {Store} from '../data/store.js';
import {readBackup} from '../data/backup.js';
import {getPrefs, setPref, prefsKey} from '../data/session.js';

import {qs, escapeHtml, optionsHtml, icon, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {HOW_TO, INFO_PAGES} from './constants.js';
import {backupCounts, daysAgoText, exportBackup, loadAllData, logout, renderAll} from './shell.js';
import {State, k} from './state.js';

/* ---------- Pesquisa acadêmica: participar ou sair ---------- */
export function researchStatusHtml(){
  var r = State.research;
  if (Research.isParticipating(r)) return 'Você participa do estudo desde ' + formatDateFull(r.at.slice(0, 10)) + ' (termo versão ' + r.version + ').';
  if (r && r.consent) return 'O termo foi atualizado. Leia a versão nova para continuar participando.';
  return 'Você não participa do estudo.';
}
export async function researchModal(){
  var on = Research.isParticipating(State.research);
  var r = await openModal({
    title: on ? 'Sair do estudo?' : 'Participar do estudo', wide: true,
    body: termHtml(Store.mode === 'supabase') + (on ? '<p><strong>Ao sair</strong>, nada mais é registrado para o estudo e os dados ligados ao seu código são apagados.</p>' :
      '<label class="check"><input type="checkbox" name="accept"> Tenho 18 anos ou mais e aceito participar do estudo</label>' +
      '<div class="research-profile">' +
        '<div class="field"><label for="rmAge">Faixa etária (opcional)</label><select id="rmAge" name="age">' + optionsHtml(Research.AGE_RANGES, '') + '</select></div>' +
        '<div class="field"><label for="rmUf">Estado (opcional)</label><select id="rmUf" name="uf">' + optionsHtml(ufOptions(), '') + '</select></div>' +
      '</div>'),
    submitLabel: on ? 'Sair do estudo' : 'Participar', danger: on,
    onSubmit: function(form){
      if (on) return {accept: false};
      if (!form.accept.checked) return {error: 'Para participar, marque que tem 18 anos ou mais e aceita o termo.'};
      return {accept: true, age: form.age.value, uf: form.uf.value};
    }
  });
  if (!r) return;
  try {
    if (Store.mode === 'supabase') State.research = r.accept ? await Store.studyJoin(Research.TERM_VERSION, r.age, r.uf) : await Store.studyWithdraw();
    else {
      State.research = Research.consentRecord(r.accept, r.age, r.uf);
      await Store.updateUser(k(), {research: State.research});
    }
  } catch(err){ toast('Não foi possível registrar sua escolha agora. Tente de novo.'); return; }
  toast(r.accept ? 'Obrigado! Sua participação no estudo foi registrada.' : 'Você saiu do estudo.');
  if (State.activeTab === 'perfil') renderProfile();
}
export function ufOptions(){ return [{id: '', label: 'Prefiro não dizer'}].concat(Research.UFS.map(function(u){ return {id: u, label: u}; })); }

export async function dataModal(){
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
    body: '<div class="storage-status">' + icon('lock') + '<div><strong>' + (local ? 'Onde ficam: só neste navegador' : Store.mode === 'supabase' ? 'Onde ficam: na sua conta' : 'Onde ficam: na nuvem deste app') + '</strong>' +
        (local ? '<ul><li>Não sincroniza com outros aparelhos e não tem recuperação de senha.</li><li>Proteção: ' + persistText + '</li>' +
          '<li>Último backup: <strong>' + (last ? formatDateFull(toDateKey(new Date(last))) + ' (' + daysAgoText(last) + ')' : 'nunca') + '</strong></li></ul>' :
          (Store.mode === 'supabase' ? '<p>Na sua conta, num servidor no Brasil (São Paulo). Aparecem em qualquer aparelho em que você entrar, e só você vê seus lançamentos.</p>' :
            '<p>Seus dados ficam salvos no armazenamento do app e aparecem onde você abrir este app.</p>')) +
      '</div></div>' +
      '<div class="tip-box"><strong>Agora você tem:</strong> ' + backupCounts() + '.</div>' +
      '<div class="research-status"><strong>Pesquisa acadêmica</strong><span id="researchStatus">' + researchStatusHtml() + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-research>' + (Research.isParticipating(State.research) ? 'Sair do estudo' : 'Participar do estudo') + '</button></div>' +
      '<p>O backup é um arquivo com todos os seus dados e preferências. Guarde fora deste aparelho (no Google Drive, por exemplo).</p>' +
      '<div class="pdf-actions"><button type="button" class="btn btn-primary btn-sm" data-backup="export">Salvar backup</button></div>' +
      '<h4>Restaurar um backup</h4>' +
      '<p>Escolha um arquivo salvo antes. Ele <strong>substitui</strong> os dados atuais desta conta. Sua senha não muda.</p>' +
      '<input type="file" id="backupFile" accept="application/json,.json" aria-label="Arquivo de backup">' +
      '<p class="form-error" id="backupError" role="alert"></p>',
    submitLabel: null, cancelLabel: 'Fechar',
    onOpen: function(modal, close){
      qs('[data-backup="export"]', modal).addEventListener('click', function(){ exportBackup().then(function(){ close(null); }); });
      qs('[data-research]', modal).addEventListener('click', function(){ close(null); researchModal(); });
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

export async function showInfo(id){
  if (id === 'backup'){ dataModal(); return; }
  if (Store.mode === 'supabase' && ONLINE_PAGES[id]){
    var online = ONLINE_PAGES[id];
    var del = id === 'privacidade' && State.session;
    var go = await openModal({title: online.title, body: online.body, wide: true,
      submitLabel: del ? 'Apagar minha conta e dados' : null, danger: true, cancelLabel: 'Fechar'});
    if (go && del) deleteMyAccount();
    return;
  }
  if (id === 'pesquisa'){
    await openModal({title: 'Termo de consentimento da pesquisa', wide: true, body: termHtml(Store.mode === 'supabase'), submitLabel: null, cancelLabel: 'Fechar'});
    return;
  }
  var page = INFO_PAGES[id];
  if (id === 'como-usar'){
    page = {title:'Como usar o Grana Leve', body:'<ol class="howto-list">' + HOW_TO.map(function(h){ return '<li><strong>' + escapeHtml(h[0]) + '</strong> ' + escapeHtml(h[1]) + '</li>'; }).join('') + '</ol>'};
  }
  var canDelete = id === 'privacidade' && State.session;
  var r = await openModal({
    title: page.title, body: page.body, wide: false,
    submitLabel: canDelete ? 'Apagar minha conta e dados' : null, danger: true, cancelLabel: 'Fechar'
  });
  if (r && canDelete) deleteMyAccount();
}
export async function deleteMyAccount(){
  var ok = await confirmAction({title:'Apagar conta?', message: Store.mode === 'supabase' ?
    'Sua conta, todos os seus lançamentos, cartões, metas, dívidas, valores a receber e a participação no estudo serão apagados do servidor. Isso não pode ser desfeito.' :
    'Todos os seus lançamentos, cartões, metas, dívidas e valores a receber serão apagados deste navegador. Isso não pode ser desfeito.', confirmLabel:'Apagar tudo'});
  if (!ok) return;
  try { await Store.deleteUser(k()); }
  catch(err){ toast('Não foi possível excluir a conta agora. Tente de novo.'); return; }
  try{ localStorage.removeItem(prefsKey()); } catch(e){}
  State.session = State.session && Store.mode === 'supabase' ? null : State.session;
  logout();
  toast('Conta e dados apagados.');
}
