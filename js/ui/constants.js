/*
 * Textos e listas fixas da interface: rótulos, dicas, páginas de informação.
 * Parte da interface separada do app.js (veja o comentário no topo do app.js).
 */

import {CONTACT_EMAIL, TURNSTILE_SITE_KEY} from '../config.js';
import {escapeHtml} from './dom.js';

/* ============ Constants ============ */
export var PAYMENT_LABELS = {conta:'Dinheiro, Pix ou débito', vale:'Vale-alimentação / refeição', cartao:'Cartão de crédito'};
export var DEBT_KINDS = [
  {id:'banco', label:'Banco ou cartão'},
  {id:'emprestimo', label:'Empréstimo'},
  {id:'pessoal', label:'Pessoal (amigo ou familiar)'},
  {id:'financiamento', label:'Financiamento'},
  {id:'outro', label:'Outro'}
];
export var RECV_KINDS = [
  {id:'emprestimo', label:'Empréstimo que fiz'},
  {id:'cartao', label:'Compra no meu cartão'},
  {id:'combinado', label:'Valor combinado'},
  {id:'outro', label:'Outro'}
];
export var TIPS = [
  {tag:'Planejamento mensal', title:'Monte seu mês em 15 minutos',
   text:'Antes do dia 5, liste sua renda e separe em três blocos: essencial (moradia, contas, transporte), desejado (lazer, compras) e futuro (poupança, dívidas). Uma referência comum é 50/30/20. Ajuste à sua realidade, mas trate a poupança como parcela fixa, não como o que sobra no fim do mês.'},
  {tag:'Organização de gastos', title:'Registre na hora, não depois',
   text:'Na nossa pesquisa, 26 em cada 48 pessoas disseram esquecer de anotar gastos. O hábito quebra quando a gente deixa para depois. Anote o gasto assim que ele acontece, mesmo só com valor e categoria; ajustar detalhes depois é fácil, lembrar o gasto no fim da semana não é.'},
  {tag:'Cartão de crédito', title:'O limite do cartão não é renda',
   text:'O limite é crédito, não dinheiro seu: vira dívida se a fatura não for paga inteira. Antes de parcelar, pergunte: eu compraria isso à vista? Se a resposta for não, o parcelamento provavelmente está cobrindo uma compra que não cabia no orçamento.'},
  {tag:'Como economizar', title:'Pague-se primeiro',
   text:'Assim que o dinheiro entra, separe o valor da meta antes de gastar com qualquer outra coisa, mesmo que seja pouco. Poupar o que sobra raramente funciona porque quase sempre sobra pouco; poupar primeiro inverte essa lógica.'},
  {tag:'Sair das dívidas', title:'Ataque a dívida mais cara primeiro',
   text:'Liste as dívidas com a taxa de juros de cada uma. Pague o mínimo de todas, mas destine qualquer valor extra para quitar antes a de juros mais alto, geralmente o cartão de crédito. Isso reduz o total pago em juros mais rápido.'}
];
export var TIPS_GROW = [
  {tag:'Primeiro passo', title:'Reserva de emergência antes de investir',
   text:'Antes de buscar rendimento alto, junte o equivalente a 3 a 6 meses dos seus gastos essenciais em um lugar seguro e que permita sacar a qualquer momento. É ela que evita entrar no cheque especial quando surge um imprevisto.'},
  {tag:'Onde guardar', title:'Poupança não é a única opção',
   text:'Tesouro Selic e CDBs de liquidez diária que pagam 100% do CDI ou mais costumam render mais que a poupança, com risco baixo. CDBs têm proteção do FGC até R$ 250 mil por instituição. Compare sempre o rendimento já descontado o imposto.'},
  {tag:'Juros compostos', title:'O tempo trabalha a seu favor',
   text:'Guardar R$ 100 por mês a 0,8% ao mês vira cerca de R$ 7.600 em 5 anos, sendo uns R$ 1.600 só de rendimento. Começar cedo, mesmo com pouco, faz mais diferença do que começar tarde com muito.'},
  {tag:'Cuidado', title:'Desconfie de promessa de lucro fácil',
   text:'Rendimento garantido muito acima do mercado, pressão para decidir rápido e ganho por indicar amigos são sinais clássicos de golpe (pirâmide). Na dúvida, não invista no que você não consegue explicar.'},
  {tag:'Diversificar', title:'Não coloque tudo no mesmo lugar',
   text:'Depois da reserva pronta, dividir o dinheiro entre tipos diferentes de investimento (renda fixa de prazos diferentes, por exemplo) reduz o risco de um único problema afetar tudo o que você juntou.'}
];
// Guia "Como usar" (aba Aprenda e rodapé). Texto simples: o HTML é montado em learn-tab.js.
// Primeiros passos, na ordem em que fazem sentido: [título, explicação, área do app].
export var HOW_TO_STEPS = [
  ['Cadastre seus bancos e cartões', 'Em “Contas e cartões”, informe o saldo de hoje de cada conta e, se tiver, o cartão de crédito com limite, dia de fechamento e de vencimento. Assim o app sabe quanto você tem e em qual fatura cada compra cai.', 'cartoes'],
  ['Anote o que entra e o que sai', 'Toque no + (ou escreva no chat, como “gastei 30 no mercado”). Digite o valor como no banco (1.500,00), diga o que foi — a categoria vem sugerida — e como pagou. Comprou parcelado no cartão? Escolha o número de parcelas.', 'lancamentos'],
  ['Cadastre as contas de todo mês', 'Em “Ganhos e gastos → Contas fixas”, coloque luz, água, internet, aluguel e assinaturas. No dia de cada uma, o gasto entra sozinho; se o valor mudar (luz, água), é só ajustar naquele mês.', 'fixas'],
  ['Planeje e guarde', 'Em “Planejar gastos”, diga quanto quer gastar por categoria. Em “Metas”, crie objetivos e use “Guardar” sempre que separar dinheiro: o app mostra quanto guardar por mês e quando você chega lá.', 'limites'],
  ['Acompanhe pelo Início', 'A primeira tela resume o mês numa frase, mostra os próximos pagamentos e quantas parcelas já foram pagas e quantas faltam. Toque em um item para ir direto à área dele.', 'dashboard']
];
// Cada área do app: [nome, ícone, o que dá para fazer].
export var HOW_TO_AREAS = [
  ['Início', 'home', 'Resumo do mês: quanto tem, quanto gastou (e quanto do planejado), próximos pagamentos e parcelas. “Ver todos os detalhes do mês” abre gráficos, comparação com o mês passado e o relatório em PDF.'],
  ['Ganhos e gastos', 'list', 'Todos os lançamentos, com busca e filtros, em lista, calendário ou ano. Toque no lápis para corrigir; num gasto, dá para registrar um estorno. “Previstas” guarda o que você ainda vai receber.'],
  ['Contas fixas', 'calendar', 'Dentro de Ganhos e gastos: contas que se repetem (mensais, bimestrais, anuais), que são gastos do mês. Mostra o que vence, o que já foi lançado e o que está atrasado.'],
  ['Contas e cartões', 'wallet', 'Saldo de cada conta, faturas dos cartões (com pagamento parcial ou parcelado) e vale-alimentação. “Transferir” move dinheiro entre contas sem contar como gasto.'],
  ['Conselhos', 'bulb', 'Ideias gentis feitas a partir dos seus próprios gastos: o que passou do limite, o que está acima do seu costume, quanto dá para guardar. Aparecem no Início (os 3 principais) e aqui, todos. Dá para dispensar e, em alguns, aplicar a sugestão com um toque. São só sugestões de organização.'],
  ['Compromissos', 'handshake', 'Em Planejar: dinheiro entre você e outras pessoas. Em “Eu devo”, as dívidas agrupadas por quem cobra; em “Me devem”, quem te deve, com “Cobrar” (mensagem pronta no WhatsApp, com Pix) e “Compartilhar” (a pessoa acompanha no Grana Leve dela).'],
  ['Planejar gastos', 'pie', 'Limite por categoria em cada mês. A barra fica amarela perto do limite e vermelha quando passa. Categorias que você não usa ficam recolhidas.'],
  ['Metas', 'target', 'Objetivos com valor e prazo. Diga onde o dinheiro está (poupança, caixinha, CDB, Tesouro…) para a taxa ser calculada — e, se quiser, atualizada pelo Banco Central. Registre o que guardar, o rendimento e as retiradas; a meta mostra o ritmo, a previsão de conclusão e quanto guardar por mês.'],
  ['Aprenda', 'book', 'Dicas para organizar o dinheiro e fazer ele render, e este guia.'],
  ['Conexões', 'plug', 'Instalar o Grana Leve como app no celular e lembretes no Google Agenda. WhatsApp e Open Finance estão em preparação.'],
  ['Perfil e conta', 'user', 'Nome, e-mail, senha (com “Esqueci minha senha” por e-mail), tema, pesquisa, backup e exclusão da conta.']
];
// Dicas rápidas.
export var HOW_TO_TIPS = [
  'Botões menos usados (editar, excluir, registrar rendimento) ficam no ⋯ de cada cartão.',
  'As categorias que você mais usa aparecem primeiro; crie as suas em “Personalizar categorias”.',
  'Esqueceu a senha? Na tela de entrar, use “Esqueci minha senha”. O link vale por 1 hora e só o do e-mail mais recente funciona.',
  'Achou um problema ou tem uma ideia? Use “Ajuda e sugestões”, no menu: a mensagem chega para a equipe do Grana Leve.',
  'Salve um backup de vez em quando em “Seus dados e backup”.'
];
export var OPEN_FINANCE_BANKS = ['Nubank','Itaú','Bradesco','Banco do Brasil','Caixa','Santander','Inter','C6 Bank','Mercado Pago','PicPay'];
export var INFO_PAGES = {
  'sobre': {title:'Sobre o projeto', body:
    '<p>O Grana Leve nasceu na Atividade Extensionista do curso de Engenharia de Software, com o tema “Tecnologia aplicada à inclusão digital”. A proposta é uma ferramenta gratuita e simples de controle financeiro para jovens e famílias da comunidade local.</p>' +
    '<p>As funcionalidades foram definidas a partir de uma pesquisa anônima com 48 pessoas sobre hábitos financeiros, relacionada aos Objetivos de Desenvolvimento Sustentável 1 (erradicação da pobreza), 8 (trabalho decente e crescimento econômico) e 10 (redução das desigualdades).</p>'},
  'privacidade': {title:'Privacidade', body:
    '<p>Nesta versão, seus dados ficam salvos <strong>somente neste navegador</strong>, no seu aparelho. Nada é enviado para servidores do Grana Leve.</p>' +
    '<ul><li><strong>Não há sincronização:</strong> a conta só existe neste navegador. Em outro aparelho, é outra conta, vazia.</li>' +
    '<li><strong>Não há recuperação de senha:</strong> como não existe servidor, ninguém consegue redefinir a senha.</li>' +
    '<li>Se você limpar os dados do navegador, as informações são apagadas. Guarde um backup em “Seus dados e backup”.</li>' +
    '<li>A senha é guardada embaralhada (hash PBKDF2 com sal), nunca em texto puro. Isso protege a senha, mas os lançamentos ficam legíveis para quem usa este aparelho.</li>' +
    '<li>Não usamos cookies de rastreamento nem anúncios.</li>' +
    '<li>Você pode apagar sua conta e todos os seus dados a qualquer momento pelo botão abaixo (quando estiver conectado).</li></ul>'},
  'termos': {title:'Termos de uso', body:
    '<p>O Grana Leve é um projeto acadêmico oferecido gratuitamente, “como está”. Ele ajuda a organizar suas finanças, mas não substitui orientação profissional.</p>' +
    '<ul><li>Os conteúdos da aba Aprenda são educativos e não são recomendação de investimento.</li><li>Você é responsável pelas informações que registra.</li><li>Como os dados ficam no seu navegador, recomendamos exportar seus lançamentos em CSV de tempos em tempos.</li></ul>'},
  'contato': {title:'Contato', body:
    '<p>Sugestões, dúvidas ou problemas? Escreva para a equipe do Grana Leve:</p>' +
    '<p><a href="mailto:' + CONTACT_EMAIL + '"><strong>' + CONTACT_EMAIL + '</strong></a></p>' +
    '<p class="field-hint">Dentro do app, “Ajuda e sugestões” também chega até a gente. Não mande senhas nem dados de cartão.</p>'}
};

