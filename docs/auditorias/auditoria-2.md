# Auditoria 2 — Regras de dinheiro (2026-11-07)

Contra `HEAD` = `7a804d4` (árvore com mudanças locais só em `materiais-divulgacao/` e arquivos novos de
`docs/`/`.claude/`, nenhuma em `js/`). `npm test`: **119 testes, 119 passam, 0 falham**.
Status das tarefas: `todo` · `doing` · `parcial` · `done` · `dropped`. A **E3a** (contas do mês em
`js/ui/home-tab.js`) já está na [auditoria 1](auditoria-1.md) e não foi auditada de novo aqui; só cito onde ela encosta num achado.

## Resumo
- O núcleo (`money.js`, `cards.js`, `accounts.js`, `bills.js`, `transactions.js`) segue a especificação e tem testes.
  Os erros aparecem **nos casos de borda** e **nos cálculos que ficaram na tela**.
- Achados mais graves (valor errado para o usuário): parcelas no cartão mudam de fatura no fim do mês (A2-01), adiantar
  parcelas de compra dividida vira gasto todo seu (A2-02) e excluir uma compra estornada deixa um crédito órfão (A2-03).
- Os centavos não fecham em vários lugares: "A receber" parcelado, rateio por parcela da compra dividida, `Math.floor(x*100)` na tela
  e `money(1.005) = 1`. A diferença é sempre de 1 a 2 centavos.
- Há muito cálculo de dinheiro em `js/ui/*`, inclusive todo o módulo de dívidas, que não tem arquivo em `js/domain/`.
- Total: **22 achados**: 3 de severidade alta, 7 média e 12 baixa. Destes, 11 confirmados com reprodução, 2 divergências
  entre o texto e o código, 3 prováveis e 6 riscos.

Reprodução: `/tmp/claude-1000/-home-lira-Projetos-Settings/5022beab-2243-42df-b510-58abf84bf894/scratchpad/a2-repro.mjs`
(importa `js/domain/*` por caminho absoluto; rode com `TZ=America/Sao_Paulo node a2-repro.mjs`). As seções A…O citadas abaixo
são as seções da saída desse script.

## Achados

