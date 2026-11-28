/*
 * Grana, o mascote: responde dúvidas sobre o que o app faz entendendo o SENTIDO da pergunta, não só as palavras exatas.
 * Tudo roda no aparelho (nada do que a pessoa escreve vai para servidor). Como entende:
 *   1. normaliza (sem acento, sem pontuação) e reduz as palavras à raiz (“gastei”, “gastos”, “gastar” → “gast”);
 *   2. agrupa palavras de mesmo sentido em conceitos (“despesa”, “compra”, “paguei” → GASTO), então “como anoto uma despesa?”
 *      encontra a resposta sobre lançar gastos mesmo sem a palavra “gasto”;
 *   3. compara a pergunta com cada assunto por similaridade (TF-IDF + cosseno), tolerando erros de digitação;
 *   4. responde se está seguro; se não, sugere os assuntos mais próximos em vez de chutar.
 * É um entendimento leve e limitado ao que está em KB (não é um assistente aberto): quando não sabe, diz e oferece falar com a equipe.
 */

// Assuntos que o Grana sabe explicar. q: jeitos de perguntar (também treinam o entendimento); a: resposta para quem ainda não
// tem conta (visitor) e para quem já usa (member); go: para onde o botão leva quem já usa (nome aceito por showTab).
export var KB = [
  {id: 'lancar', topic: 'Lançar gastos e ganhos', go: {label: 'Lançar agora', screen: 'lancamentos'},
    q: ['como lanço um gasto', 'como anoto uma despesa', 'registrar um ganho', 'adicionar uma compra', 'escrever gastei 30 no mercado', 'anotar o que eu paguei', 'cadastrar uma entrada de dinheiro', 'botão de mais para lançar'],
    visitor: 'É bem rápido: você escreve do seu jeito, como “gastei 30 no mercado”, e eu entendo o valor, a categoria e a data. Você só confere e salva. Também dá para preencher o formulário.',
    member: 'Toque no + (ou em “Lançar gasto ou ganho”). Dá para escrever do seu jeito, como “gastei 30 no mercado”: o app entende e você confere antes de salvar.'},
  {id: 'cartoes', topic: 'Cartões e faturas', go: {label: 'Ver cartões', screen: 'cartoes'},
    q: ['como funciona o cartão de crédito', 'fatura do cartão', 'dia de fechamento e vencimento', 'limite do cartão', 'compra parcelada no cartão', 'pagar a fatura', 'quanto falta pagar da fatura', 'minha parte da fatura', 'compras parceladas no cartão', 'parcelas do cartão de crédito', 'o app entende o fechamento do cartão'],
    visitor: 'Você cadastra o cartão com o dia de fechamento e de vencimento, e o app separa cada compra na fatura certa, controla as parcelas, o limite usado e quanto falta pagar. Dá até para ver só a sua parte quando alguém usa o seu cartão.',
    member: 'Em Contas e cartões você cadastra o cartão (fechamento e vencimento) e vê cada fatura, as parcelas e o limite. Dá para pagar a fatura, adiantar parcelas e ver só a sua parte.'},
  {id: 'contas', topic: 'Contas bancárias e saldo', go: {label: 'Ver contas', screen: 'cartoes'},
    q: ['cadastrar minha conta do banco', 'ver meu saldo', 'quanto eu tenho', 'transferir entre contas', 'ajustar o saldo da conta', 'vários bancos', 'saldo da conta corrente', 'pix e débito'],
    visitor: 'Você cadastra seus bancos e o app mostra quanto você tem em cada conta, desconta o que sai no Pix ou no débito e permite transferir entre contas e ajustar o saldo quando ele não bater.',
    member: 'Em Contas e cartões você cadastra o banco com o saldo de hoje. O saldo acompanha o que entra e sai, e dá para transferir entre contas e ajustar o saldo.'},
  {id: 'metas', topic: 'Metas e guardar dinheiro', go: {label: 'Ver metas', screen: 'metas'},
    q: ['quero juntar dinheiro', 'guardar para uma viagem', 'criar uma meta', 'poupar todo mês', 'sonho objetivo reserva de emergência', 'meta sem valor final', 'quanto falta para minha meta'],
    visitor: 'Em Metas você escolhe um objetivo (viagem, reserva…), guarda aos poucos e vê quanto falta e quando chega lá. Pode até ser uma meta sem valor final e sem prazo.',
    member: 'Em Metas você cria o objetivo, guarda valores e acompanha quanto falta e a previsão. Dá para criar meta sem valor alvo e sem prazo.'},
  {id: 'planejar', topic: 'Planejar quanto gastar', go: {label: 'Planejar gastos', screen: 'limites'},
    q: ['definir um limite por categoria', 'orçamento do mês', 'quanto posso gastar', 'controlar meus gastos', 'aviso quando passar do limite', 'gastar menos', 'planejamento por categoria'],
    visitor: 'Você define quanto quer gastar em cada categoria (mercado, lazer…) e o app avisa com gentileza quando você chega perto do limite, na porcentagem que escolher.',
    member: 'Em Planejar gastos você define o limite de cada categoria. O app avisa quando você chega perto (você escolhe a porcentagem) e quando passa.'},
  {id: 'conselhos', topic: 'Conselhos gentis', go: {label: 'Ver conselhos', screen: 'conselhos'},
    q: ['me dá uma dica de economia', 'sugestões para economizar', 'o app dá conselhos', 'como posso guardar mais', 'onde estou gastando demais', 'ideias para melhorar minhas finanças'],
    visitor: 'Eu olho os seus próprios gastos e dou ideias gentis: o que passou do limite, o que está acima do seu costume e quanto dá para guardar. Sem julgamento.',
    member: 'Em Conselhos ficam as ideias feitas a partir dos seus gastos: o que passou do limite, o que está acima do seu costume e quanto dá para guardar.'},
  {id: 'simular', topic: 'Simular uma compra', go: {label: 'Simular', screen: 'simular'},
    q: ['e se eu comprar isso', 'posso comprar um celular parcelado', 'simular um financiamento', 'vai sobrar dinheiro depois da compra', 'testar uma compra antes de fazer', 'empréstimo cabe no meu bolso', 'como ficam meus meses se eu parcelar'],
    visitor: 'Antes de uma compra grande, você simula: escolhe cartão, à vista, financiamento ou o dinheiro de uma meta, e vê como ficam as suas contas mês a mês. Nada é registrado até você pedir.',
    member: 'Na guia Simular (em Ganhos e gastos) você vê mês a mês como ficam as contas com a compra, no cartão, à vista, financiando ou com o dinheiro de uma meta. Só registra se você pedir.'},
  {id: 'salario', topic: 'Salário líquido, 13º e férias', go: {label: 'Calcular o salário', screen: 'lancamentos'},
    q: ['calcular meu salário líquido', 'quanto sobra do salário depois do desconto', 'inss e imposto de renda', 'sou clt mei ou autônomo', 'calcular décimo terceiro', 'quanto recebo de férias', 'horas extras e sobreaviso', 'vale transporte e plano de saúde descontados', 'fgts', 'como entram as horas extras no cálculo', 'horas extras e adicional noturno', 'calculadora de férias e décimo terceiro', 'quanto sobra do meu salário', 'meu salário depois dos descontos', 'tenho dois empregos', 'mais de um emprego e vários salários', 'posso colocar mais de um emprego'],
    visitor: 'Tem uma calculadora que estima o líquido para CLT, servidor, MEI, autônomo, PJ e estágio: INSS, imposto de renda, descontos (vale-transporte, plano de saúde…), ganhos extras, horas extras, sobreaviso, FGTS, 13º e férias. Tem mais de um emprego? Dá para cadastrar cada um e somar o líquido. É uma estimativa para ajudar a planejar.',
    member: 'Em Ganhos e gastos, abra “Previstas” e toque em “Calcular o líquido do salário” (CLT, MEI…), com descontos, extras, 13º e férias. Mais de um emprego? “Tenho mais de um emprego”: cada um tem o seu cálculo. O 13º tem botão em “Meu salário”, antes do salário. Benefício em outro dia? Marque “Cai separado do salário” e o dia.'},
  {id: 'salario_previsto', topic: 'Salário previsto e “já caiu?”', go: {label: 'Meu salário', screen: 'dashboard'},
    q: ['saber quando meu salário cai', 'quinto dia útil', 'confirmar que o salário caiu', 'acompanhar reajuste e aumento', 'evolução do meu salário', 'prever o salário todo mês', 'salário que varia'],
    visitor: 'Você diz em que dia o salário cai (por exemplo, o 5º dia útil) e, quando chega, o app pergunta “já caiu?” para você confirmar os valores do mês. Os reajustes e a evolução do salário ficam guardados.',
    member: 'Depois de calcular o líquido, toque em “Prever meu salário” no Início: escolha o dia (ou o dia útil) e, quando chegar, eu pergunto “já caiu?”. A evolução e os reajustes ficam em Meu salário.'},
  {id: 'importar', topic: 'Importar extrato do banco', go: {label: 'Importar extrato', screen: 'lancamentos'},
    q: ['importar o extrato do banco', 'ler arquivo ofx', 'subir um csv da fatura', 'pdf do extrato', 'trazer os lançamentos do banco', 'não quero digitar tudo', 'baixar o extrato e colocar no app', 'extrato do nubank', 'aceita pdf da fatura', 'ler o pdf da fatura do cartão', 'posso subir o arquivo do banco'],
    visitor: 'Dá para importar o extrato: o OFX ou o CSV (gerados no app ou no site do banco) dão a leitura mais exata, e o PDF também funciona. Você confere tudo antes de importar, o app evita lançar duas vezes e dá para desfazer.',
    member: 'Em Ganhos e gastos, toque em “Importar extrato” e escolha o arquivo (OFX ou CSV do banco são os mais exatos; PDF também). Você confere antes de importar e pode desfazer.'},
  {id: 'dividas', topic: 'Dívidas e quem te deve', go: {label: 'Ver compromissos', screen: 'compromissos'},
    q: ['anotar uma dívida', 'emprestei dinheiro para um amigo', 'quem me deve', 'cobrar uma pessoa', 'parcelas de empréstimo', 'eu devo dinheiro', 'lembrar de receber', 'cobrança compartilhada'],
    visitor: 'Em Compromissos você acompanha o que deve (dívidas e empréstimos, com parcelas) e o que te devem, com histórico de pagamentos. Dá até para compartilhar a cobrança com a outra pessoa.',
    member: 'Em Compromissos você registra o que deve e o que te devem, com parcelas e histórico, e pode compartilhar a cobrança com a outra pessoa.'},
  {id: 'fixas', topic: 'Contas fixas', go: {label: 'Ver contas fixas', screen: 'fixas'},
    q: ['conta de luz todo mês', 'aluguel e assinaturas', 'boleto que vence todo mês', 'contas recorrentes', 'lançar sozinho no dia do vencimento', 'streaming mensalidade', 'conta que muda de valor'],
    visitor: 'Em Contas fixas (luz, aluguel, assinaturas…) você cadastra uma vez e o app lança sozinho no dia do vencimento, avisa o que está perto e deixa mudar o valor “a partir de” um mês.',
    member: 'Em Ganhos e gastos → Contas fixas você cadastra a conta uma vez; ela entra sozinha no dia do vencimento e dá para mudar o valor a partir de um mês.'},
  {id: 'relatorios', topic: 'Relatórios, gráficos e PDF', go: {label: 'Ver o Início', screen: 'dashboard'},
    q: ['gráficos do mês', 'relatório em pdf', 'baixar csv dos lançamentos', 'comparar com o mês passado', 'resumo mensal', 'para onde vai meu dinheiro', 'fatura em pdf', 'exportar meus dados'],
    visitor: 'O Início mostra o mês de relance e, em “detalhes”, gráficos por categoria, comparação com o mês passado e parcelas. Também dá para baixar relatório e faturas em PDF e os lançamentos em CSV.',
    member: 'No Início, “Ver todos os detalhes do mês” mostra os gráficos e a comparação. O relatório e as faturas saem em PDF, e os lançamentos em CSV (“Baixar CSV” em Ganhos e gastos).'},
  {id: 'dados', topic: 'Privacidade, segurança e backup', go: {label: 'Seus dados', screen: 'perfil'},
    q: ['meus dados estão seguros', 'quem vê meus lançamentos', 'privacidade e lgpd', 'fazer backup', 'onde ficam minhas informações', 'posso apagar tudo', 'excluir minha conta', 'é confiável colocar meus gastos', 'quem pode ver o que eu lanço', 'alguém vê meus gastos', 'meus dados ficam protegidos'],
    visitor: 'Seus lançamentos são só seus: cada conta enxerga apenas os próprios dados, e eu não envio o que você escreve para lugar nenhum. Dá para fazer backup, exportar e excluir a conta quando quiser, e a política está dentro do app.',
    member: 'Seus dados são só seus. Em Perfil → “Seus dados e segurança” você faz backup, vê onde ficam e pode apagar os dados ou excluir a conta.'},
  {id: 'preco', topic: 'Preço', q: ['é grátis', 'quanto custa', 'tem que pagar', 'tem plano pago', 'cobram alguma coisa', 'é de graça', 'preciso de cartão para usar'],
    visitor: 'É 100% gratuito e não pede cartão de crédito.', member: 'É 100% gratuito.'},
  {id: 'instalar', topic: 'Celular, instalar e usar sem internet', go: {label: 'Ver o tutorial', screen: 'perfil'},
    q: ['funciona no celular', 'instalar na tela inicial', 'tem aplicativo', 'dá para usar sem internet', 'funciona offline', 'baixar na loja', 'android ou iphone'],
    visitor: 'É feito para o celular e funciona no navegador. Dá para instalar na tela inicial como um app (pelo menu do navegador) e abrir mesmo sem internet.',
    member: 'Funciona no navegador e dá para instalar na tela inicial (pelo menu do navegador). Depois de aberto uma vez, abre até sem internet.'},
  {id: 'comecar', topic: 'Por onde começar', go: {label: 'Ver o tutorial', screen: 'perfil'},
    q: ['por onde começo', 'como usar o app', 'primeiros passos', 'tem tutorial', 'não entendi nada', 'o que o app faz', 'para que serve', 'sou novo aqui'],
    visitor: 'Crie a conta e siga o tutorial rápido: depois vem a configuração, em poucos passos: seus bancos e cartões, o salário (se tiver) e extras como vale-alimentação e contas fixas. Daí é só lançar os gastos. O resto eu monto: faturas, saldo e gráficos.',
    member: 'Siga os “Primeiros passos” no Início ou toque em “Configuração guiada”: bancos e cartões, salário, primeiro gasto e limites. O tutorial e a Configuração rápida podem ser refeitos em Perfil.'},
  {id: 'conta', topic: 'Conta, senha e login', go: {label: 'Perfil e conta', screen: 'perfil'},
    q: ['como crio uma conta', 'esqueci minha senha', 'entrar com o google', 'trocar o e-mail', 'mudar a senha', 'sair da conta', 'fazer login'],
    visitor: 'Para criar a conta, toque em “Criar conta grátis” (e-mail e senha, ou Google). Se esquecer a senha, há “Esqueci minha senha” na tela de entrar.',
    member: 'Em Perfil você troca o nome, o e-mail e a senha e pode sair da conta. Esqueceu a senha? Use “Esqueci minha senha” na tela de entrar.'},
  {id: 'categorias', topic: 'Categorias', go: {label: 'Personalizar categorias', screen: 'lancamentos'},
    q: ['criar uma categoria', 'personalizar categorias', 'mudar a categoria de um gasto', 'categoria nova com emoji', 'organizar por tipo de gasto'],
    visitor: 'As categorias já vêm prontas (moradia, alimentação, lazer…) e você pode criar as suas, com emoji e cor.',
    member: 'Em Ganhos e gastos, “Personalizar categorias” deixa criar categorias com emoji e cor. Dá para trocar a categoria de um lançamento quando quiser.'},
  {id: 'dividir', topic: 'Dividir compras com outras pessoas', go: {label: 'Lançar agora', screen: 'lancamentos'},
    q: ['dividir uma compra com um amigo', 'alguém pagou por mim', 'paguei por outra pessoa', 'dividir a conta', 'casal e família', 'gasto de terceiros no meu cartão', 'minha parte e a do outro'],
    visitor: 'Dá para lançar uma compra dividida ou paga por outra pessoa: o app separa a sua parte do que é dos outros e acompanha quem ainda te deve.',
    member: 'Ao lançar, abra “Pagou por alguém ou vai dividir com outras pessoas?”. O app separa a sua parte e acompanha o que as outras pessoas te devem.'},
  {id: 'avisos', topic: 'Avisos no celular', go: {label: 'Ver o Perfil', screen: 'perfil'},
    q: ['avisa quando a fatura vence', 'notificação no celular', 'lembrete de conta', 'alerta de vencimento', 'me lembra de pagar', 'avisos push'],
    visitor: 'Dentro do app eu aviso com gentileza quando um limite está perto e quando o salário deveria ter caído. Em Perfil dá para ligar os avisos no celular (precisa de conta online) e programar os seus: lançar gastos, importar o extrato, fatura, conta fixa, salário e o dia em que o vale cai, com o horário que você quiser.',
    member: 'No app eu aviso quando um limite está perto e pergunto “já caiu?” no dia do salário. Em Perfil, “Avisos no celular”: ligue neste aparelho e programe o que avisar (fatura, conta fixa, salário e os seus lembretes, como lançar gastos ou importar o extrato), com quantos dias antes e a que horas. Os avisos não mostram valores.'},
  {id: 'equipe', topic: 'Falar com a equipe', go: {label: 'Ajuda e sugestões', screen: 'perfil'},
    q: ['falar com alguém', 'achei um erro', 'quero sugerir uma melhoria', 'preciso de suporte', 'quem criou o app', 'contato da equipe', 'reclamar de um problema'],
    visitor: 'O Grana Leve nasceu de uma pesquisa acadêmica e tem uma equipe que lê as mensagens. Depois de criar a conta, use “Ajuda e sugestões” para falar com ela.',
    member: 'Em Perfil, “Ajuda e sugestões” envia a sua mensagem direto para a equipe do Grana Leve.'}
];

