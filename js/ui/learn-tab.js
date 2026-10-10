/*
 * Aprenda e Conexões.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */

import {getPrefs} from '../data/session.js';
import {escapeHtml, icon} from './dom.js';

import {bubble} from './chat.js';
import {HOW_TO, OPEN_FINANCE_BANKS, TIPS, TIPS_GROW} from './constants.js';
import {isStandalone} from './pwa.js';
import {State} from './state.js';

/* ---------- Aprenda ---------- */
export function renderLearn(){
  function tipCards(list){
    return '<div class="tips-grid">' + list.map(function(t){
      return '<div class="tip-card"><span class="tip-tag">'+escapeHtml(t.tag)+'</span><h4>'+escapeHtml(t.title)+'</h4><p>'+escapeHtml(t.text)+'</p></div>';
    }).join('') + '</div>';
  }
  // Dicas editadas no painel de administração substituem as padrão.
  var edited = State.content || [];
  function of(kind, fallback){ var l = edited.filter(function(c){ return c.kind === kind; }).map(function(c){ return c.data; }); return edited.length ? l : fallback; }
  document.getElementById('learnWrap').innerHTML =
    '<section class="learn-section"><h3>Organizar o dinheiro</h3>' + tipCards(of('tip', TIPS)) + '</section>' +
    '<section class="learn-section"><h3>Fazer o dinheiro render</h3>' + tipCards(of('tip_grow', TIPS_GROW)) +
      '<p class="disclaimer" style="margin-top:10px">Conteúdo educativo. Não é recomendação de investimento. Valores e taxas são exemplos e mudam com o tempo.</p></section>' +
    '<section class="learn-section card"><h3>Como usar o Grana Leve</h3><ol class="howto-list">' +
      HOW_TO.map(function(h){ return '<li><strong>' + escapeHtml(h[0]) + '</strong> ' + escapeHtml(h[1]) + '</li>'; }).join('') +
    '</ol></section>';
}

/* ---------- Conexões ---------- */
export function renderConnections(){
  var opt = getPrefs().waOptin;
  document.getElementById('connWrap').innerHTML =
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('chat') + '</span><h3>WhatsApp</h3><span class="status-pill warning">Em breve</span></div>' +
      '<p>Registre gastos mandando uma mensagem, do jeito que você fala. O Grana Leve entende, lança sozinho e também te lembra das metas e das contas a receber.</p>' +
      '<div class="phone-mock" aria-hidden="true">' +
        bubble('me', 'gastei 25 no almoço no vale') +
        bubble('bot', 'Anotei: <strong>Gasto de R$ 25,00</strong> em Alimentação · Vale') +
        bubble('bot', 'Lembrete: faltam R$ 750,00 para a meta “Viagem”.') +
      '</div>' +
      '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-conn="chat">' + icon('chat') + 'Testar o chat agora</button></div>' +
      (opt ? '<p class="field-hint">Pronto! Vamos te avisar no número ' + escapeHtml(opt.phone) + ' quando estiver disponível. <button type="button" class="linklike" data-conn="wa-remove">Remover</button></p>' :
        '<form id="waOptinForm" class="deposit-form"><input class="select-sm" style="padding:8px 10px" name="phone" type="tel" maxlength="20" placeholder="Seu WhatsApp" aria-label="Seu número de WhatsApp"><button class="btn btn-ghost btn-sm" type="submit">Quero ser avisado</button></form>') +
    '</div>' +
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('bank') + '</span><h3>Open Finance</h3><span class="status-pill warning">Em breve</span></div>' +
      '<p>Conecte sua conta do banco para trazer extratos e faturas automaticamente, já com categoria, sem digitar nada.</p>' +
      '<ol class="howto-list"><li>Escolha o seu banco.</li><li>Autorize no app do banco: você decide o que compartilhar e por quanto tempo.</li><li>Os lançamentos aparecem aqui sozinhos.</li></ol>' +
      '<div class="chips">' + OPEN_FINANCE_BANKS.map(function(b){ return '<button type="button" class="chip" disabled title="Em breve">' + escapeHtml(b) + '</button>'; }).join('') + '</div>' +
      '<p class="field-hint">' + icon('lock') + ' O Open Finance é regulado pelo Banco Central. O Grana Leve nunca vai pedir a senha do seu banco.</p>' +
    '</div>' +
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('phone') + '</span><h3>App no celular</h3><span class="status-pill good">Disponível</span></div>' +
      '<p>Instale o Grana Leve na tela inicial: ele abre como um aplicativo e funciona mesmo sem internet.</p>' +
      (State.installPrompt ? '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-conn="install">Instalar agora</button></div>' :
        (isStandalone() ? '<p class="field-hint">O Grana Leve já está instalado neste aparelho.</p>' :
        '<ul class="howto-list"><li><strong>Android (Chrome):</strong> menu ⋮ e depois “Instalar app” ou “Adicionar à tela inicial”.</li><li><strong>iPhone (Safari):</strong> botão Compartilhar e depois “Adicionar à Tela de Início”.</li></ul>')) +
    '</div>' +
    '<div class="conn-card">' +
      '<div class="conn-head"><span class="feature-icon">' + icon('calendar') + '</span><h3>Google Agenda</h3><span class="status-pill good">Disponível</span></div>' +
      '<p>Crie lembretes das suas metas na sua agenda com um toque. É só preencher “Me avise em” ou o prazo na meta e tocar em “Google Agenda”.</p>' +
      '<div class="card-actions"><button class="btn btn-ghost btn-sm" type="button" data-conn="metas">Ir para Metas</button></div>' +
    '</div>';
}
