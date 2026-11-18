# Grana Leve 🌿

Aplicativo gratuito de controle financeiro pessoal para jovens e famílias. É um projeto de
Atividade Extensionista do curso de Engenharia de Software, que parte de uma pesquisa com 48
pessoas sobre hábitos financeiros. Funciona no celular e no computador, instala como app (PWA)
e está no ar em **https://grana-leve.vercel.app**.

A ideia central: anotar gasto não deveria dar trabalho nem ansiedade. Dá para escrever como se
fala (“gastei 30 no mercado”), ver o mês de relance e saber, sem fazer conta, quanto sobra depois
de pagar as faturas.

## O que o app faz

**Dia a dia**
- **Lançamento por mensagem**: “gastei 30 no mercado e 20 no uber”, “recebi 1.500 de salário
  ontem”. Um leitor baseado em regras (não é IA) monta os itens; nada é salvo sem a pessoa conferir
  e tocar em “Salvar”.
- **Início**: a situação do mês numa frase e três cartões (Quanto tenho, Gastos do mês, Próximos
  pagamentos). Em “Ver todos os detalhes do mês”: gráficos por categoria (rosca, pizza ou blocos,
  com “Tudo” ou “Somente meus gastos”), ganhos × gastos com navegação por mês (inclusive futuro,
  com previsão), faturas e crédito × débito do mês, comparação com o mês anterior e parcelas em
  andamento.
- **Ganhos e gastos**: lista, calendário e visão do ano, busca e filtros, exportação em CSV,
  compras parceladas (até 24x), contas fixas (luz, aluguel, assinaturas) e previsões de entrada.
  Devoluções de uma mesma pessoa ficam numa caixa que abre e fecha.
- **Simular** (guia em Ganhos e gastos): “se eu comprar, financiar ou assumir isso, como ficam as minhas
  contas?”. Compra à vista, no cartão (com fechamento e vencimento), com o dinheiro de uma meta, ganho,
  empréstimo e gasto fixo; mostra o saldo mês a mês (considera o salário de costume) e permite “Registrar
  de verdade”. Usar dinheiro de uma meta para outra coisa mostra um aviso de cuidado.
- **Contas e cartões**: saldo por conta, transferências, cartão com limite, fechamento e
  vencimento, fatura montada sozinha, pagamento parcial ou adiantado, relatório por cartão (em PDF)
  e vale-alimentação. O resumo se lê como uma conta: *nas contas − faturas a pagar = sobra*.
- **Planejar gastos**: quanto gastar por categoria em cada mês (meses passados ficam travados), aviso
  em popup ao chegar numa porcentagem escolhida do limite (padrão 90%) e gráfico da evolução do mês.
- **Conselhos**: ideias gentis feitas pelos seus próprios gastos (o que passou do limite, está acima do
  costume, quanto dá para guardar). Regras simples no aparelho, sem IA e sem enviar dados; não é
  recomendação de investimento.
- **Metas**: com ou sem valor alvo e com ou sem prazo, onde o dinheiro está (poupança, CDB, LCI/LCA,
  Tesouro…), taxa atualizada pelo Banco Central (CDI, Selic e IPCA) e previsões em juros compostos.
  Retirar dinheiro diz se foi para o objetivo ou para outra coisa (com aviso e conselho até repor).
- **Compromissos**: o que você deve e o que te devem, com cobrança por mensagem pronta, Pix e
  cobrança compartilhada entre duas contas.

**Total × realmente meu.** Quando uma compra é paga para outra pessoa, ou dividida, o dinheiro sai
do cartão ou da conta, mas só a sua parte é gasto seu. O app mostra sempre as duas versões (resumo,
cartões do Início, tabela por banco, gráficos, lista e “Contas e cartões”). “Seu” numa fatura é a
sua parte dela, limitada ao que ainda falta pagar.

**Para quem está começando**: tutorial de primeiro uso (pode ser pulado ou revisto), guia “Como
usar”, botão “Ajuda e sugestões” e modo claro/escuro. Os dados podem ser exportados em backup e a
conta pode ser apagada pelo próprio app.

## Como funciona por dentro

- **JavaScript puro (módulos ES), sem framework e sem etapa de build no desenvolvimento.** As regras
  de dinheiro, datas, faturas e saldos ficam em `js/domain/` (sem tela, testáveis no Node); a
  interface em `js/ui/`; a persistência em `js/data/`.
- **Dois modos de armazenamento**: nuvem (Supabase: login, sincronização entre aparelhos) e local
  (`localStorage`, usado em desenvolvimento e nos testes com `granaleve_backend=local`). A camada
  `Store` esconde a diferença.
- **Dinheiro em centavos**, com arredondamento centralizado em `js/domain/money.js`.
- **Service worker** “rede primeiro”: com internet pega sempre a versão nova; sem internet o app
  abre com a última cópia. Escrever sem internet ainda não é possível com conta na nuvem (a tela
  avisa que nada foi salvo).

## Como rodar

Precisa do Node.js 20 ou mais novo.

```bash
npm install
npm run dev        # http://localhost:5500, arquivos como estão (sem build)
npm run build      # gera dist/ (o que vai para o ar)
npm run preview    # serve dist/ em http://localhost:5501
```

O app usa módulos ES; abrir o `index.html` direto do disco não funciona.

## Testes

```bash
npm run lint       # ESLint
npm test           # regras (dinheiro, datas, faturas, saldos, parser, build): node:test
npm run test:e2e   # o app inteiro no Chrome (puppeteer-core), 4 arquivos ao mesmo tempo (~2,5 min);
                   # relógio fixo em 17/11/2026; E2E_JOBS=1 (um por vez) e E2E_REALDATE=1 (data de hoje)
npm run test:db    # migrações e regras de acesso do banco, num Postgres local (podman)
npm run check      # lint + testes de regras
E2E_ROOT=dist node tests/e2e/run.js 01 04   # testes no navegador contra a versão publicada
```

