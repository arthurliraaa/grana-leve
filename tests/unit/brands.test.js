import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BANKS, detectBank, lookOf, initials, cleanMark, textOn, contrastRatio, darker} from '../../js/domain/brands.js';

test('descobre o banco pelo nome, sem ligar para acento e maiúscula', () => {
  const id = n => (detectBank(n) || {}).id;
  assert.equal(id('Nubank'), 'nubank');
  assert.equal(id('Cartão roxinho'), 'nubank');
  assert.equal(id('ITAÚ Click'), 'itau');
  assert.equal(id('Inter Black'), 'inter');
  assert.equal(id('Internacional'), undefined, '“inter” só como palavra inteira');
  assert.equal(id('Ourocard'), 'bb');
  assert.equal(id('Conta da Caixa'), 'caixa');
  assert.equal(id('C6 Carbon'), 'c6');
  assert.equal(id('Mercado Pago'), 'mercadopago');
  assert.equal(id('Cartão da loja'), undefined);
});

test('visual: banco detectado, escolhido, “sem banco” e personalizado', () => {
  let l = lookOf({name: 'Nubank'});
  assert.equal(l.bank.id, 'nubank'); assert.equal(l.auto, true); assert.equal(l.color, '#820ad1'); assert.equal(l.mark, 'Nu'); assert.equal(l.text, '#ffffff');
  l = lookOf({name: 'Meu cartão', bank: 'inter'});
  assert.equal(l.bank.id, 'inter'); assert.equal(l.auto, false); assert.equal(l.mark, 'In');
  l = lookOf({name: 'Nubank', bank: 'none'});
  assert.equal(l.bank, null); assert.equal(l.color, null); assert.equal(l.mark, 'Nu');
  l = lookOf({name: 'Nubank', color: '#00FF00', mark: '🛒'});
  assert.equal(l.color, '#00ff00'); assert.equal(l.mark, '🛒'); assert.equal(l.text, '#1a1a1a');
  l = lookOf({name: 'Loja', color: 'vermelho'});
  assert.equal(l.color, null, 'cor inválida é ignorada');
});

test('iniciais e selo personalizado', () => {
  assert.equal(initials('Cartão da Loja'), 'Cd');
  assert.equal(initials('Renner'), 'Re');
  assert.equal(initials(''), '?');
  assert.equal(cleanMark('  ABCD '), 'ABC');
  assert.equal(cleanMark('👨‍👩‍👧x'), '👨‍👩‍👧x', 'emoji composto conta como um');
});

test('texto sempre legível sobre a cor de todos os bancos', () => {
  for (const b of BANKS){
    assert.ok(contrastRatio(b.color, textOn(b.color)) >= 4.5, b.name + ' tem contraste ' + contrastRatio(b.color, textOn(b.color)).toFixed(2));
  }
  assert.equal(textOn('#fcd116'), '#1a1a1a', 'amarelo do BB usa texto escuro');
  assert.equal(darker('#ffffff', 0.5), '#808080');
});

test('degradê do cartão mantém o texto legível nas duas pontas', async () => {
  const {cardPaint} = await import('../../js/domain/brands.js');
  for (const b of BANKS){
    const p = cardPaint(b.color);
    assert.ok(p.contrast >= 4.5, b.name + ': ' + p.contrast.toFixed(2));
  }
});
