/*
 * Ajuda e sugestões: a mensagem vai para o Grana Leve (tabela feedback, vista no painel de
 * administração e, se configurado, copiada para o e-mail do projeto). Sem servidor (versão só no
 * navegador) ou se o envio falhar, abre o e-mail da pessoa já com a mensagem pronta.
 */
import {CONTACT_EMAIL} from '../config.js';
import {Store} from '../data/store.js';
import {qs, escapeHtml, icon} from './dom.js';
import {getPrefs, setPref} from '../data/session.js';
import {openModal} from './modal.js';
import {State} from './state.js';

// Tempo mínimo entre duas mensagens (contra envios repetidos e spam).
export var FEEDBACK_COOLDOWN_MS = 60000;
var KINDS = [
  {id: 'ajuda', title: 'Preciso de ajuda', hint: 'Não sei fazer algo ou algo não ficou claro.'},
  {id: 'melhoria', title: 'Tenho uma sugestão', hint: 'Uma ideia para o Grana Leve ficar melhor.'},
  {id: 'problema', title: 'Encontrei um problema', hint: 'Algo deu errado ou mostrou um valor estranho.'}
];
function mailto(kind, message){
  var k = KINDS.filter(function(x){ return x.id === kind; })[0];
  return 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('[Grana Leve] ' + (k ? k.title : 'Mensagem')) + '&body=' + encodeURIComponent(message);
}
export async function openFeedback(kind){
  var online = !!Store.sendFeedback;   // só a conta online tem
  await openModal({
    title: 'Ajuda e sugestões',
    body: '<fieldset class="option-cards fb-kinds"><legend class="sr-only">Sobre o quê?</legend>' + KINDS.map(function(x){
        return '<label class="option-card"><input type="radio" name="kind" value="' + x.id + '"' + (x.id === (kind || 'ajuda') ? ' checked' : '') + '>' +
          '<span><strong>' + x.title + '</strong><small>' + x.hint + '</small></span></label>';
      }).join('') + '</fieldset>' +
      '<div class="field"><label for="fbMsg">Sua mensagem</label><textarea id="fbMsg" name="msg" rows="5" maxlength="2000" placeholder="Conte com suas palavras. Se for um problema, diga em qual tela e o que você fez."></textarea></div>' +
      '<p class="field-hint">Primeira vez por aqui? <button type="button" class="linklike" data-tutorial>Ver o tutorial de primeiros passos</button>.</p>' +
      '<p class="field-hint">' + (online ? 'A resposta vai para o seu e-mail (' + escapeHtml(State.session ? State.session.email : '') + '). Não mande senhas nem dados de cartão.' :
        'Vai abrir o seu e-mail com a mensagem pronta para ' + escapeHtml(CONTACT_EMAIL) + '. Não mande senhas nem dados de cartão.') + '</p>',
    submitLabel: online ? 'Enviar' : 'Abrir meu e-mail',
    onSubmit: async function(form){
      var msg = form.msg.value.trim();
      if (msg.length < 5) return {error: 'Escreva a sua mensagem (pelo menos algumas palavras).'};
      if (!online){ location.href = mailto(form.kind.value, msg); return {mail: true}; }
      var wait = FEEDBACK_COOLDOWN_MS - (Date.now() - (Number(getPrefs().lastFeedbackAt) || 0));
      if (wait > 0) return {error: 'Sua última mensagem acabou de ser enviada. Aguarde ' + Math.ceil(wait / 1000) + ' segundos para enviar outra.'};
      var send = form.querySelector('button[type=submit]');
      send.disabled = true; send.textContent = 'Enviando…';
      try {
        await Store.sendFeedback(form.kind.value, msg, State.activeTab || '');
        setPref('lastFeedbackAt', Date.now());
        // Confirmação à vista: troca o formulário por um aviso e fecha sozinho em seguida.
        form.innerHTML = '<div class="fb-done" role="status"><span class="fb-done-ico" aria-hidden="true">' + icon('check') + '</span><strong>Mensagem enviada!</strong>' +
          '<p>Obrigado. A resposta chega no seu e-mail.</p></div>';
        await new Promise(function(ok){ setTimeout(ok, 1900); });
        return {sent: true};
      }
      catch(e){
        send.disabled = false; send.textContent = 'Enviar';
        if (e.offline) return {error: e.userMessage};
        if (/muitas mensagens/.test(e.userMessage || '')) return {error: e.userMessage};
        // Servidor sem a tabela (migração não rodada) ou outro erro: oferece o e-mail.
        var link = qs('#modalRoot [data-modal-error]');
        if (link) link.innerHTML = 'Não deu para enviar pelo app agora. <a href="' + escapeHtml(mailto(form.kind.value, msg)) + '">Enviar pelo seu e-mail</a>.';
        return {keepOpen: true};
      }
    }
  });

}
