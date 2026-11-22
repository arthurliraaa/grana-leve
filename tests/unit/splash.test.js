import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mascotSvg} from '../../js/ui/mascot-art.js';

test('a tela de carregamento do HTML usa o mesmo desenho do mascote (não pode ficar desatualizada)', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const bloco = html.match(/<div id="splash"[\s\S]*?<\/svg>/)[0];
  assert.ok(bloco.includes(mascotSvg('wave')), 'o SVG de #splash em index.html precisa ser igual a mascotSvg("wave"): gere de novo se o desenho mudou');
  assert.ok(html.indexOf('id="splash"') < html.indexOf('id="viewLanding"'), 'a tela de carregamento vem antes do app (pinta primeiro)');
});
