/*
 * Grana, o mascote do app: um bichinho redondo e verde (uma “semente de grana” com folhinha) que tira dúvidas.
 *   - Página inicial (sem conta): o mascote grande e uma conversa para perguntar o que o app pode fazer, mais as novidades.
 *   - Início (com conta): o mascote animado, que fala dicas e abre a conversa ao toque; e o cartão de novidades.
 * Esta parte é leve e fica sempre carregada (desenho, animação, dicas). A conversa e o entendimento das perguntas
 * (domain/mascot.js + ui/mascot-chat.js) só são baixados na primeira vez que alguém conversa.
 */
import {CHANGELOG} from '../domain/changelog.js';
import {formatDateFull} from '../domain/dates.js';
import {escapeHtml, icon} from './dom.js';
import {State} from './state.js';
import {mascotSvg, nextId} from './mascot-art.js';
export {mascotSvg};
import {withPart, showTab} from './shell.js';
import {newsCardRelease, dismissNewsCard, openWhatsNew} from './whats-new.js';

var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function setMood(svg, mood, ms){
  if (!svg) return;
  svg.setAttribute('data-mood', mood);
  clearTimeout(svg._moodT);
  if (ms) svg._moodT = setTimeout(function(){ svg.setAttribute('data-mood', 'idle'); }, ms);
}
function jump(el){
  if (reduce || !el) return;
  el.classList.remove('gr-jump'); void el.offsetWidth; el.classList.add('gr-jump');
  setTimeout(function(){ el.classList.remove('gr-jump'); }, 700);
}
// Os olhos acompanham o ponteiro (só onde há mouse; no toque ficam parados).
var followBound = false;
function bindEyes(){
  if (followBound || reduce || typeof matchMedia !== 'function' || !matchMedia('(hover: hover)').matches) return;
  followBound = true;
  var raf = 0;
  document.addEventListener('pointermove', function(e){
    if (raf) return;
    raf = requestAnimationFrame(function(){
      raf = 0;
      document.querySelectorAll('.gr-svg').forEach(function(svg){
        var r = svg.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * .55), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220);
        svg.style.setProperty('--px', (dx / d * 3.2 * k).toFixed(2) + 'px');
        svg.style.setProperty('--py', (dy / d * 3.2 * k).toFixed(2) + 'px');
      });
    });
  }, {passive: true});
}

/* ---------- conversa (carregada só ao conversar) ---------- */
export function chatHtml(member){
  var inId = nextId();
  var greet = member ? 'Oi' + (State.session && State.session.name ? ', ' + escapeHtml(State.session.name.split(' ')[0]) : '') + '! Eu sou o Grana 💚 Pergunte o que quiser sobre o app, do seu jeito.'
    : 'Oi! Eu sou o Grana 💚 Quer saber o que o app pode fazer? Pergunte do seu jeito ou escolha um assunto.';
  return '<div class="gr-chat" data-gr-chat="' + (member ? 'member' : 'visitor') + '">' +
    '<div class="gr-log" role="log" aria-live="polite" aria-label="Conversa com o Grana"><div class="gr-msg bot"><span class="gr-avatar">' + mascotSvg('happy') + '</span><p>' + greet + '</p></div></div>' +
    '<div class="gr-chips" data-gr-chips>' + ['Lançar gastos e ganhos', 'Importar extrato do banco', 'Salário líquido, 13º e férias', 'Metas e guardar dinheiro', 'Preço'].map(function(c){ return '<button type="button" class="gr-chip" data-gr-chip="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>'; }).join('') + '</div>' +
    '<div class="gr-form" data-gr-form><label class="sr-only" for="grIn' + inId + '">Sua pergunta para o Grana</label><input id="grIn' + inId + '" name="q" type="text" maxlength="200" autocomplete="off" placeholder="Pergunte ao Grana…" enterkeyhint="send"><button class="btn btn-primary" type="button" data-gr-send>Perguntar</button></div>' +
    '<p class="gr-note">Eu respondo no seu aparelho: o que você escreve aqui não é enviado a lugar nenhum.</p></div>';
}
function interact(root, what){ withPart('mascotChat', function(m){ m.interact(root, what, {member: root.getAttribute('data-gr-chat') === 'member'}); }); }