| Id | Sev. | Tipo | Local | Descrição | Reprodução / evidência | Correção sugerida |
|---|---|---|---|---|---|---|
| A2-01 | alta | confirmado | `js/domain/transactions.js:105` (data da parcela) × `js/domain/cards.js:15-21,53` (fatura pela data) × `js/domain/cards.js:43-50` (`firstDueInstallment`) | Parcela i fica na data da compra + (i−1) meses, com a data limitada ao último dia do mês, e a fatura é tirada **dessa data**. Quando o dia da compra ≥ dias do mês e o fechamento passa disso, a parcela pula uma fatura e a seguinte recebe duas. A regra (`regras-financeiras.md:169-170`) diz "a parcela i entra na i-ésima fatura", e é isso que `firstDueInstallment` supõe. Por isso as parcelas marcadas como pagas antes do cadastro também saem erradas. | Seção A: cartão fecha 31, vence 7, compra 30/03/2026 em 3x de 100 → faturas `03`, `05`, `05`. Fatura de abril = 0 e fatura de maio = 200. Fecha 30, compra 28/01/2027 → faturas `01`, `03`, `03` (fevereiro fica sem parcela). | Em `txInvoiceKey`, para parcela com `purchaseDate`, usar `shiftMonthKey(invoiceKeyFor(purchaseDate), n−1)`. Isso corrige dados antigos sem migração, e `monthOf`, o calendário e o limite passam a usar o mesmo valor. |
| A2-02 | alta | confirmado | `js/ui/tx-edit.js:528` (`advanceInstallments`) | O gasto do adiantamento é gravado **sem `split` e sem `forOther`**. Ao adiantar parcelas de uma compra dividida ou paga por outra pessoa, o valor inteiro passa a ser gasto seu (painel, planejamento e gráficos). | Seção J: 300 em 3x dividida 50/50, adiantando as 2 últimas → `myShare` soma **250** (o certo é 150) e "de outras pessoas" soma 50 (o certo é 150). | Copiar `split`/`forOther` da compra para o lançamento do adiantamento. Com desconto, a parte de cada pessoa fica proporcional. |
| A2-03 | alta | confirmado | `js/ui/shell.js:556-571` (excluir lançamento) | Excluir uma compra (ou o grupo de parcelas) não apaga os estornos ligados (`reversal.of`). O crédito negativo fica órfão: "Gastos do mês" diminui, o saldo da conta sobe e a fatura é abatida, sem compra correspondente. O "A receber" ligado (`forOther`/`split`) também fica. | Seção G: só o estorno de −200 no mês → `expense = −200`, `saldo = +200`. | Ao excluir, incluir `reversalsOf` de cada id. Para o "A receber" ligado, perguntar ou bloquear (ver Dúvida 6). |
| A2-04 | média | confirmado | `js/domain/cards.js:95,117-121,131` | Estorno lançado numa fatura com menos compras que o crédito (a regra permite "até a próxima à aberta") deixa a fatura negativa. `invoiceLeft` corta em 0, então o crédito some: não abate a fatura anterior, não passa para a seguinte e **não libera limite**, ao contrário do que diz `regras-financeiras.md:214`. | Seção H: compra de 100 na fatura de outubro (fechada) e estorno de −100 escolhido na de novembro → `cardUsed = 100`, `toPayLeft = 100`. O certo é 0. | Levar o saldo negativo da fatura adiante, como carry-in negativo, ou abater no limite total. Ver Dúvida 8. |
| A2-05 | média | confirmado | `js/domain/vouchers.js:28` + `js/ui/accounts-tab.js:418-422` (`editVoucher`) | Vale com acúmulo: o crédito é `amount × meses desde o início`. Editar o "valor que cai por mês" sem mexer no saldo **reescreve todos os créditos passados**, porque a UI só refaz a base quando o saldo digitado muda. | Seção I: vale de 500/mês desde jan., saldo 5.500 em 07/11. Ao editar para 600, o saldo vira 6.500. | Guardar o histórico de valores (`amounts: [{from, amount}]`, como em `bills.js:17`) ou refazer a base (`startDate`/`initialBalance`) sempre que `amount` mudar. |
| A2-06 | média | provável | `js/domain/bills.js:41` (`paidOk`) + `js/ui/bills.js:44` (`runAutoBills`) + `js/ui/shell.js:556` | Se a pessoa excluir em "Ganhos e gastos" o gasto que uma conta fixa lançou sozinha, `paidOk` passa a dar falso, o mês não fica como `skipped` e, na próxima abertura, `runAutoBills` lança de novo. Só "Desfazer" (`ui/bills.js:208`) impede isso. | Leitura do código: `billOccurrences` devolve `paid: null`, `runAutoBills` só pula quando `o.paid \|\| o.skipped \|\| data futura \|\| antes do cadastro`. | Ao excluir um lançamento com `billId`/`billKey`, marcar `paid[key] = {skipped: true}` (como em "Desfazer") ou perguntar. Ver Dúvida 7. |
| A2-07 | média | confirmado | `js/ui/commitments-tab.js:788` · `js/ui/tx-list.js:443` | A parcela do "A receber" e o "Dividir igualmente" usam `Math.floor(total*100/n)/100`. Com o erro de ponto flutuante, a parcela sai 1 centavo menor mesmo quando a divisão é exata. | Seção E: 2,26 em 2x → parcela 1,12 (o certo é 1,13); "cobrar do mês" com tudo vencido = 2,24 para 2,26 em aberto. Entre R$ 2 e R$ 5.000, com n de 2 a 12, **71.436 de 5,5 milhões** de combinações (1,3%) dão a parcela errada. "Dividir igualmente" 2,26 entre você e mais 1 → 1,12 para a outra pessoa. | Função de domínio sobre centavos inteiros (`Math.floor(toCents(total)/n)`), usada nas duas telas. |
| A2-08 | baixa | confirmado | `js/domain/receivables.js:16,33` | Parcela padrão = `money(total/n)`, e o resto fica na **última** parcela, não na 1ª como manda `regras-financeiras.md:13`. `recvDueByMonth` multiplica `count × per` e cobra 1 centavo a menos. Depois de receber n × per, sobra 0,01 em aberto que "do mês" nunca cobra. | Seção D: 100 em 3x, tudo vencido → `recvDueByMonth = 99,99` com 100 em aberto. Recebendo 3 × 33,33, sobra `remaining 0,01`, `paid 3` e `dueByMonth 0`. | Usar `splitAmount(total, n)` e somar as parcelas reais que vencem (a última leva `left`). Ver Dúvida 4. |
| A2-09 | baixa | confirmado | `js/domain/transactions.js:30,37` (`myShare`/`othersShare`) | Na compra dividida, a parte "sua" é calculada em cada parcela com `money(amount × mine/total)`. A soma das parcelas não fecha com a parte combinada nem com o "A receber" da pessoa. | Seção C: 100 em 3x, metade de Ana → suas parcelas somam **50,01**, as de outras pessoas **49,99**, e o "A receber" de Ana é **50,00**. | Distribuir `mine` entre as parcelas com a regra de `splitAmount` (resto na 1ª) e gravar a parte de cada parcela, ou ajustar a última. |
| A2-10 | baixa | confirmado | `js/domain/money.js:8` (`toCents`) | `Math.round(v*100)` arredonda meio centavo para baixo quando `v*100` cai em …,4999 no binário. Isso afeta `money()`, `sumMoney()` e todos os rateios. | Seção B: `money(1.005) = 1` (o certo é 1,01). `money(16.665)` e `money(1.115)` dão certo. | `Math.round(Number((Math.abs(v)*100).toPrecision(15)))` com o sinal, ou somar um epsilon relativo. Testar com 1,005, 2,675 e −1,005. |
| A2-11 | média | confirmado | `js/domain/parser.js:63-70` (`parseDate`) | "dia 31" ou "dia 30" quando o mês anterior não tem esse dia: `new Date(a, m−1, 31)` transborda para o mês atual. A data fica marcada como "reconhecida" (`recognized.date = true`), então a revisão não chama atenção para ela. | Seção K: hoje 05/03/2026, "gastei 50 dia 31" → **2026-03-03**; "dia 30" → 2026-03-02. Hoje 10/05/2026, "dia 31" → **2026-05-01** (o certo é 31/03). | Ao recuar, procurar o último mês que tem o dia, ou limitar ao último dia, e marcar como suposto. Teste em `parser.test.js`. |
| A2-12 | média | provável | `js/ui/home-tab.js:678` (`monthProjection`, E3a) + `js/ui/bills.js:65-67` (`pendingBills`) | Conta fixa paga no cartão entra na projeção do mês do **dia da compra**. Depois de lançada, conta no mês do **vencimento da fatura** (`state.js:100-104`). A projeção de mês futuro e o lançamento real caem em meses diferentes, o que diverge de `regras-financeiras.md:258`. | Leitura do código: `billMonth(key)` filtra pela data da ocorrência, sem passar pelo resolvedor de competência. | Incluir no contrato de E3a-1: ocorrência de conta fixa no cartão conta no mês de `invoiceFor(date, card).due`. |
| A2-13 | baixa | confirmado | `js/domain/vouchers.js:24,29` | O saldo do vale desconta gastos com **data futura** (agendados), tanto com acúmulo quanto sem. A regra fala em "gastos desde então"/"no mês" e não diz se conta o agendado. | Seção I: gasto de vale em 20/12 já tira 80 do saldo de 07/11. Sem acúmulo, gasto de 28/11 já desconta em 07/11. | Ver Dúvida 3. Se for "só até hoje", filtrar `t.date <= today`. |
| A2-14 | baixa | risco | `js/domain/cards.js:24-27` (`invoiceDates`) | Fecha 30 e vence 31: em fevereiro, fecha e vence **no mesmo dia** (28/02). Fica "fechada" e "vencida" no dia seguinte, sem prazo para pagar. Bate com a letra do doc ("usa o último dia"), mas não com os bancos. | Seção L: `invoiceDates('2027-02', {closingDay: 30, dueDay: 31})` → `{closing: 2027-02-28, due: 2027-02-28}`. | Ver Dúvida 9. |
| A2-15 | baixa | diverge (doc) | `docs/regras-financeiras.md:37-38` × `:258-265`; `js/domain/cards.js:8` | O doc diz "a compra conta como gasto na data da compra" e, mais abaixo, "conta no mês em que vence a fatura". O código segue a segunda forma (`state.js:100-104`). O comentário de `cards.js:8` ainda descreve a primeira. | Leitura. | Atualizar o doc e o comentário (Dúvida 1). |
| A2-16 | baixa | diverge | `js/domain/budgets.js:21` | O doc diz "acima de 100% (estourou)". O código marca `critical` com `pct >= 1`, então exatamente 100% já aparece como "estourou" (`planning-tab.js:26`). | Leitura: `statusForPct(1) === 'critical'`. | Ver Dúvida 5: trocar para `> 1` ou ajustar o doc. |
| A2-17 | média | risco | `js/ui/*` (lista na seção seguinte) | Cálculo de dinheiro fora de `js/domain/`: dívidas inteiras, pagamento parcial de fatura, rateios, totais de "Ganhos e gastos", vale, relatório do cartão. Várias somas usam `sum()` (float) em vez de `sumMoney`. Não há teste unitário e a regra fica duplicada (por exemplo, `tx-list.js:291-296` refaz `monthTotals`). | Ver "Lógica de dinheiro na UI". | Funções de domínio por assunto (abaixo), com a UI só montando a entrada. |
| A2-18 | baixa | risco | `js/domain/validate.js:19` · `js/data/backup.js:24-39` · `js/data/migrations.js:20` | O backup no formato atual (schema 2) aceita valores com mais de 2 casas (`10.005`) e não arredonda: `money()` só é aplicado ao migrar do schema 1. Isso vale para todas as coleções com valor (`amount`, `totalAmount`, `initialBalance`, `limit`…). | Leitura: `isNum` não confere casas decimais. | Ao restaurar, passar os campos de valor por `money()` ou recusar mais de 2 casas. |
| A2-19 | baixa | risco | `js/domain/parser.js:56,168` · `js/ui/accounts-tab.js:296` (`toFixed(2)`) · `js/ui/tx-list.js:146` (`/ n` sem arredondar) · `js/ui/tx-list.js:580` (CSV `String(t.amount)`) | Arredondamento fora de `money.js`. O parser usa `Math.round(v*100)/100` (hoje seguro, porque aceita no máximo 2 casas). O CSV exporta `1500,5` e não `1500,50`. | Leitura. | Trocar por `money()`/`fmt` do domínio. No CSV, usar sempre 2 casas. |
| A2-20 | baixa | risco | `js/domain/goals.js:22-27,75-78` | Metas: `futureValue` usa a fórmula contínua e só arredonda no fim. O banco arredonda todo mês. `monthsUntil` conta mês de 30 dias. | Seção M: 1.000 + 333,33/mês a 10% a.a. → diferença de R$ 0,10 em 10 anos e R$ 0,65 em 30 anos em relação à simulação em centavos. | Aceitável para previsão. Só registrar no doc que é estimativa. |
| A2-21 | baixa | risco | `js/domain/money.js:19-24` (`splitAmount`) | Com valor negativo, o resto vai na direção errada: −10 em 3x → [−3,32; −3,34; −3,34]. A soma fecha, mas a 1ª parcela fica menor em módulo. Hoje só é chamado com valores positivos. | Seção N. | Dividir o valor absoluto e aplicar o sinal. |
| A2-22 | baixa | provável | `js/ui/tx-edit.js:146-148,193` (`reverseTx`) | Estorno parcial de compra parcelada é ligado à última parcela cobrada. No estorno seguinte, essa parcela sai inteira da base (`charged` exclui parcelas com qualquer estorno), e o máximo permitido fica abaixo do que ainda dá para estornar. | Leitura: 3 parcelas cobradas de 100 e estorno de 10 → no próximo estorno, a base é 200 e não 290. | Base = soma cobrada − soma já estornada do grupo, com a regra no domínio. |