// Conversa simples: cumprimentos, agradecimento, quem sou eu, o que sei fazer.
var SMALL = [
  {id: 'oi', rx: /^(oi+|ola+|opa|e ai|eai|bom dia|boa tarde|boa noite|hey|hello|salve)\b/, text: 'Oi! Eu sou o Grana 💚 Pode me perguntar o que o app faz: lançar gastos, cartões, metas, salário, importar extrato… O que você quer saber?'},
  {id: 'obrigado', rx: /\b(obrigad[oa]|valeu|brigad[oa]|agradeco|thanks)\b/, text: 'De nada! Estou por aqui se quiser saber mais 💚'},
  {id: 'quem', rx: /\b(quem (e|eh|é) voce|seu nome|como (voce )?se chama|voce (e|eh) (um )?(robo|ia|humano)|mascote|grana)\b/, text: 'Eu sou o Grana, o mascote do Grana Leve! Fico aqui para tirar dúvidas sobre o app. Não sou uma pessoa nem uma inteligência aberta: conheço bem o que o app faz e, quando não sei, eu digo.'},
  {id: 'tchau', rx: /^(tchau|ate (logo|mais|breve)|flw|falou)\b/, text: 'Até mais! Qualquer dúvida, é só chamar 👋'}
];

/* ---------- entendimento do texto ---------- */