/* ---------- página inicial (sem conta) ---------- */
export function renderLanding(){
  var meet = document.getElementById('meetGrana');
  if (meet && !meet.getAttribute('data-ready')){
    meet.setAttribute('data-ready', '1');
    meet.querySelector('[data-gr-stage]').innerHTML = '<div class="gr-speech" id="grSpeech" aria-live="polite">Oi! Toque em mim 👋</div><button type="button" class="gr-big" data-gr-poke aria-label="Fazer carinho no Grana">' + mascotSvg('wave') + '</button>';
    meet.querySelector('[data-gr-chatbox]').innerHTML = chatHtml(false);
  }
  var news = document.getElementById('landingNews'), rel = CHANGELOG[0];
  if (news && rel){
    news.innerHTML = '<h2>Novidades <small class="tx-meta">' + formatDateFull(rel.id) + ' · ' + escapeHtml(rel.title) + '</small></h2><div class="news-grid">' +
      rel.items.map(function(it){ return '<article class="news-item"><h3>' + escapeHtml(it.title) + '</h3><p>' + escapeHtml(it.text) + '</p></article>'; }).join('') + '</div>';
  }
}

/* ---------- Início (com conta) ---------- */
var LINES = [
  {text: 'Sabia que dá para importar o extrato do banco? O OFX ou o CSV são os mais exatos.', topic: 'importar'},
  {text: 'Quer ver como fica o mês antes de comprar? Experimente a guia Simular.', topic: 'simular'},
  {text: 'Calcule o seu salário líquido em “Previstas”: tem 13º e férias.', topic: 'salario'},
  {text: 'Defina limites por categoria e eu aviso quando chegar perto.', topic: 'planejar'},
  {text: 'Dá para juntar dinheiro sem valor final: crie uma meta.', topic: 'metas'},
  {text: 'Tem alguma dúvida? Toque em mim e pergunte.', topic: ''}
];
var lineIdx = 0, rotateT = 0;
var greeted = false;
function firstName(){ return State.session && State.session.name ? State.session.name.split(' ')[0] : ''; }
function currentLine(){
  if (!greeted && firstName()){ greeted = true; return {text: 'Oi, ' + firstName() + '! Que bom te ver por aqui 💚 Toque em mim se tiver dúvidas.', topic: ''}; }
  if (!State.accounts.length && !State.cards.length) return {text: 'Vamos começar? Cadastre o seu banco e eu ajudo a montar o resto.', topic: 'comecar'};
  return LINES[lineIdx % LINES.length];
}
function say(){
  var el = document.getElementById('granaSay'); if (!el) return;
  var l = currentLine(); el.textContent = l.text; el.setAttribute('data-topic', l.topic || '');
}
export function renderGranaStrip(){
  var el = document.getElementById('granaStrip');
  if (!el) return;
  if (!State.session){ el.hidden = true; return; }
  if (!el.getAttribute('data-ready')){
    el.setAttribute('data-ready', '1');
    el.innerHTML = '<button type="button" class="gr-small" data-gr-open aria-label="Conversar com o Grana">' + mascotSvg('wave') + '</button>' +
      '<div class="gr-says"><p class="gr-bubble" id="granaSay" data-gr-open role="button" tabindex="0"></p>' +
      '<div class="gr-actions"><button type="button" class="btn btn-ghost btn-sm" data-gr-open>Perguntar ao Grana</button></div></div>';
    el.querySelector('.gr-bubble').addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openGrana(this.getAttribute('data-topic')); } });
    var svg = el.querySelector('.gr-svg');
    setTimeout(function(){ setMood(svg, 'idle'); }, 2600);
    clearInterval(rotateT);
    rotateT = setInterval(function(){ if (document.hidden || !document.getElementById('granaSay')) return; lineIdx++; var b = document.getElementById('granaSay'); b.classList.add('gr-swap'); setTimeout(function(){ say(); b.classList.remove('gr-swap'); }, 220); }, 14000);
  }
  el.hidden = false;
  say();
  bindEyes();
}
export function openGrana(topic){
  var svg = document.querySelector('#granaStrip .gr-svg'); setMood(svg, 'happy', 1800); jump(document.querySelector('#granaStrip .gr-small'));
  withPart('mascotChat', function(m){ m.openChatModal({topic: topic || '', member: true}); });
}