## Lógica de dinheiro na UI (para A2-17)

| Arquivo | Função (linha) | O que calcula |
|---|---|---|
| `js/ui/home-tab.js` | `dashboardFigures`, `spendFigures`, `monthPayments`, `monthProjection`, `projectCats` (76-190, 676-689) | **E3a**, já planejada. Também `:219` (parcelas de dívida) e `:111` (a receber no mês). |
| `js/ui/tx-list.js` | `renderTransactionsTab` (291-296) | Ganhos, gastos, meus/de outros, cartão e vale do mês com `sum()` em float: refaz `monthTotals`. |
| `js/ui/tx-list.js` | `renderTxCalendar` (336-337), `renderTxYear` (352-355) | Totais por dia e por ano. O ano acumula `totInc += …` em float. |
| `js/ui/tx-list.js` | `syncPriorBox` (146), `addLinkedReceivable` (216-222), submit (545) | Parcela média, valor já vencido × parte, rateio `charged × parte / total`, parcela do "A receber". |
| `js/ui/tx-list.js` | "Dividir igualmente" (443) | `Math.floor(total*100/(k+1))/100` (A2-07). |
| `js/ui/commitments-tab.js` | `debtLeft` (49), `debtCardHtml` (87), `payDebt` (125-170), desfazer pagamento (207-208) | **Todas as dívidas**: falta, nº de parcelas, novo pago. Não existe `js/domain/debts.js`. |
| `js/ui/commitments-tab.js` | `recvHistory` (383-394), `syncReceivable` (421-423), `receiveReceivable` (522), `recordReceipt` (588), `monthCharge` (632-636), formulário (786-788) | Parte proporcional da compra, valor já passado pelas faturas, sugestão de parcela, "próxima parcela" da cobrança e parcela padrão. |
| `js/ui/accounts-tab.js` | `accountHtml` (61-62) | Entradas e saídas do mês com `sum()`. |
| `js/ui/accounts-tab.js` | `toggleInvoicePaid` (288-333), `feeTxs` (372) | Resto da fatura, parcela sugerida, juros = parcela × n − resto, validação. |
| `js/ui/accounts-tab.js` | `renderVouchers` (389), `editVoucher` (418-422) | Gasto do vale no mês e nova base do saldo (A2-05). |
| `js/ui/cards-tab.js` | relatório do cartão (33, 51-62), resumo (156) | Parte de cada pessoa por parcela, totais meu/outros, "depois de pagar". |
| `js/ui/planning-tab.js` | `renderBudgets` (61-63, 76, 85, 97), edição de meta (397), `goalMove` (412) | Gasto por categoria (`sum(myShare)`, duplica `expenseCategoryTotals`), média de 3 meses e sugestão arredondada para dezena, saldo da meta. |
| `js/ui/tx-edit.js` | `reverseTx` (145-148), `saveTxEdit` (268-271), `advanceInstallments` (488-530), edição da compra (248) | Base do estorno, novo total da compra, total adiantado e desconto. |
| `js/ui/shared-sync.js` | `decidePaid` (77), `reconcileDebt` (85-86), `saveSharedRow` (215) | Recebido limitado ao total, já pago, parcela padrão. |
| `js/ui/share-charge.js` | `summaryHtml` (118) | Falta = total − recebido. |

