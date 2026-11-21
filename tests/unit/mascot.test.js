import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ask, normalize, stem, KB, topicAnswer, topicIdByLabel, starterChips} from '../../js/domain/mascot.js';
import {CHANGELOG, validateChangelog, unseenReleases, latestId} from '../../js/domain/changelog.js';

const id = q => ask(q, {}).id;

test('texto: sem acento, sem pontuação e com a raiz das palavras', () => {
  assert.equal(normalize('  Como LANÇO um gasto?! '), 'como lanco um gasto');
  assert.equal(stem('gastei'), stem('gastar'));
  assert.equal(stem('gastos'), stem('gasto'));
  assert.equal(stem('parcelas'), stem('parcelado'));
});

test('entende o sentido, não só as palavras: o mesmo assunto com palavras diferentes', () => {
  const casos = {
    lancar: ['como lanço um gasto?', 'como anoto uma despesa', 'quero registrar uma compra que fiz', 'adicionar um ganho', 'dá para escrever gastei 20 no mercado?'],
    cartoes: ['como funciona a fatura do cartão', 'meu cartão fecha dia 5, o app entende?', 'dá para ver o limite do cartão de crédito', 'compras parceladas no cartão'],
    contas: ['posso cadastrar mais de um banco', 'como vejo o saldo da minha conta', 'transferir dinheiro entre contas'],
    metas: ['quero juntar dinheiro para uma viagem', 'dá para criar uma meta', 'como faço para poupar todo mês'],
    planejar: ['como defino um limite por categoria', 'quero controlar quanto gasto no mês', 'o app avisa quando eu passar do orçamento'],
    simular: ['e se eu comprar um celular parcelado', 'dá para simular um financiamento', 'vai sobrar dinheiro depois dessa compra'],
    salario: ['calcular meu salário líquido', 'quanto vai ficar depois do inss e do imposto de renda', 'sou clt, calcula meu décimo terceiro', 'tem calculadora de férias', 'como entram as horas extras'],
    salario_previsto: ['como o app sabe quando meu salário cai', 'quinto dia útil', 'dá para acompanhar o aumento do meu salário'],
    importar: ['posso importar o extrato do banco', 'lê arquivo ofx?', 'não quero digitar tudo, dá para subir o csv', 'aceita pdf da fatura'],
    dividas: ['como anoto uma dívida', 'emprestei dinheiro para um amigo, como cobro', 'quem me deve'],
    fixas: ['conta de luz todo mês', 'dá para cadastrar o aluguel e assinaturas', 'lança sozinho no dia do vencimento?'],
    relatorios: ['tem gráficos do mês', 'dá para baixar relatório em pdf', 'posso exportar em csv'],
    dados: ['meus dados estão seguros?', 'quem pode ver o que eu lanço', 'dá para fazer backup', 'como excluo minha conta e meus dados'],
    preco: ['é grátis?', 'quanto custa', 'tem plano pago?'],
    instalar: ['funciona no celular?', 'dá para usar sem internet', 'tem aplicativo para instalar'],
    comecar: ['por onde começo', 'não entendi como usar', 'tem tutorial?', 'o que o app faz'],
    conta: ['como crio uma conta', 'esqueci minha senha', 'entrar com o google'],
    categorias: ['posso criar minhas categorias', 'personalizar categorias com emoji'],
    dividir: ['dividir uma compra com um amigo', 'meu amigo pagou por mim', 'gasto de terceiros no meu cartão'],
    equipe: ['achei um erro no app', 'quero falar com a equipe', 'quem criou o app']
  };
  const erros = [];
  for (const [esperado, frases] of Object.entries(casos)){
    for (const f of frases){ const r = ask(f, {}); if (r.id !== esperado) erros.push(f + ' → ' + (r.id || r.kind) + ' (esperado ' + esperado + ', nota ' + (r.score || 0).toFixed(2) + ')'); }
  }
  assert.deepEqual(erros, [], 'perguntas entendidas errado:\n' + erros.join('\n'));
});

