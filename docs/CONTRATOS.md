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