## Regra × implementação

| Regra (`docs/regras-financeiras.md`) | Implementação | Situação |
|---|---|---|
| Valores com 2 casas via `money()` (:9) | `js/domain/money.js:8-11` | bate, com A2-10. O backup não arredonda (A2-18). |
| Somas em centavos com `sumMoney` (:11) | `js/domain/money.js:12-14` | bate no domínio. A UI usa `sum()` float em vários lugares (A2-17). |
| Resto na 1ª parte, `splitAmount` (:13) | `js/domain/money.js:19-24`, `transactions.js:99` | bate nas parcelas de cartão. **Diverge** em "A receber" (A2-08), rateio da dividida (A2-09) e UI (A2-07). |
| Realizado × agendado (:20-23) | `js/domain/transactions.js:55-68` | bate. Mostrar no painel é E3a. |
| Gráficos usam o mês inteiro (:24) | `js/ui/home-tab.js` (E3a) | sem implementação no domínio (E3a). |
| Previsão no dia 31 → último dia (:30) | `js/domain/forecasts.js:11` | bate. |
| "Recebi" registra ganho (:31) | `js/ui/shell.js` (`receiveForecast`) | só UI. |
| Esperado / Previsto no fim do mês (:32-33) | `js/ui/home-tab.js` (E3a) | sem implementação no domínio (E3a). |
| Compra conta na data da compra (:37) | — | **diverge**: o código usa a competência pela fatura (:258). O doc se contradiz (A2-15). |
| Fatura com nome do mês do vencimento (:39) | `js/domain/cards.js:31-34` | bate. |
| Antes do fechamento / no dia vai para a seguinte; mês curto (:41-43) | `js/domain/cards.js:15-21` | bate. |
| Vencimento no mesmo mês ou no seguinte; mês curto (:44-45) | `js/domain/cards.js:22-29` | bate (A2-14 é caso de borda). |
| Situação aberta/fechada/vencida/paga (:46) | `js/domain/cards.js:108-114` | bate. |
| Limite usado (:48) | `js/domain/cards.js:117-121` | bate, exceto crédito em fatura negativa (A2-04). |
| Faturas a pagar e fatura aberta (:50) | `js/domain/cards.js:125-143` | bate. |
| Pagar fatura não é gasto e sai da conta (:52-54) | `js/domain/accounts.js:31-42` | bate. |
| Pagamento parcial: rotativo e parcelado (:55-65) | `js/domain/cards.js:58-88`; cálculo do resto e dos juros em `js/ui/accounts-tab.js:288-333,368-378` | bate. Parte da regra está na UI (A2-17). |
| Relatório do cartão "De quem" (:66-69) | `js/ui/cards-tab.js:33-62` | só UI (A2-17). |
| Parcelado até 24x, último dia do mês (:73-74) | `js/domain/transactions.js:9,96-112`, `dates.js:39-43` | bate. |
| Parcelas pagas × futuras (:75) | `js/domain/transactions.js:146-173` | bate. |
| Adiantar parcelas (:76-77) | `js/ui/tx-edit.js:480-532` | só UI. **Diverge** em compra dividida ou de outra pessoa (A2-02). |
| Editar parcela (:78-79, :176-179) | `js/ui/tx-edit.js:245-280` | só UI. |
| Saldo de hoje da conta (:84-89) | `js/domain/accounts.js:11-48` | bate. |
| Transferência não é ganho nem gasto (:90) | `js/domain/accounts.js:26-30`. Transferências ficam em coleção própria, fora de `monthTotals`. | bate. |
| Disponível nas contas (:91) | `js/ui/state.js:132` → `accountBalance` | bate. |
| Planejamento por mês e herança (:95-98) | `js/domain/budgets.js:6-19` | bate. |
| Aviso 80% e acima de 100% (:99) | `js/domain/budgets.js:20-24` | **diverge** em exatamente 100% (A2-16). |
| A receber: parcelado e próxima parcela (:103-106) | `js/domain/receivables.js:10-20` | bate, com o resto na última parcela (A2-08). |
| Cobrar "do mês" (:107-111) | `js/domain/receivables.js:24-34` + `js/ui/commitments-tab.js:632-636` ("se nada vence, vai a próxima") | bate. Parte na UI. Centavo a menos (A2-08, A2-07). |
| Compartilhar cobrança (:114-134) | `js/ui/share-charge.js`, `js/ui/shared-sync.js` | só UI (valores passam por `money()`; ok). |
| Vale com e sem acúmulo (:138-140) | `js/domain/vouchers.js:20-31` | bate com o texto. Valor mensal retroativo (A2-05) e agendado (A2-13). |
| Parser e campos supostos (:144-148) | `js/domain/parser.js`, `js/domain/validate.js` | bate, com A2-11 ("dia 31"). |
| Pago por outra pessoa e devolução (:152-161) | `js/domain/transactions.js:15-25,72-76`; `js/ui/commitments-tab.js` (`recordReceipt`, `forgiveReceivable`) | bate. |
| Parcelas do cartão fora de "Eu devo" (:162-163) | `js/ui/commitments-tab.js:50-55` | bate. |
| Valor total × valor por parcela (:167-168) | `js/domain/transactions.js:129` | bate. |
| Data da compra decide as parcelas pagas; i-ésima fatura (:169-173) | `js/domain/cards.js:43-50`, `transactions.js:117-124` | **diverge** no fim do mês (A2-01). |
| Pagamento de dívida: várias parcelas, conta, conta como gasto? (:183-187) | `js/ui/commitments-tab.js:123-210` | sem implementação no domínio (A2-17). |
| Contas fixas: frequência, mês curto, valor "a partir de" (:191-202) | `js/domain/bills.js:17-46` | bate. |
| Lançamento automático e Desfazer (:195-200) | `js/ui/bills.js:33-63,200-210` | bate, menos quando o gasto é excluído fora de "Desfazer" (A2-06). |
| Encerrar (:203) | `js/domain/bills.js:23` (`endMonth`) | bate. |
| Contas fixas no Início e no previsto (:204-205) | `js/ui/bills.js:65-67`, `js/ui/home-tab.js` (E3a) | E3a. No cartão, o mês diverge (A2-12). |
| Estorno negativo ligado, não apaga a compra (:209-211) | `js/domain/validate.js:19`, `transactions.js:22-24`, `js/ui/tx-edit.js:139-198` | bate. Excluir a compra deixa o estorno órfão (A2-03). |
| Estorno no cartão: fatura escolhida, libera limite (:212-214) | `js/domain/cards.js:53`, `js/ui/tx-edit.js:151-157` | **diverge** quando a fatura escolhida fica negativa (A2-04). |
| Estorno parcial; não passar do valor (:217-218) | `js/ui/tx-edit.js:148,178` | só UI. Base menor que a real na parcelada (A2-22). |
| Compra dividida: total × sua parte (:222-227) | `js/domain/transactions.js:26-44`; `js/ui/tx-list.js:530-550` | bate, com 1 centavo de diferença por parcela (A2-09). |
| Bancos e cartões; conta que paga a fatura (:231-236) | `js/ui/accounts-tab.js:40-55` (`bankGroups`), `payAccountFor` | só UI (não é cálculo de dinheiro). |
| Compra antiga: `settled` fora do limite (:240-243) | `js/domain/cards.js:85-87`, `transactions.js:117-126` | bate. |
| Dia da conta fixa conforme a forma de pagamento (:253-254) | `js/ui/bills.js:131-150` | bate. |
| Competência pela fatura (:258-265) | `js/ui/state.js:100-104` → `transactions.js:49-52` | bate, exceto na projeção de contas fixas (A2-12). |

