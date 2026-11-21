/*
 * O desenho do Grana (SVG), sem dependências: usado pelo mascote (mascot.js, mascot-chat.js) e pela tela de carregamento (splash.js).
 * O CSS (.gr-svg e .gr-*) cuida das animações e dos humores.
 */
var uid = 0;
export function nextId(){ return ++uid; }

// O desenho. mood: idle | happy | think | wave (troca a boca e o bracinho por CSS).
export function mascotSvg(mood, idp){
  var n = idp || ++uid;
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
