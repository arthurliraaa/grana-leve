# CONTRATOS entre camadas

## Resumo do mês (E3a)
Módulo novo `js/domain/month-summary.js`. Funções puras: recebem dados já carregados (nada de `State`,
DOM ou `js/ui/*`), devolvem valores em reais arredondados por `money()` de `js/domain/money.js`.
A regra é a que está hoje em `js/ui/home-tab.js` (`monthPayments`, `spendFigures`, `monthProjection`)
e em `docs/regras-financeiras.md`; a extração **não muda resultado**.

Entradas comuns:
- `tx`: lista de lançamentos (`State.transactions`); `cards`, `accounts`: como no `Store`.
- `bankGroups`: `[{acc|null, cards: [card]}]`, como `bankGroups()` da UI.
- `accountMoves(acc)`: passado como função ou como mapa `{accId: moves[]}` (decisão do domain-dev,
  registrar aqui antes de E3a-2).
- `billOccurrences`: ocorrências de contas fixas pendentes do mês (`pendingBills()` de `js/ui/bills.js`),
  `[{b: {pay, category, name}, amount, key, date, status, paid, skipped}]`.
- `forecastOccurrences`: de `js/domain/forecasts.js`.
- `cur`: chave `AAAA-MM` do mês; `today`: `AAAA-MM-DD`.

```js
// Falta pagar e já pago no mês, por banco, com a parte "minha".
monthPayments({tx, bankGroups, accountMoves, billOccurrences, cur, today})
  -> {rows: [{name, paid, left, mine, go}], paid, left, leftMine,
      invoices, invoicesMine, bills, scheduled}

// Números do quadro "Neste mês" nas duas versões (total × meu).
monthSpend({totals /* monthTotals */, others /* monthOthers */, payments /* monthPayments */,
            hasAccounts, available, balanceDone})
  -> {income, mine, others, total, left, leftMine, leftOthers, saldoAll, saldoMine}

// Mês futuro: o registrado + contas fixas não lançadas + previsões de entrada não recebidas.
monthProjection({key, curKey, totals, billOccurrences, forecastOccurrences})
  -> {inc, exp, incExtra, expExtra, forecast: boolean, bills}
```

Os nomes exportados por `home-tab.js` (`monthPayments`, `spendFigures`, `monthProjection`) continuam
existindo com o mesmo formato de retorno; eles só montam a entrada e chamam o domínio.

## Auditoria 2, onda 1 (domínio): o que mudou para quem chama
Nenhuma assinatura exportada mudou. Funções novas e resultados que mudam:

```js
// cards.js — mesma assinatura. Parcela com purchaseDate: fatura da compra + (n−1) (A2-01).
// Sem purchaseDate (cadastro antigo com "parcela atual") ou estorno com invoiceKey: como antes.
txInvoiceKey(t, card) -> 'AAAA-MM'
// Para saber a fatura de uma parcela, use txInvoiceKey(t, card), nunca invoiceKeyFor(t.date, card).

// money.js — toCents/money arredondam meio centavo para longe do zero sem erro de binário
// (money(1.005) = 1.01; money(-1.005) = -1.01). splitAmount com negativo: [-3.34, -3.33, -3.33].
// toCents = sinal × round(|x|·100·(1+4ε)); texto não numérico, '', null, undefined → 0; nunca −0.

// receivables.js
recvParts(total, n) -> [reais]   // calculado em centavos inteiros; sobra na 1ª. Parcela padrão = recvParts(total, n)[n-1]
recvNextAmount(r) -> reais       // o que falta da próxima parcela (a 1ª pode ter centavos a mais)
recvInstallInfo(r) -> {n, per, paid, next, nextDue}   // mesmo formato; per = parcela 2..n
// Com installmentAmount gravado, ele vale para as parcelas 2..n e a 1ª fica com total − per×(n−1).
// Registros antigos (recebidos sem a sobra na 1ª, ex.: 33,33 de 100 em 3x) continuam certos: a parcela
// i < n conta como recebida com got ≥ soma(parts[0..i−1]) − (parts[0] − parts[n−1]); quitar a última
// exige o total. Nesse caso a sobra é cobrada na última parcela.

// transactions.js
myShare(t) / othersShare(t)      // mesma assinatura; parcela padrão de compra dividida usa splitAmount(mine, N)[n-1]
splitEqual(total, pessoas) -> [reais]   // "Dividir igualmente": [sua parte (com a sobra), parte de cada outra pessoa...]

// Adiantamento de parcelas (S5). group = g de installmentGroups (usa g.items) ou a lista de parcelas;
// advancedNs = números (installment.n) das parcelas adiantadas; paid = valor pago (omitido: a soma delas).
advanceShare(group, advancedNs, paid?) -> reais
//   sem desconto: split.mine − Σ myShare das parcelas não adiantadas (as que já não existem contam pela
//   parte padrão); com desconto: proporcional ao pago. forOther → 0; sem split → paid.
advanceFields(group, advancedNs, paid?) -> {split?, forOther?}   // para Object.assign no lançamento
//   split = {total: paid, mine: advanceShare(...), people: [... amount = parte de cada um no pago]},
//   assim myShare(adv) = advanceShare(...) e myShare + othersShare = paid. Substitui advanceShareOf da UI:
//   Object.assign(adv, advanceFields(g, toRemove.map(t => t.installment.n), r.paid))

// Exclusão com itens ligados (S1, A2-03 + A4), movida de js/ui/shell.js; mesma assinatura.
linkedToDelete(list, receivables, ids) -> {reversals, receivables, refunds, advances, extraTxIds}
//   advances: lançamentos com installmentAdvance.group de um grupo cujas parcelas estão em ids (A4);
//   o "A receber" deles é tratado como o das parcelas (só sai se nenhum lançamento que fica o usa);
//   extraTxIds: ids a apagar além de ids (advances + reversals + refunds). A UI apaga ids.concat(extraTxIds).

// parser.js — parse(): "dia 31" quando o mês passado não tem o dia → último mês que tem, com
// recognized.date = false (a revisão destaca a data).
```


## Novembro/2026: funções novas do domínio (conselhos, simulador, metas, alertas, faturas)
Todas puras (sem DOM nem `Store`), em `js/domain/`; valores em reais arredondados por `money()`.

```js
// advice.js — conselhos do mês, por regras. Ordem: o que mais pesa primeiro.
buildAdvice({today, transactions, plan, catName, receivables, goals, nextCommitted, nearPct?})
  -> [{id, kind, tone: 'warn'|'tip'|'good', title, text, todo?, saving?, action?, impact}]
//   kind: over | near | spike | nolimit | savings | commit | small | receive | goal | goaloff | good
//   action: {type: 'limit', cat, amount, label} | {type: 'go', tab, label}
previousAverages(transactions, key) -> {avg: {categoria: média}, months}   // últimos 3 meses com gasto

// simulate.js — "se eu fizer isso, como ficam as contas?". adds = {deslocamento do mês: saída a mais}.
projectCash(cash, months /* [{key,label,out,inc}] */, adds, inflowNow)
  -> [{key, label, out, inc, added, base, sim, diff}]     // saldo no fim de cada mês, sem (base) e com (sim)
firstRedMonth(rows) -> {label, sim, wasRed} | null
splitInstallments(total, n) -> [reais]                    // a 1ª leva os centavos
goalUseImpact(goal, amount, today) -> {current, after, shortfall, hasTarget, pctBefore, pctAfter, pace, monthsToRefill, targetDate}

// budgets.js
budgetAlerts(spentByCat, limits, near?) -> [{cat, pct, level: 'near'|'over', spent, limit}]   // near padrão 0,9
alertPercent(v) -> 50..99 (inválido → 90)
monthBurn(items, key, today, limit) -> {days, upto, cum, spent, scheduled, limit, ideal, projected, ahead}

// goals.js
hasTarget(g) -> boolean            // targetAmount > 0; sem alvo a meta nunca conclui
goalForecast(g, today)             // sem alvo: {openEnded: true, ...} e, com prazo, atDeadline
// movimentações da meta: {id, date, amount, kind: 'deposit'|'yield'|'withdraw', purpose?: 'outro', txId?}
//   purpose 'outro' = retirada para outra coisa (fora do objetivo); txId liga ao lançamento de gasto.

// cards.js — fatura paga que ainda recebe compras
card.invoicePaidDue[key] = {due, at}   // total da fatura quando foi marcada como paga
invoicePaidSnapshot(card, key) -> {due, at} | null
invoiceExtraAfterPaid(list, card, key) -> reais   // o que passou do total pago, abatido dos adiantamentos feitos depois
invoiceStatus(card, key, today, list?)   // com list: paga + compra nova vira aberta/fechada/vencida; adiantamento que quita fatura fechada = 'paga'
invoiceLeft(list, card, key)             // fatura paga com registro: só o que chegou depois

// accounts.js — ajuste de saldo
account.adjustments: [{id, date, createdAt, amount, note?}]   // entra no saldo, não é ganho nem gasto (kind 'Ajuste de saldo')

// transactions.js
whoLabel(t) -> 'Seu' | 'De Fulano' | 'Dividida com A, B'
categoryExpenses(list, key, cat, all) -> lançamentos da categoria no mês (mesma regra do gráfico)
// lançamento pago com o dinheiro de uma meta: {paymentMethod: 'conta', accountId: null, goalId}
```