## Testes (`tests/unit/`)
`npm test` → 119/119 passam. Toda função exportada que calcula dinheiro tem pelo menos um teste citando o nome. Faltam **casos**:
- parcelas com dia ≥ 28 em cartão que fecha 29, 30 ou 31 (A2-01). O teste `cards-installments.test.js:42-45` confere só as datas, não as faturas;
- `money()` com meio centavo (1,005; 2,675; negativos) (A2-10);
- "A receber" com resto (100 em 3x) em `recvDueByMonth` e `recvInstallInfo` (A2-08);
- soma de `myShare` nas parcelas de compra dividida = `split.mine` (A2-09);
- estorno numa fatura sem compras: `cardUsed` e `invoicesSummary` (A2-04);
- vale: troca de valor mensal e gasto com data futura (A2-05, A2-13);
- parser: "dia 31" e "dia 30" em março e maio (A2-11);
- `billStatus` (sem nenhum teste), `isPersonal`/`isForOther`/`isRefund` isolados;
- dívidas: nenhuma regra no domínio, então nenhum teste unitário (A2-17).

## Tarefas propostas
Regra da casa: um dono por arquivo por onda. As tarefas de uma mesma onda não têm arquivo em comum e podem rodar
em paralelo, cada uma em seu worktree. `js/ui/home-tab.js` fica de fora: é da E3a ([auditoria 1](auditoria-1.md)).
Cada tarefa fecha com `npm run check` verde. Tarefa que mexe em arquivo servido ao navegador fecha também com `npm run sw:update`.

