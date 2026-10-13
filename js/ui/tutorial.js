/*
 * Tutorial de primeiro uso: passo a passo com destaque na tela. Quem quiser pula (botão ou Esc) ou vai
 * seguindo (Próximo / Voltar). Abre sozinho só em conta vazia, uma vez; depois, em “Perfil e conta”,
 * no “Mais” do celular e na janela de ajuda. localStorage granaleve_tutorial = 'off' desliga (testes).
 */
import {qsa} from './dom.js';
import {getPrefs, setPref} from '../data/session.js';
import {State} from './state.js';
import {showTab} from './shell.js';

var TUTORIAL_KEY = 'granaleve_tutorial';
function isMobile(){ return window.matchMedia('(max-width: 860px)').matches; }
function visible(el){ if (!el) return null; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? el : null; }
function pick(){ for (var i = 0; i < arguments.length; i++){ var el = visible(document.querySelector(arguments[i])); if (el) return el; } return null; }

// target: função que devolve o elemento a destacar (ou null: cartão no centro).
export var TUTORIAL_STEPS = [
  {title: 'Bem-vindo(a) ao Grana Leve!', text: 'Em menos de um minuto mostramos as partes principais e por onde começar. Você pode seguir passo a passo ou pular quando quiser.', target: function(){ return null; }},
  {title: 'Seu mês de relance', text: 'Aqui ficam quanto você tem, quanto gastou e o que vem para pagar. Toque no + de cada cartão para ver os detalhes, e em “Ver todos os detalhes do mês” para os gráficos.', target: function(){ return isMobile() ? pick('#summaryCards .sum-card') : pick('#summaryCards'); }, tab: 'dashboard'},
  {title: 'Lançar um gasto ou ganho', text: 'O botão + abre o lançamento de qualquer tela. Dá para preencher o formulário ou só escrever do seu jeito, como “gastei 30 no mercado”: o app mostra o que entendeu e você confere antes de salvar.', target: function(){ return pick('#fabAdd'); }},
  {title: 'Para onde ir', text: function(){ return isMobile() ? 'A barra de baixo leva ao Início, a Ganhos e gastos e a Contas e cartões. Planejar gastos, Metas, Compromissos e o resto ficam em “Mais”.' : 'O menu ao lado leva a cada área: Ganhos e gastos, Contas e cartões e, em “Planejar”, os gastos por categoria, as metas e os compromissos.'; },
    target: function(){ return isMobile() ? pick('#bottomnav') : pick('.sidenav-links'); }},
  {title: 'Por onde começar', text: 'Cadastre primeiro o seu banco em “Contas e cartões”: o saldo da conta e, se tiver, o cartão de crédito. Depois é só lançar os gastos e ganhos, e o app monta o resto: faturas, saldo e gráficos.',
    target: function(){ return isMobile() ? pick('#bottomnav [data-tab="cartoes"]') : pick('.sidenav [data-tab="cartoes"]'); }},
  {title: 'Planejar e guardar', text: function(){ return isMobile() ? 'Em “Mais” você encontra Planejar gastos (quanto quer gastar por categoria), Metas (para juntar dinheiro) e Compromissos (dívidas e quem te deve).' : 'Em “Planejar gastos” você define quanto quer gastar por categoria; em “Metas”, junta dinheiro para um objetivo; em “Compromissos”, acompanha dívidas e quem te deve.'; },
    target: function(){ return isMobile() ? pick('#moreBtn') : pick('.sidenav [data-tab="limites"]'); }},
  {title: 'Dúvidas e sugestões', text: function(){ return isMobile() ? 'Precisa de ajuda ou quer sugerir algo? Em “Mais” há o botão “Ajuda e sugestões”, e o tutorial pode ser revisto lá também.' : 'Precisa de ajuda ou quer sugerir algo? Este botão manda a mensagem para a gente. O tutorial pode ser revisto em “Perfil e conta”.'; },
    target: function(){ return isMobile() ? pick('#moreBtn') : pick('.help-cta'); }},
  {title: 'Tudo pronto!', text: 'Que tal começar cadastrando o seu banco? Você pode voltar a este tutorial quando quiser.', target: function(){ return null; }, last: true}
];