test('tolera erros de digitação', () => {
  assert.equal(id('como lanso um gasot'), 'lancar');
  assert.equal(id('posso importar extrato do bnaco'), 'importar');
  assert.equal(id('calcular salairo liquido'), 'salario');
  assert.equal(id('quero faser uma meta'), 'metas');
});

test('conversa: cumprimento, agradecimento, quem é e o que faz', () => {
  assert.equal(ask('oi').kind, 'small');
  assert.equal(ask('Bom dia!').id, 'oi');
  assert.equal(ask('muito obrigado').id, 'obrigado');
  assert.match(ask('quem é você?').text, /mascote/);
  assert.equal(ask('o que você faz?').id, 'ajuda');
  assert.equal(ask('tchau').id, 'tchau');
});

test('quando não sabe, diz e oferece caminhos em vez de chutar', () => {
  const r = ask('qual a previsão do tempo amanhã em curitiba', {});
  assert.equal(r.kind, 'none');
  assert.ok(r.chips.length >= 3, 'oferece assuntos para escolher');
  assert.match(r.text, /equipe/);
  assert.equal(ask('').kind, 'none');
  assert.equal(ask('???').kind, 'none');
});

test('resposta muda para quem já tem conta e só ela traz botão de ir à tela', () => {
  const v = ask('como lanço um gasto', {member: false}), m = ask('como lanço um gasto', {member: true});
  assert.notEqual(v.text, m.text);
  assert.equal(v.go, null);
  assert.deepEqual(m.go, {label: 'Lançar agora', screen: 'lancamentos'});
  assert.match(m.text, /\+/);
});

test('assuntos sugeridos viram resposta direta', () => {
  const r = topicAnswer(topicIdByLabel('Importar extrato do banco'), {member: true});
  assert.equal(r.id, 'importar');
  assert.ok(starterChips().every(c => topicIdByLabel(c)), 'todo chip inicial leva a um assunto');
  assert.equal(topicAnswer('nao-existe', {}), null);
});

test('base de conhecimento: assuntos únicos, respostas curtas e sem prometer o que o app não faz', () => {
  const ids = KB.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of KB){
    assert.ok(e.q.length >= 3, e.id + ' precisa de jeitos de perguntar');
    assert.ok(e.visitor.length <= 420 && e.member.length <= 420, e.id + ': resposta curta');
    assert.ok(!/R\$ ?\d/.test(e.visitor + e.member), e.id + ': sem valores inventados');
  }
});

test('novidades: registro bem formado e regra de quem já viu', () => {
  const telas = ['lancamentos', 'simular', 'dashboard', 'perfil', 'conselhos', 'metas', 'cartoes', 'limites', 'compromissos', 'fixas'];
  assert.equal(validateChangelog(CHANGELOG, telas), '');
  assert.equal(latestId(CHANGELOG), CHANGELOG[0].id);
  assert.equal(unseenReleases(CHANGELOG, '', 3).length, Math.min(3, CHANGELOG.length));
  assert.deepEqual(unseenReleases(CHANGELOG, latestId(CHANGELOG), 3), [], 'quem já viu a última não vê nada');
  const log = [{id: '2026-12-01'}, {id: '2026-11-20'}, {id: '2026-11-10'}, {id: '2026-11-01'}];
  assert.deepEqual(unseenReleases(log, '2026-11-15', 3).map(r => r.id), ['2026-12-01', '2026-11-20']);
  assert.equal(unseenReleases(log, '', 3).length, 3, 'no máximo 3');
  assert.match(validateChangelog([{id: '2026-11-01', title: 'a', items: [{title: 'x', text: 'y'}]}, {id: '2026-11-02', title: 'b', items: [{title: 'x', text: 'y'}]}]), /diminuir/);
  assert.match(validateChangelog([{id: '2026-11-01', title: 'a', items: [{title: 'x', text: 'y', go: 'lugar-nenhum'}]}], telas), /desconhecida/);
});