// Textos da versão com servidor (Supabase). A versão só no navegador continua em INFO_PAGES.
export var ONLINE_PAGES = {
  'privacidade': {title: 'Política de privacidade', body:
    '<div class="term">' +
    '<p class="term-meta">Atualizada em 10/10/2026</p>' +
    '<p>O Grana Leve guarda sua conta e seus dados num servidor no Brasil, para você usar o app em qualquer aparelho. Esta página explica o que guardamos, quem vê e como você controla seus dados.</p>' +
    '<h4>Quem é responsável</h4>' +
    '<p>O Grana Leve é um projeto de extensão do curso de Engenharia de Software, mantido por Arthur Lira, que é o controlador dos dados e o encarregado (LGPD, art. 41). ' +
      'Contato para assuntos de dados pessoais: <strong>' + escapeHtml(CONTACT_EMAIL) + '</strong>.</p>' +
    '<h4>O que guardamos</h4>' +
    '<ul><li><strong>Conta:</strong> nome, e-mail e senha. A senha é protegida pelo serviço de login: ninguém consegue lê-la, nem a administração do app.</li>' +
      '<li><strong>Entrar com o Google:</strong> o Google nos informa só o seu nome, e-mail e foto de perfil; não temos acesso à sua senha do Google, aos seus e-mails nem a outros dados da conta.</li>' +
      '<li><strong>O que você registra:</strong> lançamentos, contas, cartões, metas, dívidas, valores a receber (com o nome e, se você informar, o WhatsApp de quem te deve), compras divididas, contas fixas, histórico de pagamentos, previsões, planejamento e categorias.</li>' +
      '<li><strong>Neste aparelho:</strong> preferências como o tema e os avisos ficam só no seu navegador.</li></ul>' +
    '<h4>Para que usamos</h4>' +
    '<p>Só para o app funcionar para você (LGPD, art. 7º, V: execução do serviço que você pediu). Não vendemos, não usamos para propaganda e não compartilhamos seus dados.</p>' +
    '<h4>Quem pode ver</h4>' +
    '<p>Só você. As regras do banco impedem que outras pessoas, inclusive a administração do app, leiam seus lançamentos e valores. A administração vê apenas seu nome, e-mail, data de cadastro e último acesso (para suporte e para atender pedidos de exclusão) e números de uso somados de todas as pessoas.</p>' +
    '<h4>Onde os dados ficam</h4>' +
    '<ul><li><strong>Banco de dados e login:</strong> Supabase, na região São Paulo (Brasil).</li>' +
      '<li><strong>Site:</strong> Vercel, que hospeda as páginas e registra dados técnicos de acesso (como o endereço IP) por segurança.</li>' +
      '<li><strong>E-mails da conta</strong> (confirmação, nova senha e avisos de segurança): enviados pelo Brevo, que recebe só o seu e-mail e o conteúdo da mensagem.</li>' +
      '<li><strong>Arquivos públicos:</strong> o gerador de PDF e o leitor de PDF (cdnjs/Cloudflare) são baixados desse serviço, o primeiro quando você gera um PDF e o segundo quando escolhe um PDF para importar, e ele vê o endereço IP de quem pede. As fontes das letras ficam no próprio site.</li>' +
      (TURNSTILE_SITE_KEY ? '<li><strong>Proteção contra robôs:</strong> o cadastro e o “Esqueci minha senha” usam o Cloudflare Turnstile, que analisa dados técnicos do navegador.</li>' : '') +
      '</ul><p>Alguns desses serviços podem processar dados fora do Brasil, com as garantias previstas na LGPD (art. 33).</p>' +
    '<h4>Por quanto tempo</h4>' +
    '<p>Enquanto sua conta existir. Ao excluir a conta, tudo é apagado do banco na hora. Cópias de segurança do provedor podem guardar os dados por um período limitado até serem substituídas.</p>' +
    '<h4>Seus direitos (LGPD, art. 18)</h4>' +
    '<ul><li><strong>Ver e levar seus dados:</strong> “Seus dados e backup” → “Salvar backup”.</li>' +
      '<li><strong>Corrigir:</strong> edite qualquer registro no próprio app.</li>' +
      '<li><strong>Excluir:</strong> em “Perfil e conta” → “Excluir conta”, ou no botão “Apagar minha conta e dados”, abaixo.</li>' +
      '<li><strong>Pesquisa acadêmica:</strong> é opcional e separada; você entra ou sai em “Perfil e conta”. Veja o Termo da pesquisa.</li>' +
      '<li>Outros pedidos: use o contato acima.</li></ul>' +
    '<p>Não usamos cookies de rastreamento nem anúncios.</p>' +
    '</div>'},
  'termos': {title: 'Termos de uso', body:
    '<div class="term">' +
    '<p class="term-meta">Atualizados em 10/10/2026</p>' +
    '<p>O Grana Leve é um projeto acadêmico, gratuito, oferecido “como está”. Ele ajuda a organizar suas finanças, mas não substitui orientação profissional.</p>' +
    '<h4>Sua conta</h4>' +
    '<ul><li>Use um e-mail seu e guarde a senha com cuidado. Se esquecer, crie outra pelo “Esqueci minha senha”.</li>' +
      '<li>Você é responsável pelo que registra na sua conta.</li></ul>' +
    '<h4>Uso adequado</h4>' +
    '<p>Não use o Grana Leve para atividades ilegais, nem tente acessar dados de outras pessoas ou atrapalhar o serviço. Contas usadas assim podem ser bloqueadas.</p>' +
    '<h4>Disponibilidade</h4>' +
    '<ul><li>O app precisa de internet para abrir sua conta e salvar. Ele pode ficar fora do ar por manutenção ou por limites dos serviços gratuitos que usa.</li>' +
      '<li>Se o projeto for encerrado, avisaremos antes, com tempo para você salvar um backup.</li>' +
      '<li>Recomendamos salvar um backup de vez em quando em “Seus dados e backup”.</li></ul>' +
    '<h4>Conteúdo educativo</h4>' +
    '<p>As dicas da aba Aprenda são educativas e não são recomendação de investimento.</p>' +
    '<h4>Mudanças</h4>' +
    '<p>Se estes termos mudarem de forma importante, avisaremos no app.</p>' +
    '</div>'}
};