/* ---------- cartão de novidades no Início ---------- */
export function renderNewsCard(){
  var el = document.getElementById('newsCard');
  if (!el) return;
  var rel = State.session ? newsCardRelease() : null;
  el.hidden = !rel;
  if (!rel){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="news-head"><strong>' + icon('bolt') + ' Novidades: ' + escapeHtml(rel.title) + '</strong><button type="button" class="news-x" data-news-close aria-label="Fechar as novidades" title="Fechar">×</button></div>' +
    '<ul class="news-short">' + rel.items.map(function(it){ return '<li>' + escapeHtml(it.title) + '</li>'; }).join('') + '</ul>' +
    '<div class="card-actions"><button type="button" class="btn btn-primary btn-sm" data-news-open>Ver o que mudou</button></div>';
}

/* ---------- eventos (delegados no documento) ---------- */
export function wireMascot(){
  document.addEventListener('click', function(e){
    var t = e.target;
    var poke = t.closest('[data-gr-poke]');
    if (poke){
      var svg = poke.querySelector('.gr-svg'), lines = ['Oi! 💚', 'Cuidado, faço cosquinha! 😆', 'Quer saber o que o app faz?', 'Eu cuido das dúvidas, você cuida da grana!', 'Pergunte ali do lado 👉'];
      setMood(svg, 'happy', 1500); jump(poke);
      var sp = document.getElementById('grSpeech'); if (sp){ sp.textContent = lines[Math.floor(Math.random() * lines.length)]; sp.classList.add('on'); }
      return;
    }
    var open = t.closest('[data-gr-open]');
    if (open){ openGrana(open.id === 'granaSay' ? open.getAttribute('data-topic') : ''); return; }
    var chip = t.closest('[data-gr-chip]');
    if (chip){ var root = chip.closest('.gr-chat'); if (root) interact(root, {type: 'chip', value: chip.getAttribute('data-gr-chip')}); return; }
    if (t.closest('[data-news-close]')){ dismissNewsCard(); renderNewsCard(); return; }
    if (t.closest('[data-news-open]')){ dismissNewsCard(); renderNewsCard(); openWhatsNew(); return; }
    var go = t.closest('[data-gr-go]');
    if (go){ var scr = go.getAttribute('data-gr-go'); var modal = document.getElementById('modalRoot'); if (modal && !modal.hidden){ var x = modal.querySelector('[data-modal-close]'); if (x) x.click(); } showTab(scr); return; }
  });
  // O campo de pergunta não é um <form> (dentro do pop-up já existe um): Enter e o botão enviam.
  function send(box){
    var input = box.querySelector('input'), q = input.value.trim();
    if (!q) return;
    input.value = '';
    interact(box.closest('.gr-chat'), {type: 'ask', value: q});
  }
  document.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.isComposing && e.target.matches && e.target.matches('[data-gr-form] input')){ e.preventDefault(); send(e.target.closest('[data-gr-form]')); }
  });
  document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-gr-send]'); if (b) send(b.closest('[data-gr-form]')); });
  // Primeira vez que a pessoa foca o campo: já baixa a conversa, para a resposta sair na hora.
  document.addEventListener('focusin', function(e){ if (e.target.closest && e.target.closest('[data-gr-form]')) withPart('mascotChat', function(){}); });
  bindEyes();
}