Nenhuma migração SQL foi necessária: os campos novos (`invoicePaidDue`, `adjustments`, `purpose`, `goalId`)
ficam dentro dos documentos já guardados (jsonb).

## Salário líquido e horas extras (`js/domain/salary.js`)
Estimativa, com as tabelas de 2026 reunidas em `TABLES` (atualizar uma vez por ano: INSS, IRRF, MEI).
```js
inssEmployee(gross) -> reais                    // progressivo (7,5/9/12/14%) e limitado ao teto
irrfMonthly({gross, pension, dependents, alimony}) -> reais
//   base = gross − max(pension + dependentes × 189,59, simplificado 607,20); tabela mensal; depois a redução da
//   Lei 15.270/2025: gross ≤ 5.000 zera o imposto; de 5.000 a 7.350: redutor = 978,62 − 0,133145 × gross
hourlyRate(salary, weeklyHours) -> reais        // divisor = horas semanais × 5 (44h = 220)
overtimePay(salary, weeklyHours, h50, h100, withDsr, tables, {workDays, restDays}) -> {hourly, pay50, pay100, dsr, total}
//   50% = ×1,5; 100% = ×2; DSR estimado = (horas extras ÷ dias de trabalho) × dias de repouso (padrão 25 e 5)
DISCOUNT_TYPES                                  // vt, saude, odonto, refeicao, pensao, consignado, sindical, adiantamento (varia), outro
BONUS_TYPES                                     // homeoffice, ajuda, alimentacao, transporte (não tributam); bonificacao, comissao, plr (variam); gratificacao, outro
discountAmount({mode: 'pct'|'fixed', value}, base) -> reais
netSalary({regime, gross, weeklyHours, h50, h100, dsr, workDays, restDays, dependents, discounts, rpps, meiKind, inssKind,
           simplesRate, otherPct, bonuses})   // discounts: [{type, label?, mode: 'pct'|'fixed', value, varies?}]
//   bonuses (ganhos além do salário): [{type, label?, mode, value, varies?, taxable?}]; taxable soma à base do INSS e do
//   imposto (padrão por tipo: bonificação, comissão, gratificação, PLR pagam; auxílios e ajuda de custo não), senão só ao líquido
  -> {lines: [{id, label, amount, kind: 'base'|'plus'|'minus'}], gross, extras, total, discounts, net, fixedNet, hasVariable, rate}
//   regime: clt | servidor | mei | autonomo | pj | estagio | outro. Só o salário e os descontos que NÃO variam são fixos:
//   horas extras (e o repouso delas) e descontos com varies:true entram só em net (o mês); fixedNet é o que se registra
//   todo mês (igual a net quando hasVariable é false). Pensão alimentícia também reduz a base do imposto de renda.
//   O vale-transporte não é fixo em 6%: cada empresa desconta um valor, por isso é um desconto editável em R$ ou %.
//   Hora extra só em clt e servidor.
```
A tela (`js/ui/salary-calc.js`) abre de “Previstas”, do simulador (ganho) e do formulário de ganho, e guarda o jeito de
trabalhar e os descontos nas preferências (`workProfile`). “Usar o líquido fixo” preenche `fixedNet`; “Usar o líquido
deste mês” preenche `net` uma vez só (e desmarca “Repete todo mês” em Previstas).
