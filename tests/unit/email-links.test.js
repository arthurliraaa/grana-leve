import {test} from 'node:test';
import assert from 'node:assert/strict';

// localStorage mínimo (o intervalo entre pedidos de link fica guardado no navegador).
const mem = new Map();
globalThis.localStorage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
const {emailTypo, linkWait, markLinkSent, validEmail} = await import('../../js/data/auth.js');

test('e-mail com domínio digitado errado: sugere o provedor certo', () => {
  assert.equal(emailTypo('seujorgefalso@gmaill.com'), 'seujorgefalso@gmail.com');
  assert.equal(emailTypo('a@gmial.com'), 'a@gmail.com');
  assert.equal(emailTypo('a@gnail.com'), 'a@gmail.com');
  assert.equal(emailTypo('a@hotmal.com'), 'a@hotmail.com');
  assert.equal(emailTypo('a@hotmaill.com.br'), 'a@hotmail.com.br');
  assert.equal(emailTypo('a@outlok.com'), 'a@outlook.com');
  assert.equal(emailTypo('a@yaho.com.br'), 'a@yahoo.com.br');
  assert.equal(emailTypo('a@gmail.com.br'), 'a@gmail.com');
  assert.equal(emailTypo('a@uol.com'), 'a@uol.com.br');
  assert.equal(emailTypo('Ana.Silva+x@GMAILL.com'), 'Ana.Silva+x@gmail.com', 'mantém o nome como foi digitado');
});

test('e-mail certo ou de outro domínio: não pergunta nada', () => {
  for (const e of ['a@gmail.com', 'a@hotmail.com.br', 'a@me.com', 'a@email.com', 'a@tim.com.br', 'a@ufrn.edu.br', 'a@empresa.com.br', 'sem-arroba', '@gmail.com', ''])
    assert.equal(emailTypo(e), '', e);
});

test('validEmail aceita endereços comuns e recusa os incompletos', () => {
  for (const e of ['a@b.co', 'ana.silva+gl@gmail.com', 'x@sub.dominio.com.br']) assert.ok(validEmail(e), e);
  for (const e of ['a@b', 'a b@c.com', 'a@@b.com', '@b.com', 'a@b.', 'ana@gmail']) assert.ok(!validEmail(e), e);
});

test('intervalo entre pedidos de link: conta por tipo e por e-mail, sem diferenciar maiúsculas', () => {
  const t0 = 1_000_000_000_000;
  assert.equal(linkWait('recovery', 'ana@gmail.com', 60, t0), 0);
  markLinkSent('recovery', 'Ana@Gmail.com', t0);
  assert.equal(linkWait('recovery', 'ana@gmail.com', 60, t0 + 1000), 59);
  assert.equal(linkWait('recovery', 'ana@gmail.com', 60, t0 + 60000), 0);
  assert.equal(linkWait('signup', 'ana@gmail.com', 60, t0 + 1000), 0, 'outro tipo de link não espera');
  assert.equal(linkWait('recovery', 'bia@gmail.com', 60, t0 + 1000), 0, 'outro e-mail não espera');
});

test('pedidos antigos (mais de um dia) saem da lista', () => {
  const t0 = 2_000_000_000_000;
  markLinkSent('recovery', 'velho@gmail.com', t0);
  markLinkSent('recovery', 'novo@gmail.com', t0 + 2 * 86400000);
  assert.ok(!/velho/.test(mem.get('granaleve_link_sent_v1')));
});

test('dica de onde olhar quando o e-mail não chega, por provedor', async () => {
  const {mailProviderTip} = await import('../../js/data/auth.js');
  assert.match(mailProviderTip('a@hotmail.com'), /Lixo Eletrônico/);
  assert.match(mailProviderTip('a@outlook.com.br'), /Outros/);
  assert.match(mailProviderTip('a@live.com'), /Hotmail/);
  assert.match(mailProviderTip('a@yahoo.com.br'), /Spam/);
  assert.equal(mailProviderTip('a@gmail.com'), '');
  assert.equal(mailProviderTip(''), '');
});