var STOP = ('a o as os um uma uns umas de do da dos das em no na nos nas por pra para com sem e ou que se me te nos meu minha meus minhas seu sua eu voce ' +
  'tu ele ela isso isto esse essa este esta aqui la ai tem ter tenho posso pode podem consigo como qual quais quando onde porque por que ' +
  'ja mais muito muita so tambem vai vou ser sao esta estou foi era fazer faz fazem tudo todo toda quero queria gostaria preciso gosto ' +
  'app aplicativo grana leve sobre mim').split(' ');
var STOPSET = {}; STOP.forEach(function(w){ STOPSET[w] = true; });

export function normalize(text){
  return String(text == null ? '' : text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s$]/g, ' ').replace(/\s+/g, ' ').trim();
}
var SUFFIXES = ['amentos', 'imentos', 'amento', 'imento', 'acoes', 'icoes', 'acao', 'icao', 'adora', 'ador', 'mente', 'ando', 'endo', 'indo', 'avel', 'ivel', 'oso', 'osa', 'ante', 'ente', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'ei', 'ou', 'am', 'em', 'ao', 'a', 'o', 'e'];
// Raiz aproximada de uma palavra (suficiente para “gastei/gastos/gastar” baterem): tira o plural e depois uma terminação.
export function stem(w){
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/oes$/.test(w) && w.length > 5) w = w.slice(0, -3) + 'ao';
  else if (/s$/.test(w) && w.length > 4) w = w.slice(0, -1);
  for (var i = 0; i < SUFFIXES.length; i++){
    var s = SUFFIXES[i];
    if (w.length - s.length >= 3 && w.slice(-s.length) === s){ w = w.slice(0, -s.length); break; }
  }
  return w;
}

