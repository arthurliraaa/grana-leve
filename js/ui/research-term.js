// Texto do termo de consentimento da pesquisa. Ao mudar o conteúdo, aumente TERM_VERSION
// em domain/research.js: quem já aceitou será perguntado de novo.
import {TERM_VERSION, TERM_DATE} from '../domain/research.js';
import {formatDateFull} from '../domain/dates.js';

// online = true quando o app usa o servidor (Supabase); senão, a versão só no navegador.
export function termHtml(online){
  return '<div class="term">' +
    '<p class="term-meta">Versão ' + TERM_VERSION + ' · ' + formatDateFull(TERM_DATE) + '</p>' +
    '<h4>Sobre a pesquisa</h4>' +
    '<p>O Grana Leve faz parte de um projeto de extensão do curso de Engenharia de Software. O estudo quer entender como jovens e famílias usam uma ferramenta simples de controle financeiro, para melhorar o app e produzir o trabalho acadêmico.</p>' +
    '<h4>Participar é opcional</h4>' +
    '<p>Você pode usar o Grana Leve inteiro sem participar. Recusar ou sair do estudo não muda nada no app. Só participa quem tem 18 anos ou mais.</p>' +
    '<h4>O que é coletado</h4>' +
    '<ul>' +
      '<li><strong>Uso do app, de forma anônima:</strong> quais áreas e funções você usa e quantas vezes (por exemplo, “abriu Planejar gastos”, “usou o lançamento por mensagem”).</li>' +
      '<li><strong>Correções do lançamento por mensagem:</strong> quando o app entende uma frase errado e você corrige, registramos só qual campo foi corrigido (categoria, data, valor ou forma de pagamento), para melhorar o leitor de mensagens.</li>' +
      '<li><strong>Perfil opcional:</strong> faixa etária e estado (UF), se você quiser informar.</li>' +
    '</ul>' +
    '<h4>O que nunca é coletado</h4>' +
    '<p>Valores, descrições dos lançamentos, nomes de pessoas, contas, cartões, seu nome, e-mail e senha. No estudo, seus dados ficam ligados a um código aleatório, não à sua conta.</p>' +
    '<h4>Como os dados são usados</h4>' +
    '<ul>' +
      '<li>Só para fins acadêmicos e para melhorar o Grana Leve. Nada é vendido nem usado para propaganda.</li>' +
      '<li>Os resultados são divulgados apenas de forma agrupada (por exemplo, “60% dos participantes usam o planejamento”), sem identificar ninguém.</li>' +
      '<li>Os dados ficam guardados até o fim do projeto e depois são apagados.</li>' +
    '</ul>' +
    '<h4>Riscos e cuidados</h4>' +
    '<p>O risco é mínimo, porque não coletamos dados financeiros nem que identifiquem você. Mesmo assim, o acesso aos dados do estudo é restrito ao responsável pela pesquisa.</p>' +
    '<h4>Seus direitos (LGPD)</h4>' +
    '<p>A base legal é o seu consentimento (Lei 13.709/2018, art. 7º, I). Você pode, a qualquer momento: sair do estudo, pedir para ver os dados ligados ao seu código e pedir que sejam apagados. Para sair, use “Seus dados e backup” → “Sair do estudo”.</p>' +
    '<h4>Onde os dados do estudo ficam</h4>' +
    (online ?
      '<p>Num servidor no Brasil (Supabase, região São Paulo), separados da sua conta e protegidos por regras que só deixam o responsável pela pesquisa ver os números agrupados.</p>' :
      '<p>Nesta versão o Grana Leve funciona só no seu navegador e <strong>não envia nenhum dado</strong>. Sua resposta fica registrada, e a coleta só começa quando o app passar a ter servidor.</p>') +
    '<h4>Contato</h4>' +
    '<p>Dúvidas sobre a pesquisa: abra uma conversa em github.com/arthurliraaa/grana-leve (aba Issues).</p>' +
    '</div>';
}
