# Publicar o Grana Leve

A publicação acontece em duas fases.

- **Fase 1 (agora):** o site vai para o Vercel como está. Os dados continuam só no navegador
  de cada pessoa.
- **Fase 2:** entra o Supabase, com login de verdade, sincronização, coleta do estudo e
  painel de administração.

## Fase 1: Vercel

### Antes de publicar

```bash
npm run check        # lint + testes de regras
npm run test:e2e     # o app inteiro no Chrome
```

O GitHub Actions roda os dois a cada push. Só publique com tudo verde.

### Primeira publicação (uma vez)

1. Crie uma conta em https://vercel.com com o login do GitHub.
2. Clique em **Add New → Project** e importe o repositório `arthurliraaa/grana-leve`.
3. Em **Framework Preset**, escolha **Other**. Deixe Build Command e Output Directory como
   estão: o `vercel.json` já diz que o site é estático e que os arquivos ficam na raiz.
4. Clique em **Deploy**. O endereço fica parecido com `grana-leve.vercel.app`.

Depois disso, cada push na `main` publica sozinho, e cada pull request ganha um link de
prévia para testar antes.

### O que o `vercel.json` faz

- Envia os cabeçalhos de segurança: a mesma Content Security Policy do `index.html`, mais
  `frame-ancestors 'none'` (impede que o site seja aberto dentro de outro site), HSTS,
  `nosniff`, `Referrer-Policy` e `Permissions-Policy` sem câmera, microfone nem localização.
- Desliga o cache do `sw.js` e do `index.html`, para que todos recebam a versão nova logo.
- O `.vercelignore` deixa de fora os testes, as ferramentas e as configurações de
  desenvolvimento.

Um teste (`tests/unit/deploy.test.js`) confere se a política de segurança do `vercel.json`
continua igual à do `index.html`.

### Ao mudar arquivos em `js/`

```bash
npm run sw:update
```

O comando atualiza a lista do service worker e a versão do cache, para quem instalou o app
receber a versão nova.

### Domínio

`granaleve.com.br` já está registrado por outra pessoa. Para começar, use o endereço
`.vercel.app`. Para usar um domínio próprio, compre-o (no Registro.br, para `.com.br`) e
adicione em **Project → Settings → Domains** no Vercel.

## Fase 2: Supabase (precisa da conta do responsável)

### O que é preciso

1. Criar um projeto em https://supabase.com na região **South America (São Paulo)**.
2. Passar a **URL do projeto** e a **chave anon (pública)**. A chave `service_role` nunca vai
   para o código do site.
3. Definir qual e-mail será o administrador.

### Banco de dados (já pronto no repositório)

O esquema está em `supabase/migrations/`: tabelas, regras de segurança (RLS) e as funções
do estudo e do painel de administração.

1. No painel do Supabase, abra **SQL Editor** e rode, **nesta ordem**, cada arquivo de
   `supabase/migrations/` (cole o conteúdo e clique em **Run**):
   `20261009000000_inicial.sql` e depois `20261009010000_excluir_propria_conta.sql`.
2. Crie sua conta no app. Depois, no SQL Editor, rode `supabase/tornar-admin.sql` trocando o
   e-mail pelo seu. Só quem tem `role = 'admin'` acessa o painel, e isso é verificado no
   banco, não na tela.

Para testar as regras sem mexer no projeto real (precisa de Podman ou Docker):

```bash
npm run test:db
```

O comando sobe um PostgreSQL temporário, aplica a migração sobre um esboço do que o Supabase
cria (`supabase/tests/stub-supabase.sql`) e roda `supabase/tests/rls.test.sql`. São 53
verificações: isolamento entre pessoas, admin sem acesso a dados financeiros, conta
bloqueada, estudo anônimo, sair do estudo e excluir conta.

### Endereços permitidos para os links de e-mail

Em **Authentication → URL Configuration**:

- **Site URL:** o endereço do Vercel (ex.: `https://grana-leve.vercel.app`).
- **Redirect URLs:** adicione `http://localhost:5500/**` (para testar no computador) e o
  endereço do Vercel com `/**` no fim.

Os links de confirmação de cadastro e de nova senha só voltam para esses endereços.

### Configuração do app

`js/config.js` tem a URL do projeto e a chave **anon** (pública: sozinha ela não lê nada,
quem protege os dados é o RLS). O app usa o Supabase sempre que essa configuração existe.
Para desenvolver ou rodar os testes no navegador sem servidor:

```js
localStorage.setItem('granaleve_backend', 'local')   // no console do navegador
```

### O que muda no app

- **Login:** passa a ser feito pelo Supabase Auth, com recuperação de senha por e-mail. O
  hash de senha feito no navegador deixa de ser usado.
- **Dados:** cada coleção vira uma tabela com `user_id`, protegida por Row Level Security
  (cada pessoa só lê e grava as próprias linhas). Entra um novo adaptador em
  `js/data/store.js`, ao lado dos adaptadores local e cloud.
- **Dados antigos:** quem já usa o app leva os dados pelo backup ou por uma importação
  automática no primeiro login.
- **Estudo:** os eventos de uso e de correção do chat vão para uma tabela separada, ligada a
  um código aleatório e não à conta, só de quem aceitou o termo. Sair do estudo apaga os
  eventos daquele código.
- **Painel de administração** (área própria, só para o papel admin, verificado no servidor):
  - métricas de uso anônimas;
  - gerenciar contas: lista com e-mail e data, bloquear ou excluir a pedido da pessoa;
  - editar os conteúdos da aba Aprenda;
  - exportar os dados do estudo em CSV anonimizado.
- **CSP:** passa a permitir o domínio do projeto Supabase em `connect-src`.

### Atenção

- **Comitê de ética:** pesquisa com dados de pessoas em contexto universitário pode precisar
  de aprovação do Comitê de Ética em Pesquisa (Plataforma Brasil). Confirme com o
  orientador antes de coletar dados reais.
- **Pausa por inatividade:** no plano gratuito do Supabase, o projeto pausa depois de um
  período sem uso. Para um piloto com pessoas reais, acompanhe isso ou use um plano pago.
- **Backup do banco:** confira o que o plano escolhido inclui e, se for preciso, agende uma
  exportação.
- **Documentos:** atualize a Política de privacidade e os Termos de uso com o nome do
  responsável, o contato e o fato de os dados passarem a ficar num servidor.