// Conceitos: palavras (já em raiz) de mesmo sentido. Cada uma vira também o traço @CONCEITO.
var CONCEPTS = {
  GASTO: 'gast despes compr pagu pag desembols saiu sair debit consum',
  GANHO: 'ganh receb entr renda rendiment deposit salari pagament',
  CARTAO: 'cart fatur credit fechament vencim limit parcel',
  CONTA: 'banc cont saldo corrent nubank itau inter bradesc santander caixa pix transfer',
  META: 'met objetiv sonh poup junt guard reserv econom viagem',
  PLANO: 'planej orcament limit categor controlar control gastar',
  DICA: 'conselh dic sugest ideia economiz melhor',
  SIMULAR: 'simul financi emprest parcel compar testar cabe sobr',
  SALARIO: 'salari liquid inss irrf clt mei autonom pj estagi decim terce ferias hora extra sobreavis fgts descont vale transport',
  IMPORT: 'import extrat ofx csv pdf arquiv subir trazer baix ler',
  DIVIDA: 'divid devo deve devi cobr emprest fiad receber',
  FIXA: 'fix recorr assinatur aluguel luz agua internet mensalid boleto vencer mes',
  RELAT: 'grafic relatori resum compar exportar pdf csv',
  DADOS: 'dad segur privac lgpd backup apag exclu confi seguro senh',
  PRECO: 'grat gratuit preco custo cust plan pago pagar cobr',
  APP: 'instal celular android iphone offline internet navegador tela inicial aplic',
  COMECO: 'comec inici primeir tutorial entend usar serve',
  CONTAUSER: 'login entr cadastr cri senha google email sair',
  AVISO: 'avis notific lembr alert push',
  COMPART: 'compart casal famil amig terceir divid',
  EQUIPE: 'equip suporte contat sugest erro problem reclam criou'
};
var CONCEPT_OF = {};
Object.keys(CONCEPTS).forEach(function(c){ CONCEPTS[c].split(' ').forEach(function(w){ var k = stem(normalize(w)); (CONCEPT_OF[k] = CONCEPT_OF[k] || []).push(c); }); });

