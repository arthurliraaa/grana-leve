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
import {withPart, showTab} from './shell.js';
import {newsCardRelease, dismissNewsCard, openWhatsNew} from './whats-new.js';

var uid = 0;
var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// O desenho. mood: idle | happy | think | wave (troca a boca e o bracinho por CSS).
export function mascotSvg(mood){
  var n = ++uid;
  return '<svg class="gr-svg" viewBox="0 0 140 140" data-mood="' + (mood || 'idle') + '" aria-hidden="true" focusable="false">' +
    '<defs><radialGradient id="grB' + n + '" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="#6ff0cf"/><stop offset=".5" stop-color="#2dc29b"/><stop offset="1" stop-color="#0c8a70"/></radialGradient>' +
    '<radialGradient id="grL' + n + '" cx="30%" cy="30%" r="90%"><stop offset="0" stop-color="#8af5d6"/><stop offset="1" stop-color="#1c9d7c"/></radialGradient></defs>' +
    '<ellipse class="gr-shadow" cx="70" cy="128" rx="34" ry="6"/>' +
    '<g class="gr-bob">' +
      '<g class="gr-leaf"><path d="M70 36 C66 22 54 16 44 18 C46 30 56 38 70 36Z" fill="url(#grL' + n + ')"/><path d="M70 36 C74 20 88 14 98 18 C96 31 84 39 70 36Z" fill="#1c9d7c"/><path d="M70 38 L70 30" stroke="#0c8a70" stroke-width="3" stroke-linecap="round"/></g>' +
      '<g class="gr-feet"><ellipse cx="52" cy="122" rx="12" ry="7" fill="#0c8a70"/><ellipse cx="88" cy="122" rx="12" ry="7" fill="#0c8a70"/></g>' +
      '<g class="gr-arm gr-arm-l"><circle cx="26" cy="88" r="9" fill="#27b894"/></g>' +
      '<circle class="gr-body" cx="70" cy="80" r="46" fill="url(#grB' + n + ')"/>' +
      '<ellipse cx="70" cy="94" rx="27" ry="22" fill="#e6fff7" opacity=".5"/>' +
      '<g class="gr-arm gr-arm-r"><circle cx="114" cy="88" r="9" fill="#27b894"/></g>' +
      '<g class="gr-face">' +
        '<g class="gr-eye"><ellipse cx="52" cy="74" rx="9.5" ry="11.5" fill="#fff"/><circle class="gr-pupil" cx="53" cy="76" r="6" fill="#12332c"/><circle cx="55.5" cy="73" r="2.2" fill="#fff"/></g>' +
        '<g class="gr-eye"><ellipse cx="88" cy="74" rx="9.5" ry="11.5" fill="#fff"/><circle class="gr-pupil" cx="87" cy="76" r="6" fill="#12332c"/><circle cx="89.5" cy="73" r="2.2" fill="#fff"/></g>' +
        '<ellipse cx="40" cy="92" rx="7" ry="4.5" fill="#ff9fb2" opacity=".75"/><ellipse cx="100" cy="92" rx="7" ry="4.5" fill="#ff9fb2" opacity=".75"/>' +
        '<path class="m-idle" d="M61 93 Q70 101 79 93" stroke="#12332c" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
        '<g class="m-happy"><path d="M58 91 Q70 108 82 91 Z" fill="#12332c"/><path d="M64 99 Q70 104 76 99 Q70 96 64 99Z" fill="#ff7a93"/></g>' +
        '<ellipse class="m-think" cx="70" cy="96" rx="4.2" ry="5.2" fill="#12332c"/>' +
      '</g>' +
    '</g></svg>';
}
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
  var greet = member ? 'Oi' + (State.session && State.session.name ? ', ' + escapeHtml(State.session.name.split(' ')[0]) : '') + '! Eu sou o Grana 💚 Pergunte o que quiser sobre o app, do seu jeito.'
    : 'Oi! Eu sou o Grana 💚 Quer saber o que o app pode fazer? Pergunte do seu jeito ou escolha um assunto.';
  return '<div class="gr-chat" data-gr-chat="' + (member ? 'member' : 'visitor') + '">' +
    '<div class="gr-log" role="log" aria-live="polite" aria-label="Conversa com o Grana"><div class="gr-msg bot"><span class="gr-avatar">' + mascotSvg('happy') + '</span><p>' + greet + '</p></div></div>' +
    '<div class="gr-chips" data-gr-chips>' + ['Lançar gastos e ganhos', 'Importar extrato do banco', 'Salário líquido, 13º e férias', 'Metas e guardar dinheiro', 'Preço'].map(function(c){ return '<button type="button" class="gr-chip" data-gr-chip="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>'; }).join('') + '</div>' +
    '<div class="gr-form" data-gr-form><label class="sr-only" for="grIn' + (++uid) + '">Sua pergunta para o Grana</label><input id="grIn' + uid + '" name="q" type="text" maxlength="200" autocomplete="off" placeholder="Pergunte ao Grana…" enterkeyhint="send"><button class="btn btn-primary" type="button" data-gr-send>Perguntar</button></div>' +
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
