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
- Antes de dar uma tarefa por pronta: `npm run check` verde.

## Como trabalhamos com vários agentes
1. `docs/PLAN.md` é a fonte da verdade das tarefas: cada uma tem **dono**, **arquivos permitidos**
   e **critério de aceite**. Agente só toca nos arquivos da sua tarefa.
2. Contratos entre camadas ficam escritos antes da implementação (funções do `domain`, colunas
   do banco), em `docs/CONTRATOS.md`.
3. Edição em paralelo só entre tarefas sem arquivo em comum, cada agente em seu worktree.
   `js/ui/home-tab.js`, `commitments-tab.js` e `css/style.css` são grandes e disputados:
   **um agente por vez** neles.
4. Fluxo: planner → (aprovação do usuário) → donos das camadas → reviewer → qa.
5. Estado entre sessões: lista `work_state` do claude-mem + status em `docs/PLAN.md`.
