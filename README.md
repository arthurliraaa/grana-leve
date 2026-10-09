# Grana Leve 💸

Ferramenta de controle financeiro pessoal para jovens e famílias. Nasceu do projeto
de Atividade Extensionista (Engenharia de Software), a partir de uma pesquisa com 48
pessoas sobre hábitos financeiros.

## Funcionalidades

- **Botão +**: abre o formulário de gasto/ganho em um popup, de qualquer aba.
- **Lançamento por mensagem (chat)**: ao entrar (uma vez por dia) o app pergunta se houve
  gasto ou ganho. Entende frases como “gastei 30 no mercado e 20 no uber” ou “recebi
  1.500 de salário ontem” com um leitor baseado em regras (não é IA). **Nada é salvo
  direto**: cada item aparece para conferir e editar (valor, data, categoria, pagamento,
  parcelas), com destaque no que foi suposto, e só grava ao tocar em “Salvar”.
  Também abre pelo link “Lance pelo chat” no botão +.
- **Painel**: saldo, ganhos (com previsão de entradas), gastos, metas, dívidas e valores
  a receber; gráficos com opção de tabela e período de 3, 6 ou 12 meses; relatório em PDF.
- **Ganhos e gastos**: categorias personalizadas (dá para renomear), forma de pagamento
  (conta, dinheiro, cartão de crédito, vale), compra para outra pessoa vai direto para
  “A receber”, exportação CSV. Cada lançamento pode ser editado pelo lápis.
- **Contas bancárias**: saldo de cada conta a partir do valor informado, atualizado pelos
  ganhos e gastos ligados a ela; transferências entre contas (não contam como ganho nem
  gasto) e pagamento de fatura escolhendo a conta, inclusive de outro banco.
- **Cartões**: limite, fechamento e vencimento; fatura montada automaticamente e
  visualizada em PDF dentro do app (baixar, compartilhar).
- **Planejar gastos** por categoria, com o planejamento guardado mês a mês: mudar o mês
  atual não altera os anteriores, que ficam travados. Dá para planejar o próximo mês e
  criar categorias ali mesmo.
- **Metas** com prazo, lembrete no Google Agenda, observação e abas por situação.
- **Dívidas** (banco, empréstimo, pessoal) e **A receber** com cobrança por mensagem pronta.
  “A receber” aceita parcelas (informando o total ou o valor de cada parcela) e, para
  compra feita no seu cartão, pode lançar a compra parcelada na fatura.
- **Aprenda**: organização, rendimento e guia de uso.
- **Compras parceladas** no cartão (até 24x, com seletor − / + que mostra o valor de cada
  parcela), que aparecem nos cartões e em Dívidas com opção de adiantar pagamento.
- **Vale-alimentação/refeição** com saldo, e **relatório por cartão** com filtros.
- **Conexões**: app instalável e Google Agenda disponíveis; WhatsApp e Open Finance com
  interface pronta.
- **Backup e restauração** dos dados em arquivo JSON (rodapé → “Backup dos dados”).
- Aviso na hora quando um gasto chega a 80% ou passa do planejado na categoria.
- Busca (sem diferenciar acentos) e filtros por tipo e forma de pagamento.
- **App instalável (PWA)** que funciona sem internet.
- Modo claro/escuro e layout pensado para celular.

## Como rodar

Precisa do Node.js 20 ou mais novo. Na primeira vez, instale as dependências de desenvolvimento:

```bash
npm install
npm run dev
```

Depois abra http://localhost:5500. A extensão **Live Server** do VS Code também funciona.
O app usa módulos ES, então precisa ser aberto por um servidor (abrir o `index.html`
direto do disco não funciona).

## Testes e verificação

```bash
npm run lint       # ESLint: variáveis não declaradas, imports sem uso
npm test           # regras de dinheiro, datas, faturas, saldos e o parser (node:test, ~1 s)
npm run test:e2e   # o app inteiro no Chrome (puppeteer-core); defina CHROME_PATH se precisar
npm run check      # lint + testes de regras
```

O GitHub Actions roda os três a cada push (`.github/workflows/verificacao.yml`).

## Estrutura

```
index.html            marcação das telas (apresentação, login, app) e ícones SVG
css/style.css         estilos e tema claro/escuro
js/app.js             ponto de entrada (módulo ES)
js/domain/            regras puras, sem tela: dinheiro (centavos), datas, lançamentos e
                      parcelas, cartões e faturas, contas, planejamento, vale, previsões,
                      a receber e o parser de mensagens (também roda no Node)
js/data/              persistência (Store local/nuvem), sessão e preferências, senha/login
js/ui/                tela: app.js (estado, abas e eventos), modal, gráficos, PDF, utilidades
tests/unit/           testes das regras (node:test)
tests/e2e/            testes no navegador, com servidor próprio
docs/                 regras financeiras e decisões
sw.js                 service worker (rede primeiro, cópia local sem internet)
manifest.webmanifest, icons/   dados para instalar como app
```

## Segurança

O que esta versão faz:

- Senha guardada com PBKDF2-SHA256 (210 mil iterações) e sal aleatório por usuário;
  contas antigas com SHA-256 são migradas automaticamente no login.
- Limite de 5 tentativas de login seguidas (bloqueio de 60 s) e mensagem de erro genérica.
- Sessão expira em 30 dias.
- Content Security Policy, Subresource Integrity no jsPDF e escape de todo texto digitado.
- CSV protegido contra injeção de fórmulas no Excel.

Onde ficam os dados (e como o app deixa isso claro):

- O cadastro avisa que a conta existe só neste navegador, sem sincronização e sem
  recuperação de senha, e pede confirmação ("Entendi onde meus dados ficam").
- O indicador "Só neste navegador", no topo, abre "Seus dados e backup": onde os dados
  ficam, se o navegador aceitou não apagá-los sozinho (`navigator.storage.persist`) e a
  data do último backup.
- O painel lembra de fazer backup quando há dados e nenhum backup nos últimos 30 dias.
- O backup leva todas as coleções, as preferências e a versão do formato (`schemaVersion`).
  Ao restaurar, cada registro é validado (`js/domain/validate.js`) e dados antigos são
  atualizados (`js/data/migrations.js`).
- Se o app rodar com banco na nuvem e ele falhar, a tela pergunta antes de usar o
  navegador; o erro nunca vira um perfil vazio em silêncio.

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
