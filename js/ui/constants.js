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
export var HOW_TO = [
  ['Painel', 'mostra o resumo do mês: saldo, ganhos, gastos, previsões de entrada e gráficos. O botão “Relatório em PDF” gera um resumo para guardar ou compartilhar.'],
  ['Ganhos e gastos', 'é onde você anota o que entra e o que sai e deixa previsto o que ainda vai receber. Escolha a forma de pagamento (conta, dinheiro, vale ou cartão) e crie e personalize categorias (nome, emoji e cor) em “Personalizar categorias”.'],
  ['Contas e cartões', 'cadastre suas contas de banco com o saldo de hoje, o cartão com limite, fechamento e vencimento e o seu vale-alimentação. O saldo de cada conta acompanha os ganhos e gastos ligados a ela; use “Transferir” para mover dinheiro entre contas e escolha a conta ao marcar uma fatura como paga.'],
  ['Planejar gastos', 'defina quanto quer gastar por categoria. A barra fica amarela perto do valor planejado e vermelha quando passa.'],
  ['Metas', 'crie objetivos com prazo, guarde valores aos poucos e escolha em “Me avise em” quando quer um lembrete na sua agenda.'],
  ['Dívidas', 'registre o que você deve, para banco ou para pessoas, e marque cada parcela paga.'],
  ['A receber', 'anote o que te devem e use “Cobrar” para enviar uma mensagem pronta.'],
  ['Botão +', 'fica sempre no canto da tela e abre o formulário para lançar um gasto ou ganho. Para corrigir um lançamento, toque no lápis ao lado dele.'],
  ['Chat de lançamento', 'aparece ao entrar, uma vez por dia, e também pelo link “Lance pelo chat” no botão +. Escreva como numa conversa: “gastei 30 no mercado e 20 no uber”.'],
  ['Conexões', 'mostra as integrações: app no celular e Google Agenda (já disponíveis), WhatsApp e Open Finance (em preparação).'],
  ['Seus dados e backup', 'abre pelo indicador “Só neste navegador”, no topo, ou pelo rodapé. Mostra onde os dados ficam e quando foi o último backup. Salve um backup de vez em quando: seus dados existem só neste navegador.']
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
    '<p>Sugestões, dúvidas ou problemas? O código do projeto está no GitHub, onde você pode abrir uma <em>issue</em>:</p>' +
    '<p><strong>github.com/arthurliraaa/grana-leve</strong></p>'}
};

// Textos da versão com servidor (Supabase). A versão só no navegador continua em INFO_PAGES.
export var ONLINE_PAGES = {
  'privacidade': {title: 'Política de privacidade', body:
    '<div class="term">' +
    '<p class="term-meta">Atualizada em 10/10/2026</p>' +
    '<p>O Grana Leve guarda sua conta e seus dados num servidor no Brasil, para você usar o app em qualquer aparelho. Esta página explica o que guardamos, quem vê e como você controla seus dados.</p>' +
    '<h4>Quem é responsável</h4>' +
    '<p>O Grana Leve é um projeto de extensão do curso de Engenharia de Software, mantido por Arthur Lira, que é o controlador dos dados e o encarregado (LGPD, art. 41). ' +
      (CONTACT_EMAIL ? 'Contato para assuntos de dados pessoais: <strong>' + escapeHtml(CONTACT_EMAIL) + '</strong>.' :
        'Contato: github.com/arthurliraaa/grana-leve (aba Issues). Não escreva dados pessoais ou financeiros numa issue, porque ela é pública.') + '</p>' +
    '<h4>O que guardamos</h4>' +
    '<ul><li><strong>Conta:</strong> nome, e-mail e senha. A senha é protegida pelo serviço de login: ninguém consegue lê-la, nem a administração do app.</li>' +
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
      '<li><strong>Arquivos públicos:</strong> a fonte das letras (Google Fonts) e o gerador de PDF (cdnjs/Cloudflare) são baixados desses serviços, que veem o endereço IP de quem abre a página.</li>' +
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
