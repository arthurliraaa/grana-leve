# Auditoria 1 — Rodada 3 (2026-11-07)

Fonte da verdade das tarefas. Status: `todo` · `doing` · `parcial` · `done` · `dropped`.
Regra: um dono por arquivo por onda. Detalhar escopo/critério antes de começar cada etapa (peça ao `planner`).

## Pedido da rodada
Ganhos / saldo / falta pagar; "Agora" enxuto; gráficos com data; Planejar gastos visual; ajuda e contato; termos + idade + Google; mobile.

## Auditoria (2026-11-07, contra `HEAD` = `7a804d4`)
Quase toda a rodada 3 já foi implementada e commitada entre `b028d74` e `7a804d4`. O plano anterior
tinha sido escrito a partir de um resumo antigo. Só sobra a **E3a**: as contas do mês ficaram na tela
(`js/ui/home-tab.js`), não em `js/domain/`, e não têm teste unitário.

| Id | Tarefa | Status | Evidência (commit · arquivo:linha) |
|---|---|---|---|
| E1 | Contato por e-mail + botão "Ajuda" | done | `b028d74`, `6d7f432` · `js/config.js:10` (`CONTACT_EMAIL`) · `index.html:248` (botão `data-help` no menu lateral) · `js/ui/shell.js:255,264` (item no "Mais" do celular) · `js/ui/shell.js:708` (clique global em `[data-help]`) · `js/ui/feedback.js:20-22,40,60` (mailto, com envio pelo app e mailto como alternativa) · `index.html:784` (Contato no rodapé) · `js/ui/profile.js:166` (Ajuda em Seus dados) · e2e `tests/e2e/36-perfil-ajuda-apagar.e2e.js` |
| E2a | Aceite de termos obrigatório (e-mail e Google), erro visível | done (idade: dropped) | `b028d74` criou o aceite com 18+; `5b7f58d` **tirou a exigência de idade** e manteve só os termos · `js/domain/terms.js` (`TERMS_VERSION`, `termsProblem`, `termsRecord`, `termsOk`) · `js/ui/online.js:353` (cadastro por e-mail barra sem aceite e mostra o erro) · `js/ui/online.js:144-153` (Google ou conta antiga: janela obrigatória e saída se recusar) · `js/data/supabase.js:110` (`saveTerms` grava em `user_metadata.terms`) · `js/ui/online.js:34-40` (erro do Google na volta) · unit `tests/unit/termos.test.js`, e2e `38-login-senha`, `10-previsoes-termo` |
| E2b | Tela do portal de aceite | done | `b028d74` · `js/ui/online.js:121-135` (`termsGate`, "Antes de continuar") · `index.html:718` (aviso no botão do Google) · `index.html:759` (caixa `signupTerms`) · `js/ui/research-term.js:38` (contato no termo da pesquisa) |
| E2c | E-mail de boas-vindas (SQL para o usuário rodar) | done (falta confirmar se foi rodado) | `b028d74` · `supabase/migrations/20261014000000_boas_vindas_google.sql` (instrução no cabeçalho, linhas 1-4; boas-vindas só para quem entra pelo Google, linha 49; depende de `pg_net` + `brevo_api_key` de `20261013000000_aviso_novo_cadastro.sql`) |
| E3a | Funções: ganhos (+disponível), gastos, falta pagar, saldo do mês | **parcial** | `31d4523` · a regra existe e funciona (e2e `48-resumo-mes`), mas está em `js/ui/home-tab.js:76` (`dashboardFigures`), `:95` (`spendFigures`), `:168` (`monthPayments`) e `:676` (`monthProjection`), que leem `State` e `pendingBills()` (`js/ui/bills.js:65`). Não há função em `js/domain/` nem teste unitário (nenhum em `tests/unit/` cobre isso). Viola "UI não calcula dinheiro" do `CLAUDE.md`. |
| E3b | Seção "Neste mês" e "Agora" | done | `31d4523`, `6d7f432`, `2b527f8` · `js/ui/home-tab.js:105-137` (`renderStatTiles`: Ganhos, Gastos, Falta pagar, Saldo; Agora = metas, dívidas, a receber no mês) · e2e `48-resumo-mes`, `52-total-e-meu` |
| E4 | Gráficos com navegação de mês e futuro como previsão | done | `046db88`, `1a835b8`, `8d372da`, `7de4660`, `7a804d4` · `js/ui/home-tab.js:664-745` (mês escolhido, previsão, nota de contas fixas previstas) · `js/ui/home-tab.js:864` ("(previsão)") · `js/ui/state.js` (`dashOffset`) · e2e `49-graficos-mes`, `54-menos-informacao` |
| E5 | Planejar gastos visual, limite × gasto, aviso 80% | done | `9d98a75`, `8baf64d` · `js/domain/budgets.js:20-22` (`statusForPct`: ≥ 0,8 → `warning`) · `js/ui/planning-tab.js:26,89` (rótulo "quase no limite" e barra por situação) · e2e `02-planejamento` |
| E6 | Mobile: folha, alvos 44 px, campos 16 px | done | `39ebdc7`, `e429036`, `7a804d4` · `css/style.css:1486-1504` (44 px e 16 px) · `css/style.css:1519-1521` (janela em folha, `sheetIn`) · e2e `50-celular` confere tamanhos e folha. Feito só em CSS; `js/ui/modal.js` não precisou mudar. |

