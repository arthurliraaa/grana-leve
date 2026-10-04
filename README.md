# Grana Leve 💸

Ferramenta de controle financeiro pessoal para jovens e famílias. Nasceu do projeto
de Atividade Extensionista (Engenharia de Software), a partir de uma pesquisa com 48
pessoas sobre hábitos financeiros.

## Funcionalidades

- **Chat de lançamento**: ao entrar (uma vez por dia) o app pergunta se houve gasto ou
  ganho. Entende frases como “gastei 30 no mercado e 20 no uber” ou “recebi 1.500 de
  salário ontem”.
- **Painel**: saldo, ganhos (com previsão de entradas), gastos, metas, dívidas e valores
  a receber; gráficos com opção de tabela e período de 3, 6 ou 12 meses; relatório em PDF.
- **Ganhos e gastos**: categorias personalizadas, forma de pagamento (Pix/débito, cartão
  de crédito, vale), compra para outra pessoa vai direto para “A receber”, exportação CSV.
- **Cartões**: limite, fechamento e vencimento; fatura montada automaticamente e
  visualizada em PDF dentro do app (baixar, compartilhar).
- **Limites de gastos** por categoria e por mês.
- **Metas** com prazo, lembrete no Google Agenda, observação e abas por situação.
- **Dívidas** (banco, empréstimo, pessoal) e **A receber** com cobrança por mensagem pronta.
- **Aprenda**: organização, rendimento e guia de uso.
- **Conexões**: Google Agenda disponível; WhatsApp e Open Finance com interface pronta.
- Modo claro/escuro e layout pensado para celular.

## Como rodar

Opção 1, no VS Code: instale a extensão recomendada **Live Server** e clique em
"Go Live" na barra inferior.

Opção 2, no terminal:

```bash
npm run dev
```

Depois abra http://localhost:5500.

## Estrutura

```
index.html      marcação das telas (apresentação, login, app) e ícones SVG
css/style.css   estilos e tema claro/escuro
js/parser.js    GranaParser: transforma frases em lançamentos (funciona no navegador e no Node)
js/app.js       Store (persistência), renderização, gráficos SVG, PDF/CSV, chat e integrações
```

## Segurança

O que esta versão faz:

- Senha guardada com PBKDF2-SHA256 (210 mil iterações) e sal aleatório por usuário;
  contas antigas com SHA-256 são migradas automaticamente no login.
- Limite de 5 tentativas de login seguidas (bloqueio de 60 s) e mensagem de erro genérica.
- Sessão expira em 30 dias.
- Content Security Policy, Subresource Integrity no jsPDF e escape de todo texto digitado.
- CSV protegido contra injeção de fórmulas no Excel.

Limitação importante: tudo roda **no navegador** e os dados ficam no `localStorage`.
Quem tem acesso ao computador consegue ler os dados. Para uso real com várias pessoas,
o próximo passo é um backend com autenticação (ex.: Supabase ou Firebase).

## Próximos passos: WhatsApp e Open Finance

A interface já está pronta na aba **Conexões**. Falta o lado do servidor:

- **WhatsApp**: um servidor recebe as mensagens pela WhatsApp Business Cloud API (Meta),
  usa o mesmo `js/parser.js` para entender o texto e grava os lançamentos. No app, eles
  entram pela função `importTransactions(items, 'whatsapp')`. Exige backend, número
  verificado e conta na Meta.
- **Open Finance**: no Brasil, o acesso é feito por instituições autorizadas pelo Banco
  Central. Na prática, usa-se um agregador (ex.: Pluggy, Belvo), que entrega as transações
  para o servidor. Elas entram pela mesma `importTransactions(items, 'openfinance')`.
