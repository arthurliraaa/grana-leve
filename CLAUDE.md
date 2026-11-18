# Grana Leve — guia para agentes

App de controle financeiro pessoal. JavaScript puro (módulos ES), sem framework e sem build no
desenvolvimento. Detalhes do produto no [README.md](README.md); regras de dinheiro em
[docs/regras-financeiras.md](docs/regras-financeiras.md).

## Camadas (cada uma tem um dono — ver `.claude/agents/`)

| Camada | Pasta | Regra |
|---|---|---|
| Domínio | `js/domain/` | Regras puras (dinheiro, datas, faturas, saldos). **Sem DOM, sem Store.** Testável no Node. |
| Dados | `js/data/`, `supabase/` | Persistência. `Store` esconde nuvem (Supabase) × local (`localStorage`). |
| Interface | `js/ui/`, `css/`, `index.html` | Telas. Não calcula dinheiro: chama `domain/`. |
| Qualidade | `tests/`, `supabase/tests/` | Testes unitários, e2e e de banco. |

## Regras que não se negociam
- Dinheiro **sempre em centavos**; arredondamento só em `js/domain/money.js`.
- "Total × realmente meu": toda tela que mostra valor deve respeitar as duas versões.
- Nada é salvo sem a pessoa conferir (lançamento por mensagem).
- Migração SQL: o agente **escreve** em `supabase/migrations/` (nome `AAAAMMDDHHMMSS_nome.sql`),
  mas **quem roda é o usuário**. Nunca aplicar em produção.
- Mudou arquivo servido ao navegador → `npm run sw:update` (cache do service worker).

## Comandos
- `npm run dev` (porta 5500) · `npm run check` (lint + unit) · `npm run test:e2e` · `npm run test:db`
- Antes de dar uma tarefa por pronta: `npm run check` verde e, se mexeu na interface, `npm run test:e2e`.
- `npm run test:e2e` roda **vários arquivos ao mesmo tempo** (4 por padrão; `E2E_JOBS=1` para um por vez) e leva
  uns 2,5 minutos. O relógio dos testes é **fixo em 17/11/2026 às 12h** (e anda a partir daí), então o resultado
  não depende do dia. `E2E_REALDATE=1` usa a data de hoje. Para só alguns arquivos: `npm run test:e2e -- 25 52`.
- Arquivo novo em `js/` precisa entrar na lista do service worker: `npm run sw:update` (o teste `sw.test.js` cobra).

## Onde fica cada coisa (Início e telas grandes)
- Início: `home-tab.js` (resumo, cartões, eventos) + `dash-data.js` (números, sem HTML) + `dash-charts.js`
  (rosca, pizza, blocos, barras, faturas, crédito × débito) + `dash-details.js` (popups de detalhe).
  `home-tab.js` reexporta os três, então `import ... from './home-tab.js'` continua valendo.
- Conselhos: regras em `js/domain/advice.js`, tela em `js/ui/advice-tab.js` (card no Início e aba própria).
- Simular (guia em Ganhos e gastos): conta em `js/domain/simulate.js`, tela em `js/ui/simulator.js`.
- Alertas do planejamento: `js/domain/budgets.js` (`budgetAlerts`, `monthBurn`, `alertPercent`) e o popup em
  `js/ui/tx-edit.js` (`showBudgetPopup`).
- Os contratos das funções novas do domínio estão em `docs/CONTRATOS.md`; as regras de dinheiro, em
  `docs/regras-financeiras.md`.

## Como trabalhamos com vários agentes
1. As tarefas ficam nos planos de `docs/auditorias/` (`auditoria-1.md`, `auditoria-2.md`): cada uma tem
   **dono**, **arquivos permitidos** e **critério de aceite**. Agente só toca nos arquivos da sua tarefa.
2. Contratos entre camadas ficam escritos antes da implementação (funções do `domain`, colunas
   do banco), em `docs/CONTRATOS.md`.
3. Edição em paralelo só entre tarefas sem arquivo em comum, cada agente em seu worktree.
   `js/ui/home-tab.js`, `commitments-tab.js`, `shell.js` e `css/style.css` são grandes e disputados:
   **um agente por vez** neles.
4. Fluxo: planner → (aprovação do usuário) → donos das camadas → reviewer → qa.
5. Estado entre sessões: lista `work_state` do claude-mem + status nos planos de `docs/auditorias/`.