O GitHub Actions roda lint, testes de regras, do banco e do navegador a cada push, mais um teste
de fumaça contra o `dist/` e a auditoria das dependências (`.github/workflows/verificacao.yml`).

## Estrutura

```
index.html            telas (apresentação, login, app) e ícones SVG
css/style.css         estilos e tema claro/escuro
js/app.js             ponto de entrada
js/domain/            regras puras: dinheiro, datas, lançamentos, parcelas, cartões e faturas,
                      contas, planejamento, metas, investimentos, a receber, parser…
js/data/              Store (local/nuvem), Supabase, sessão e preferências, backup e migrações
js/ui/                uma área por arquivo (Início, Ganhos e gastos, Cartões, Planejar, chat,
                      perfil, tutorial, painel adm…); shell.js liga a navegação e os eventos.
                      Início: home-tab.js + dash-data/dash-charts/dash-details; Conselhos: advice-tab.js;
                      Simular: simulator.js
supabase/             migrações, testes das regras de acesso e modelos de e-mail
tools/                build (esbuild) e atualização do service worker
tests/unit/ e2e/      testes das regras e do navegador
docs/                 regras financeiras e passo a passo de publicação
materiais-divulgacao/ imagens e vídeo de divulgação (fora do site publicado)
```

## Publicação e desempenho

O site é publicado no **Vercel** a cada push na `main`. O `vercel.json` manda rodar `npm run build`
e publicar `dist/`. O build (`tools/build.js`) junta os mais de 60 módulos em **um** JavaScript e
**um** CSS minificados, com o hash no nome (cache longo e imutável); o `index.html` nunca fica
em cache. A tela inicial passou de 75 para 10 requisições. O código-fonte não muda: o que roda no
desenvolvimento e nos testes é o mesmo, só empacotado. Detalhes e a configuração do Supabase estão
em [`docs/publicar.md`](docs/publicar.md).

## Segurança e privacidade

O que já está implementado:

- **Banco**: Row Level Security em todas as tabelas (cada pessoa só enxerga o que é dela), funções
  `SECURITY DEFINER` para o que precisa de privilégio, limite de registros por conta e limite diário
  de mensagens de ajuda. As regras têm testes (`supabase/tests/rls.test.sql`).
- **Chaves**: no código vai só a chave pública (`anon`), que sozinha não lê nada. A `service_role` e
  a chave de e-mail (Brevo) ficam fora do repositório (Vault do Supabase).
- **Login**: e-mail com confirmação, Google por OAuth com PKCE, links de e-mail que expiram,
  captcha (Cloudflare Turnstile) no cadastro e na recuperação de senha, regras de senha e recusa de
  senhas vazadas quando o Supabase as detecta, aviso por e-mail quando a senha ou o e-mail mudam.
- **Navegador**: Content Security Policy restrita, `frame-ancestors 'none'`, HSTS, `nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` sem câmera, microfone e localização,
  Subresource Integrity no jsPDF, todo texto digitado escapado e CSV protegido contra injeção de
  fórmulas.
- **Privacidade (LGPD)**: termos e política dentro do app, aceite registrado (versão e data), a
  pesquisa acadêmica é opcional e separada, exportação dos dados e exclusão da conta pelo app.
- **Processo**: dependências com versão exata, `npm audit` sem vulnerabilidades, verificação
  automática a cada push.

O que considero importante cuidar (checklist do responsável pelo projeto):

1. **Backup e disponibilidade do banco**: projetos gratuitos do Supabase podem ser pausados por
   inatividade e não têm backup diário garantido. Confirmar o plano e, se ficar no gratuito, exportar
   o banco de tempos em tempos.
2. **Proteção contra senhas vazadas** e **MFA** para a conta de administrador (confirmar no painel
   do Supabase o que o plano permite). Revisar quem tem o papel de admin (`docs/tornar-admin.sql`).
3. **E-mail**: o remetente é um Gmail; um domínio próprio com SPF, DKIM e DMARC melhora a entrega e
   dificulta que alguém se passe pelo Grana Leve.
4. **Segredos**: nunca colocar chaves no repositório nem em mensagens; se uma chave aparecer em
   algum lugar, trocá-la na hora (já aconteceu uma vez e foi trocada).
5. **Atualizações**: o Dependabot (`.github/dependabot.yml`) abre pull requests semanais; revisar e
   aceitar, rodando os testes.
6. **Contas de teste e divulgação**: usar contas de demonstração nas imagens e nunca dados reais.

Limitações conhecidas: sem conta na nuvem os dados ficam só no navegador (quem usa o aparelho pode
vê-los); escrever sem internet ainda não é suportado com conta; Open Finance e WhatsApp estão só
com a interface pronta.

Para **relatar uma vulnerabilidade**, veja [`SECURITY.md`](SECURITY.md).

## Acessibilidade

- Contraste dentro do WCAG 2.1 AA nos dois temas; alvos de toque de 44 px no celular.
- Abas e menus com `role` correto e teclado (setas, Home, End, Esc); popups deixam o resto da
  página inerte e devolvem o foco; erros de formulário são anunciados.
- Gráficos têm tabela equivalente e dicas por mouse, teclado e toque.
- `tests/e2e/08-acessibilidade.e2e.js` roda o axe-core em todas as telas e popups, nos dois
  temas.

## Próximos passos

- Fila de gravação sem internet (hoje a tela só avisa que nada foi salvo).
- Open Finance (via agregador) e WhatsApp (API da Meta): a interface já está na aba Conexões;
  falta o servidor.
- Domínio próprio e e-mail com domínio próprio.