### Onda 1: correções isoladas (todas em paralelo)
Execução: três agentes em paralelo, um por camada. domain-dev faz T01 a T05 em sequência, data-dev faz T06 e ui-dev faz T07 e T08. Os conjuntos de arquivos não se cruzam. `npm run sw:update` roda uma vez, no fechamento da onda.

| Id | Tarefa | Dono | Arquivos permitidos | Depende de | Aceite | Status |
|---|---|---|---|---|---|---|
| A2-T01 | Parcela i na i-ésima fatura (A2-01) e comentário de `cards.js:8` (A2-15) | domain-dev | `js/domain/cards.js`, `tests/unit/cards-installments.test.js` | Dúvida 2 | `txInvoiceKey` de uma parcela com `purchaseDate` = fatura da compra + (n−1). Testes: fecha 31 com compra 30/03 em 3x → `03`, `04`, `05`; fecha 30 com compra 28/01/2027 → `01`, `02`, `03`; `firstDueInstallment` coerente com as faturas; parcela sem `purchaseDate` mantém o resultado atual; os testes antigos continuam verdes. | done |
| A2-T02 | `money()` sem erro de meio centavo (A2-10) e `splitAmount` com negativo (A2-21) | domain-dev | `js/domain/money.js`, `tests/unit/money-dates.test.js` | — | `money(1.005) = 1.01`, `money(2.675) = 2.68`, `money(-1.005) = -1.01`; `splitAmount(-10, 3) = [-3.34, -3.33, -3.33]`; os 119 testes atuais continuam verdes. | done |
| A2-T03 | "A receber" parcelado com a regra de `splitAmount` (A2-08) e função de parcela padrão para a UI | domain-dev | `js/domain/receivables.js`, `tests/unit/accounts-budgets.test.js` | Dúvida 4 | Exportar `recvParts(total, n)` (centavos inteiros). `recvDueByMonth` de 100 em 3x, tudo vencido = 100. Depois de receber as 3 parcelas, `remaining = 0`. `installmentAmount` gravado continua sendo respeitado. | done |
| A2-T04 | Parte "sua" por parcela que fecha com `split.mine` (A2-09) e `splitEqual(total, pessoas)` em centavos | domain-dev | `js/domain/transactions.js`, `tests/unit/total-e-meu.test.js` | — | A soma de `myShare` nas parcelas é igual a `split.mine`, e a de `othersShare` é igual a `total − mine`, para 100 em 3x (50/50) e 99,99 em 7x (1/3). `splitEqual(2.26, 2)` → 1,13 / 1,13. Compras antigas sem a nova marcação dão o mesmo resultado de hoje. | done |
| A2-T05 | Parser "dia 30/31" sem transbordar (A2-11) | domain-dev | `js/domain/parser.js`, `tests/unit/parser.test.js` | — | Hoje 05/03/2026: "dia 31" → 2026-01-31 e "dia 30" → 2026-01-30 (ou último dia válido, conforme decidido). Hoje 10/05/2026: "dia 31" → 2026-03-31. Os testes atuais continuam verdes. | done |
| A2-T06 | Backup: arredondar ou recusar valores com mais de 2 casas (A2-18) | data-dev | `js/data/backup.js`, `tests/unit/backup.test.js` | — | Restaurar `amount: 10.005` devolve 10.01 (ou erro claro, conforme decidido). Vale para `amount`, `totalAmount`, `receivedAmount`, `paidAmount`, `initialBalance`, `limit`, `targetAmount`, `currentAmount` e `budgets.limits`. | done |
| A2-T07 | Adiantar parcelas mantém `split`/`forOther` (A2-02) | ui-dev | `js/ui/tx-edit.js`, `tests/e2e/55-adiantar-dividida.e2e.js` (novo) | — | Adiantar as 2 últimas de 300 em 3x dividida 50/50 → "seus gastos" somam 150 e "de outras pessoas" 150. Com desconto, as duas partes ficam proporcionais. `npm run test:e2e` verde. | done |
| A2-T08 | Excluir compra leva os estornos; conta fixa excluída não volta sozinha (A2-03, A2-06) | ui-dev | `js/ui/shell.js`, `js/ui/bills.js`, `tests/e2e/56-excluir-ligados.e2e.js` (novo) | Dúvidas 6 e 7 | Excluir compra com estorno → nenhum lançamento com `reversal.of` órfão, e o gasto do mês volta ao valor anterior à compra. Excluir o gasto de uma conta fixa lançada sozinha e recarregar → não é lançada de novo (aparece "Não lançada"). | done |

