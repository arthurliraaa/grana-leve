/*
 * Novidades do app, mostradas UMA vez a quem já usa, na primeira abertura depois de uma atualização (js/ui/whats-new.js).
 * Como atualizar: ao entregar algo que a pessoa vai notar, acrescente uma entrada NOVA no TOPO de CHANGELOG, com um id de data
 * ('AAAA-MM-DD') maior que o da anterior. Escreva para quem usa, em português simples: o que mudou e como isso ajuda.
 * item.go (opcional) = tela para onde o botão “Ver” leva (nome aceito por showTab: 'lancamentos', 'simular', 'dashboard', 'perfil'…).
 */
export var CHANGELOG = [
  {id: '2026-11-22', title: 'Mais de um emprego, o Grana no cantinho e mais segurança', items: [
    {title: 'Mais de um emprego', go: 'lancamentos', text: 'Na calculadora do salário, toque em “Tenho mais de um emprego”: cada um tem o seu cálculo (e a sua previsão do “já caiu?”) e o líquido fixo é somado.'},
    {title: 'O Grana em todas as telas', text: 'Ele fica no cantinho, animado, com dicas de cada tela e pronto para tirar dúvidas. Dá para mandá-lo descansar (×) e chamar de volta em Perfil.'},
    {title: 'Tela de carregamento e toque repetido', text: 'Uma animação rápida do Grana ao abrir o app e ao entrar. E tocar várias vezes em “Salvar” com a internet lenta não grava mais de uma vez.'}
  ]},
  {id: '2026-11-21', title: 'Importar extrato e mais leveza', items: [
    {title: 'Importar o extrato do banco', go: 'lancamentos', text: 'Em Ganhos e gastos, leia o arquivo do banco: o OFX ou o CSV (gerados no app ou no site do banco) dão a leitura mais exata, e o PDF também funciona. Você confere tudo antes de importar, o app evita lançar duas vezes e dá para desfazer.'},
    {title: 'Abre mais rápido', text: 'As letras agora vêm do próprio app e o que quase ninguém usa só é carregado quando você abre.'},
    {title: 'Celular mais simples', go: 'perfil', text: 'O “Sair” ficou em Perfil, para você não sair sem querer, e a calculadora do salário mostra só o essencial primeiro.'}
  ]},
  {id: '2026-11-18', title: 'Meu salário', items: [
    {title: 'Calculadora do salário líquido', go: 'lancamentos', text: 'Em “Previstas”, informe o salário bruto e veja o líquido para CLT, servidor, MEI, autônomo, PJ ou estágio, com descontos (vale-transporte, plano de saúde…), ganhos extras, horas extras, sobreaviso, 13º e férias.'},
    {title: 'Salário previsto todo mês', go: 'dashboard', text: 'Escolha o dia em que ele cai (por exemplo, o 5º dia útil) e, quando chegar, o app pergunta “já caiu?” para você confirmar os valores do mês.'},
    {title: 'Evolução do salário', text: 'Os reajustes e o que caiu em cada mês ficam guardados para você acompanhar.'}
  ]},
  {id: '2026-11-17', title: 'Simular, Conselhos e metas', items: [
    {title: 'Simular uma compra ou ganho', go: 'simular', text: 'A guia Simular mostra como ficam as suas contas mês a mês, no cartão, à vista, financiando ou com o dinheiro de uma meta, sem registrar nada até você pedir.'},
    {title: 'Conselhos gentis', go: 'conselhos', text: 'Ideias feitas a partir dos seus próprios gastos: o que passou do limite, o que está acima do seu costume e quanto dá para guardar.'},
    {title: 'Metas sem valor alvo', go: 'metas', text: 'Dá para guardar sem um valor final e sem prazo. E o aviso de planejamento você escolhe em qual porcentagem do limite quer receber.'}
  ]}
];

export function latestId(log){ return log.length ? log[0].id : ''; }
// As novidades que a pessoa ainda não viu (as mais novas primeiro, no máximo `max`).
export function unseenReleases(log, lastSeen, max){
  return log.filter(function(r){ return r.id > (lastSeen || ''); }).slice(0, max || 3);
}
// Confere a forma do registro (usado no teste): ids de data em ordem decrescente, textos curtos e telas conhecidas.
export function validateChangelog(log, knownScreens){
  var prev = '9999-99-99';
  for (var i = 0; i < log.length; i++){
    var r = log[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.id)) return 'id fora do formato: ' + r.id;
    if (r.id >= prev) return 'os ids precisam diminuir de cima para baixo (' + r.id + ')';
    prev = r.id;
    if (!r.title || r.title.length > 60) return 'título ausente ou longo: ' + r.id;
    if (!r.items || r.items.length < 1 || r.items.length > 5) return 'de 1 a 5 itens por novidade: ' + r.id;
    for (var j = 0; j < r.items.length; j++){
      var it = r.items[j];
      if (!it.title || it.title.length > 60 || !it.text || it.text.length > 320) return 'item com título ou texto fora do tamanho: ' + r.id + ' #' + (j + 1);
      if (it.go && knownScreens && knownScreens.indexOf(it.go) < 0) return 'tela desconhecida em ' + r.id + ': ' + it.go;
    }
  }
  return '';
}