## Arquivos permitidos corrigidos (para referência das tarefas já feitas)
- E1: `index.html`, `js/ui/shell.js`, `js/ui/feedback.js`, `js/ui/profile.js`, `js/config.js`.
- E2a: `js/domain/terms.js`, `js/data/supabase.js` (não `js/data/auth.js`, que não guarda o aceite), `js/ui/online.js`.
- E2b: `js/ui/online.js`, `index.html` (não `js/ui/landing.js`); `js/ui/research-term.js` só para o contato.
- E2c: `supabase/migrations/20261014000000_boas_vindas_google.sql` (não usou `supabase/templates/`).
- E6: `css/style.css` e `tests/e2e/50-celular.e2e.js` (não `js/ui/modal.js`).

## Pendente — Onda única: tirar as contas do mês da tela (E3a)
Contrato em [CONTRATOS.md](../CONTRATOS.md#resumo-do-mês-e3a). E3a-1 e E3a-2 rodam em sequência
(E3a-2 depende da assinatura pronta). Não há outra tarefa pendente para rodar em paralelo.

| Id | Tarefa | Dono | Arquivos permitidos | Depende de | Aceite | Status |
|---|---|---|---|---|---|---|
| E3a-1 | Criar `js/domain/month-summary.js` com as funções puras do contrato (falta pagar por banco, partes "seu/outras pessoas", saldo do mês, projeção de mês futuro), copiando a regra atual de `home-tab.js` sem mudar resultado | domain-dev | `js/domain/month-summary.js` (novo), `tests/unit/month-summary.test.js` (novo), `docs/regras-financeiras.md` (só se precisar citar o arquivo) | — | Módulo sem `State`, DOM ou `js/ui/*`; testes cobrindo: mês corrente, mês passado (sem previsão), mês futuro (contas fixas e previsões de entrada somadas), fatura parcialmente paga e adiantada, fatura atrasada de mês anterior entrando em "falta pagar", fatura já paga não descontada de novo, com e sem contas cadastradas, gasto de outra pessoa (total × meu). `npm run check` verde. | todo |
| E3a-2 | `home-tab.js` passa a chamar o domínio: `spendFigures`, `monthPayments` e `monthProjection` viram montagem de entrada + chamada | ui-dev | `js/ui/home-tab.js` | E3a-1 | Nenhuma soma de dinheiro nova na UI; os três nomes continuam exportados com o mesmo retorno (outros módulos e testes usam); `npm run check` e `npm run test:e2e` verdes, em especial `48-resumo-mes`, `49-graficos-mes`, `52-total-e-meu`, `07-painel`; `npm run sw:update`. | todo |
| QA-R3 | Fechamento da rodada | qa | `tests/` | E3a-2 | `check` + `e2e` verdes; conferência manual a 390 px de Início, Planejar e janela de termos (Google). | todo |

## Fechamento de cada onda
`reviewer` (diff) → `qa` (check + e2e + conferência a 390px) → `npm run sw:update` → commit.

## Dúvidas para o usuário
1. **Idade**: o pedido original falava em "termos + idade", e o commit `5b7f58d` tirou a exigência de 18+. A idade fica fora de vez? (Se voltar, precisa de tarefa nova em `terms.js`, `online.js` e `index.html`, e de decidir o que fazer com contas que aceitaram sem confirmar a idade.)
2. **Migração `20261014000000_boas_vindas_google.sql`**: você já rodou no SQL Editor do Supabase, com `pg_net` e a chave `brevo_api_key` no Vault? Se não, o e-mail de boas-vindas do Google não sai, mas nada quebra.
3. **Boas-vindas para quem cria conta com e-mail e senha**: hoje só recebe o e-mail de confirmação do Supabase. Basta isso, ou quer um e-mail de boas-vindas depois da confirmação também?
4. **Google na volta ao app**: o plano antigo dizia que a falha não tinha sido reproduzida. Desde `b028d74` a volta sem sessão mostra aviso na janela de entrar. O problema ainda acontece com você? Se sim, mande o texto do aviso.
5. **E3a vale a pena agora?** É uma troca de lugar do código, sem mudança visível, para cumprir a regra das camadas e ganhar testes unitários. Fazer agora ou deixar para a próxima rodada?