### Onda 2: depende da onda 1 (em paralelo entre si)

| Id | Tarefa | Dono | Arquivos permitidos | Depende de | Aceite | Status |
|---|---|---|---|---|---|---|
| A2-T09 | Crédito de estorno em fatura que fica negativa (A2-04) | domain-dev | `js/domain/cards.js`, `tests/unit/fatura-adiantada.test.js` | A2-T01, Dúvida 8 | Compra de 100 em outubro e estorno de −100 escolhido em novembro → `cardUsed = 0` e nada a pagar no total. A regra escolhida (passa adiante ou abate) está nos testes. | todo |
| A2-T10 | Vale: histórico do valor mensal e agendados (A2-05, A2-13) | domain-dev | `js/domain/vouchers.js`, `tests/unit/vale.test.js` (novo) | Dúvida 3 | Mudar o valor de 500 para 600 em novembro não muda os créditos de janeiro a outubro. O gasto com data futura segue a decisão da Dúvida 3. | todo |
| A2-T11 | Telas usam as funções novas: parcela do "A receber" e "Dividir igualmente" (A2-07) e parcela no `addLinkedReceivable`. Do relatório da onda 1: `monthCharge` passa a usar `recvNextAmount`, não `info.per * (paid+1)`; a dica da "parcela atual" em `tx-list.js:128` passa a usar `txInvoiceKey`, não a data da parcela (feito na correção da onda 1). Da revisão: `shared-sync.js:215` deve usar `recvInstallInfo(r).per` em vez de `money(total/n)`; `share-charge.js:44,165` devem mostrar a 1ª parcela com a sobra; em `home-tab.js:241/251`, "faltam N de R$ X" passa a "próxima: R$ X". | ui-dev | `js/ui/commitments-tab.js`, `js/ui/tx-list.js` | A2-T03, A2-T04 | Nenhum `Math.floor(x*100)` nesses arquivos. 2,26 em 2x → 1,13 + 1,13. "Dividir igualmente" com 2,26 → 1,13 para a outra pessoa. e2e `52-total-e-meu` verde. | todo |
| A2-T12 | Estorno parcial de parcelada: base = cobrado − já estornado (A2-22), com a regra no domínio | domain-dev | `js/domain/transactions.js`, `tests/unit/cards-installments.test.js` | A2-T01, A2-T04 | `reversalBase(group, list, today)`: estornar 10 de 300 cobrados deixa 290 disponíveis. | todo |

### Fora da auditoria: e2e que já falhavam antes da onda 1
Rodados no commit `7a804d4` sem nenhuma mudança: o resultado é o mesmo antes e depois da onda 1. Provavelmente dependem da data de hoje (07/11) ou do layout.
- `25-calendario`: "parcela do mês que vem aparece no dia dela" e "vencimento da fatura do Inter marcado".
- `54-menos-informacao`: "no Início, ‹ mês › ficam numa linha só".

| Id | Tarefa | Dono | Arquivos permitidos | Aceite | Status |
|---|---|---|---|---|---|
| A2-T17 | Descobrir por que esses 3 e2e falham e corrigir o teste ou o app | qa (diagnóstico), dono da camada (correção) | `tests/e2e/25-calendario.e2e.js`, `tests/e2e/54-menos-informacao.e2e.js`, `tests/e2e/52-total-e-meu.e2e.js` | Os 3 passam em qualquer data | **done** (18/11/2026): eram problemas dos testes, não do app. 25: o botão “próximo mês” ficava sob o cabeçalho fixo (o teste agora rola até ele); 52: a fatura “de 45 dias atrás” caía no fechamento em certos dias (agora usa o dia 15 de dois meses atrás); 54: o teste media o centro do nome do mês e o selo “Este mês” fica embaixo. Além disso, os e2e passaram a usar relógio fixo e rodar em paralelo. |

### Onda 3: tirar dinheiro da UI e fechar (depois da E3a)