function tokens(text){
  return normalize(text).split(' ').filter(function(w){ return w && !STOPSET[w]; }).map(stem);
}
function features(toks){
  var f = {};
  toks.forEach(function(t){
    f[t] = (f[t] || 0) + 1;
    (CONCEPT_OF[t] || []).forEach(function(c){ f['@' + c] = (f['@' + c] || 0) + 0.8; });
  });
  return f;
}

// Índice dos assuntos (calculado uma vez): vetor TF-IDF de cada um.
var INDEX = null;
function build(){
  var docs = KB.map(function(e){ return features(tokens([e.topic].concat(e.q).concat(e.q).join(' '))); });
  var df = {}, vocab = {};
  docs.forEach(function(d){ Object.keys(d).forEach(function(k){ df[k] = (df[k] || 0) + 1; if (k[0] !== '@') vocab[k] = true; }); });
  var n = docs.length, idf = {};
  Object.keys(df).forEach(function(k){ idf[k] = Math.log(1 + n / df[k]); });
  var vecs = docs.map(function(d){ return weigh(d, idf); });
  INDEX = {idf: idf, vecs: vecs, vocab: Object.keys(vocab)};
}
function weigh(f, idf){
  var v = {}, norm = 0;
  Object.keys(f).forEach(function(k){ var w = (1 + Math.log(f[k])) * (idf[k] || 0); if (w > 0){ v[k] = w; norm += w * w; } });
  v._n = Math.sqrt(norm) || 1;
  return v;
}
function cosine(a, b){
  var dot = 0;
  Object.keys(a).forEach(function(k){ if (k !== '_n' && b[k]) dot += a[k] * b[k]; });
  return dot / (a._n * b._n);
}
function distance(a, b){
  if (Math.abs(a.length - b.length) > 2) return 3;
  var prev = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++){
    var cur = [i];
    for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Palavra fora do vocabulário (erro de digitação): a mais parecida, se for bem parecida.
function repair(t){
  if (INDEX.idf[t] || t.length < 4 || CONCEPT_OF[t]) return t;
  var best = t, bestD = t.length >= 8 ? 3 : 2;
  INDEX.vocab.forEach(function(w){ if (w[0] === t[0]){ var d = distance(t, w); if (d < bestD){ bestD = d; best = w; } } });
  return best;
}

/**
 * Responde a uma pergunta. ctx: {member: true se já tem conta}.
 * Devolve {kind: 'answer'|'suggest'|'small'|'none', id, text, go, chips: [textos de assuntos], score}.
 */
export function ask(text, ctx){
  var member = !!(ctx && ctx.member), q = normalize(text);
  if (!q) return {kind: 'none', id: '', text: 'Pode escrever a sua dúvida, por exemplo: “como lanço um gasto?”.', chips: starterChips()};
  for (var i = 0; i < SMALL.length; i++){
    if (SMALL[i].rx.test(q) && q.split(' ').length <= 6) return {kind: 'small', id: SMALL[i].id, text: SMALL[i].text, chips: starterChips()};
  }
  if (/\b(o que (o )?(app|aplicativo|grana leve|isso) (faz|serve|e)|para que serve|pra que serve|o que e o grana)\b/.test(q)) return answerOf({e: KB.filter(function(x){ return x.id === 'comecar'; })[0], s: 1}, member);
  if (/\b(o que (voce|vc) (faz|sabe|pode)|ajuda|no que (voce )?pode)\b/.test(q) && q.split(' ').length <= 8)
    return {kind: 'small', id: 'ajuda', text: 'Eu posso explicar o que o app faz. Escolha um assunto ou escreva a sua dúvida:', chips: starterChips()};
  if (!INDEX) build();
  var toks = tokens(q).map(repair), f = features(toks);
  if (!Object.keys(f).length) return {kind: 'none', id: '', text: 'Não entendi bem. Pode contar de outro jeito? Por exemplo: “como lanço um gasto?”.', chips: starterChips()};
  var v = weigh(f, INDEX.idf);
  var scored = KB.map(function(e, k){ return {e: e, s: cosine(v, INDEX.vecs[k])}; }).sort(function(a, b){ return b.s - a.s; });
  var top = scored[0], second = scored[1];
  if (top.s >= 0.30 && top.s - second.s >= 0.04) return answerOf(top, member);
  if (top.s >= 0.18){
    var near = scored.filter(function(x){ return x.s >= 0.12; }).slice(0, 3);
    return {kind: 'suggest', id: '', score: top.s, text: 'Acho que você quer saber sobre um destes assuntos. Qual deles?', chips: near.map(function(x){ return x.e.topic; }), ids: near.map(function(x){ return x.e.id; })};
  }
  return {kind: 'none', id: '', score: top.s, text: 'Ainda não sei responder isso. Eu conheço bem o que o app faz (lançar gastos, cartões, metas, salário, importar extrato…). Se for outra coisa, a equipe pode ajudar.',
    chips: starterChips()};
}
function answerOf(x, member){
  var e = x.e;
  return {kind: 'answer', id: e.id, score: x.s, text: member ? e.member : e.visitor, topic: e.topic, go: member && e.go ? e.go : null, chips: related(e.id)};
}
// Resposta direta por assunto (quando a pessoa toca num chip).
export function topicAnswer(id, ctx){
  var e = KB.filter(function(x){ return x.id === id; })[0];
  return e ? answerOf({e: e, s: 1}, !!(ctx && ctx.member)) : null;
}
export function topicIdByLabel(label){ var e = KB.filter(function(x){ return x.topic === label; })[0]; return e ? e.id : ''; }
export function starterChips(){ return ['Lançar gastos e ganhos', 'Importar extrato do banco', 'Salário líquido, 13º e férias', 'Metas e guardar dinheiro', 'Cartões e faturas', 'Preço']; }
function related(id){
  var map = {lancar: ['Importar extrato do banco', 'Categorias'], cartoes: ['Contas bancárias e saldo', 'Simular uma compra'], salario: ['Salário previsto e “já caiu?”'], salario_previsto: ['Salário líquido, 13º e férias'],
    importar: ['Lançar gastos e ganhos', 'Cartões e faturas'], metas: ['Planejar quanto gastar'], simular: ['Cartões e faturas'], dados: ['Preço']};
  return map[id] || ['Por onde começar'];
}