var root = null;
// Abre o tutorial. Devolve uma promessa que termina quando a pessoa conclui ou pula.
export function startTutorial(){
  if (root) return Promise.resolve();
  return new Promise(function(resolve){
    var i = 0, prevFocus = document.activeElement, stepsEls = {};
    root = document.createElement('div');
    root.className = 'tut-root';
    root.innerHTML = '<div class="tut-block"></div><div class="tut-spot" hidden></div>' +
      '<div class="tut-card" role="dialog" aria-modal="true" aria-labelledby="tutTitle" aria-describedby="tutText">' +
        '<p class="tut-count" id="tutCount"></p><h3 id="tutTitle"></h3><p id="tutText"></p>' +
        '<div class="tut-dots" aria-hidden="true"></div>' +
        '<div class="tut-actions"><button type="button" class="btn btn-ghost btn-sm" data-tut="skip">Pular tutorial</button>' +
          '<span class="tut-nav"><button type="button" class="btn btn-ghost btn-sm" data-tut="back">Voltar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-tut="next">Próximo</button></span></div></div>';
    document.body.appendChild(root);
    document.body.classList.add('tut-open');
    var behind = qsa('body > *').filter(function(el){ return el !== root && !el.hasAttribute('inert') && el.id !== 'toastWrap'; });
    behind.forEach(function(el){ el.setAttribute('inert', ''); });
    var spot = root.querySelector('.tut-spot'), card = root.querySelector('.tut-card');
    stepsEls.dots = root.querySelector('.tut-dots');
    stepsEls.dots.innerHTML = TUTORIAL_STEPS.map(function(){ return '<i></i>'; }).join('');

    function end(finishAction){
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      behind.forEach(function(el){ el.removeAttribute('inert'); });
      document.body.classList.remove('tut-open');
      root.remove(); root = null;
      setPref('tutorialDone', true);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
      if (finishAction === 'start'){ showTab('cartoes'); setTimeout(function(){ var f = document.getElementById('accName'); if (f) f.focus(); }, 250); }
      resolve(finishAction || 'done');
    }
    function stepOf(){ return TUTORIAL_STEPS[i]; }
    function text(v){ return typeof v === 'function' ? v() : v; }
    function place(){
      if (!root) return;
      var s = stepOf(), el = s.target ? s.target() : null, vw = window.innerWidth, vh = window.innerHeight, pad = 8;
      if (!el){
        spot.hidden = true;
        card.style.left = Math.max(12, (vw - card.offsetWidth) / 2) + 'px';
        card.style.top = Math.max(12, (vh - card.offsetHeight) / 2) + 'px';
        return;
      }
      var r = el.getBoundingClientRect();
      spot.hidden = false;
      spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
      spot.style.width = (r.width + 2 * pad) + 'px'; spot.style.height = (r.height + 2 * pad) + 'px';
      var cw = card.offsetWidth, ch = card.offsetHeight, left, top;
      if (isMobile()){
        left = Math.max(12, (vw - cw) / 2);
        // Em cima do destaque se ele está na metade de baixo; senão embaixo.
        top = r.top + r.height / 2 > vh / 2 ? Math.max(12, r.top - pad - ch - 12) : Math.min(vh - ch - 12, r.bottom + pad + 12);
      } else {
        left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
        top = r.bottom + pad + 14;
        if (top + ch > vh - 12){ top = r.top - pad - ch - 14; }
        if (top < 12){ top = Math.min(Math.max(12, r.top), vh - ch - 12); left = Math.min(r.right + pad + 14, vw - cw - 12); }
      }
      card.style.left = left + 'px'; card.style.top = top + 'px';
    }
    function show(){
      var s = stepOf();
      if (s.tab && State.activeTab !== s.tab) showTab(s.tab);
      root.querySelector('#tutCount').textContent = 'Passo ' + (i + 1) + ' de ' + TUTORIAL_STEPS.length;
      root.querySelector('#tutTitle').textContent = s.title;
      root.querySelector('#tutText').textContent = text(s.text);
      qsa('i', stepsEls.dots).forEach(function(d, n){ d.className = n === i ? 'on' : n < i ? 'done' : ''; });
      var back = root.querySelector('[data-tut="back"]'), next = root.querySelector('[data-tut="next"]'), skip = root.querySelector('[data-tut="skip"]');
      back.hidden = i === 0;
      next.textContent = s.last ? 'Cadastrar meu banco' : i === 0 ? 'Começar' : 'Próximo';
      next.setAttribute('data-tut', s.last ? 'start' : 'next');
      skip.textContent = s.last ? 'Concluir' : 'Pular tutorial';
      skip.setAttribute('data-tut', s.last ? 'done' : 'skip');
      var el = s.target ? s.target() : null;
      if (el && el.scrollIntoView) el.scrollIntoView({block: 'center', behavior: 'instant'});
      place();
      next.focus();
    }
    function go(n){ i = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, n)); show(); }
    function onKey(e){
      if (e.key === 'Escape'){ e.preventDefault(); end('skip'); }
      else if (e.key === 'ArrowRight'){ if (i < TUTORIAL_STEPS.length - 1) go(i + 1); }
      else if (e.key === 'ArrowLeft'){ go(i - 1); }
      else if (e.key === 'Tab'){
        // O foco fica dentro do cartão do tutorial.
        var btns = qsa('button:not([hidden])', card), first = btns[0], last = btns[btns.length - 1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }
    root.addEventListener('click', function(e){
      var b = e.target.closest('[data-tut]'); if (!b) return;
      var a = b.getAttribute('data-tut');
      if (a === 'next') go(i + 1);
      else if (a === 'back') go(i - 1);
      else if (a === 'skip' || a === 'done') end(a);
      else if (a === 'start') end('start');
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    show();
  });
}
// Abre sozinho só para conta nova e vazia, uma vez. Devolve true se abriu.
export function maybeTutorial(){
  var off = false;
  try { off = localStorage.getItem(TUTORIAL_KEY) === 'off'; } catch(e){}
  if (off || getPrefs().tutorialDone) return null;
  if (State.transactions.length || State.accounts.length || State.cards.length) return null;
  return startTutorial();
}
