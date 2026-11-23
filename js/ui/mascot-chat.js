/*
 * A conversa com o Grana (parte carregada só na primeira vez que alguém conversa; o desenho e as dicas ficam em mascot.js).
 * O entendimento das perguntas está em domain/mascot.js e roda inteiro no aparelho.
 */
import {ask, topicAnswer, topicIdByLabel} from '../domain/mascot.js';
import {escapeHtml, autoFocus} from './dom.js';
import {openModal} from './modal.js';
import {chatHtml, mascotSvg} from './mascot.js';

var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function scroll(log){ log.scrollTop = log.scrollHeight; }
function userMsg(log, text){
  var d = document.createElement('div'); d.className = 'gr-msg me'; d.innerHTML = '<p>' + escapeHtml(text) + '</p>';
  log.appendChild(d); scroll(log);
}
function chipsHtml(labels){
  return labels && labels.length ? '<div class="gr-chips gr-inline">' + labels.map(function(c){ return '<button type="button" class="gr-chip" data-gr-chip="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>'; }).join('') + '</div>' : '';
}
function botMsg(log, r){
  var d = document.createElement('div'); d.className = 'gr-msg bot';
  d.innerHTML = '<span class="gr-avatar">' + mascotSvg(r.kind === 'none' ? 'think' : 'happy') + '</span><div class="gr-said"><p>' + escapeHtml(r.text) + '</p>' +
    (r.go ? '<button type="button" class="btn btn-primary btn-sm" data-gr-go="' + escapeHtml(r.go.screen) + '">' + escapeHtml(r.go.label) + '</button>' : '') + chipsHtml(r.kind === 'answer' ? r.chips : r.chips) + '</div>';
  log.appendChild(d); scroll(log);
}
function reply(root, r){
  var log = root.querySelector('.gr-log'), typing = document.createElement('div');
  typing.className = 'gr-msg bot gr-typing'; typing.innerHTML = '<span class="gr-avatar">' + mascotSvg('think') + '</span><p aria-label="O Grana está pensando"><i></i><i></i><i></i></p>';
  log.appendChild(typing); scroll(log);
  // Um respiro curto, para a conversa parecer natural (nenhum, para quem pede menos movimento).
  setTimeout(function(){ typing.remove(); botMsg(log, r); }, reduce ? 0 : 420 + Math.min(500, r.text.length * 3));
}

// what: {type: 'ask', value} (pergunta escrita), {type: 'chip', value} (assunto tocado) ou {type: 'topic', value} (id do assunto).
export function interact(root, what, ctx){
  var log = root.querySelector('.gr-log'), chips = root.querySelector('[data-gr-chips]');
  if (chips) chips.hidden = true;   // os assuntos iniciais saem depois da primeira pergunta; as respostas trazem os próximos
  if (what.type === 'topic'){ reply(root, topicAnswer(what.value, ctx) || ask('', ctx)); return; }
  userMsg(log, what.value);
  if (what.type === 'chip'){ var id = topicIdByLabel(what.value); reply(root, id ? topicAnswer(id, ctx) : ask(what.value, ctx)); return; }
  reply(root, ask(what.value, ctx));
}

// A conversa dentro de um pop-up (Início, com conta). topic: já abre explicando um assunto.
export function openChatModal(opts){
  openModal({
    title: 'Converse com o Grana', submitLabel: '', cancelLabel: 'Fechar', body: chatHtml(!!opts.member),
    onOpen: function(modal){
      var root = modal.querySelector('.gr-chat');
      if (opts.topic) interact(root, {type: 'topic', value: opts.topic}, {member: !!opts.member});
      autoFocus(root.querySelector('input'));
    }
  });
}