| Id | Tarefa | Dono | Arquivos permitidos | Depende de | Aceite | Status |
|---|---|---|---|---|---|---|
| A2-T13 | Domínio para dívidas, pagamento parcial de fatura, totais da lista e relatório do cartão (A2-17) | domain-dev | `js/domain/debts.js` (novo), `js/domain/cards.js`, `js/domain/transactions.js`, `tests/unit/dividas.test.js` (novo), `tests/unit/cards-installments.test.js` | Onda 2, E3a-1 | Funções puras: `debtLeft`, `debtInstallments`, `debtPay`; `partialPlan(total, paidNow, mode, n, parcel, fee)` → `{rest, fee, error}`; `cardReport(list, card, keys)`; `listTotals(tx)` usando `myShare`/`othersShare` e `sumMoney`. Testes cobrindo cada uma. | todo |
| A2-T14 | UI chama o domínio: dívidas, fatura parcial, totais da lista e do ano, vale, relatório, planejamento | ui-dev | `js/ui/commitments-tab.js`, `js/ui/accounts-tab.js`, `js/ui/tx-list.js`, `js/ui/cards-tab.js`, `js/ui/planning-tab.js` | A2-T13, A2-T10 | Nenhum `sum(` sobre valores de dinheiro nesses arquivos (`grep`). `editVoucher` grava histórico de valor. Os resultados na tela não mudam fora dos achados corrigidos. `npm run test:e2e` verde. | todo |
| A2-T15 | Contas fixas no cartão na projeção pelo mês da fatura (A2-12) | domain-dev | `js/domain/month-summary.js`, `tests/unit/month-summary.test.js` | E3a-1 | Conta fixa no cartão com dia 28 (fecha 25, vence 5) entra na projeção do mês seguinte, igual ao lançamento real. | todo |
| A2-T16 | Doc atualizado com as decisões (A2-15, A2-16, Dúvidas 1–9) e `statusForPct` | domain-dev | `docs/regras-financeiras.md`, `js/domain/budgets.js`, `tests/unit/accounts-budgets.test.js` | Dúvidas respondidas, Onda 2 | Sem contradição entre :37 e :258. Regra de 100% coerente com o código. Cada achado corrigido citado na seção da regra. | todo |
| A2-QA | Fechamento | qa | `tests/` | A2-T14, A2-T15, A2-T16 | `check` + `e2e` verdes. Conferência manual a 390 px de Cartões (fatura com parcela no fim do mês), "Me devem" (cobrar do mês) e compra dividida. | todo |

## Decisões do usuário (2026-11-07)
1. **Mês do gasto no cartão:** é o mês do vencimento da fatura, como o código já faz. Corrigir o doc (:37) e o comentário de `cards.js:8`.
2. **Parcelas:** a 1ª parcela depende do fechamento do cartão na data da compra. Se a fatura já fechou, vai para a fatura seguinte; se está aberta, fica na atual. Da 2ª em diante, cada parcela cai na fatura seguinte à anterior, sem pular nem repetir. Ou seja, a parcela n fica na fatura da compra + (n−1).
3. **Vale:** gasto agendado (data futura) não desconta do saldo de hoje. Mudar o valor mensal vale do mês da mudança em diante.
4. **"A receber" parcelado:** os centavos que sobram vão na 1ª parcela, como nas compras do cartão.
5. **Planejar:** exatamente 100% é "no limite"; estoura só acima de 100%.
6. **Excluir compra ligada (estorno ou "A receber"):** o app pergunta e, se a pessoa confirmar, apaga tudo junto.
7. **Conta fixa excluída à mão:** conta como "Desfazer" (o mês fica pulado) e não é lançada de novo sozinha.
8. **Estorno maior que a fatura escolhida:** a sobra passa para a fatura seguinte e libera o limite.
9. **Fecha 30 e vence 31 em fevereiro:** o vencimento vai para o dia útil seguinte ao fechamento. Interpretação: pular sábado e domingo, sem feriados.
- Decisões tomadas pelo orquestrador onde a auditoria deixou em aberto: A2-T05, "dia 31" sem esse dia no mês anterior → último mês que tem o dia, marcado como suposto; A2-T06, backup arredonda com `money()` em vez de recusar.

## Dúvidas para o usuário (respondidas acima)
1. **Mês do gasto no cartão.** O doc diz em :37 "conta na data da compra" e em :258 "conta no mês em que vence a fatura". O código faz o segundo. Posso corrigir o doc para dizer só o segundo?
2. **Parcelas no fim do mês (A2-01).** Compra no dia 30 num cartão que fecha dia 31: a 2ª parcela deve cair na fatura seguinte (como nos bancos, e como diz o doc em :169), mesmo que a data da parcela (30/04) seja o dia do fechamento em abril? Minha sugestão é que sim.
3. **Vale (A2-05, A2-13).** Um gasto agendado no vale (data futura) deve descontar do saldo de hoje? E mudar o valor mensal vale a partir do mês da mudança, como nas contas fixas?
4. **Centavos que sobram no "A receber" parcelado (A2-08).** Vão na 1ª parcela, como nas compras do cartão, ou na última, como hoje? Na compra dividida, a parcela do "A receber" deveria seguir as parcelas reais do cartão?
5. **Planejar (A2-16).** Gastar exatamente 100% do planejado é "estourou" (hoje) ou "no limite" (como diz o doc: "acima de 100%")?
6. **Excluir uma compra ligada (A2-03).** Se a compra tem estorno ou um "A receber" ligado (pago por outra pessoa ou dividida), o app deve apagar tudo junto, perguntar ou impedir?
7. **Conta fixa (A2-06).** Se você exclui em "Ganhos e gastos" o gasto que a conta fixa lançou sozinha, ele deve voltar a ser lançado? Minha sugestão é tratar como "Desfazer".
8. **Estorno maior que a fatura escolhida (A2-04).** O crédito que sobra passa para a próxima fatura (como o banco faz) ou só libera limite?
9. **Fechamento 30 e vencimento 31 (A2-14).** Em fevereiro, a fatura fecha e vence no mesmo dia (28). Fica assim, ou o vencimento passa para o mês seguinte quando cair no dia do fechamento?
