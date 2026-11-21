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
onCallPay(salary, weeklyHours, hours) -> reais   // sobreaviso: 1/3 da hora normal por hora à disposição (TABLES.onCall)
overtimePay(salary, weeklyHours, h50, h100, withDsr, tables, {workDays, restDays}) -> {hourly, pay50, pay100, dsr, total}
//   50% = ×1,5; 100% = ×2; DSR estimado = (horas extras ÷ dias de trabalho) × dias de repouso (padrão 25 e 5)
DISCOUNT_TYPES                                  // vt, saude, odonto, refeicao, pensao, consignado, sindical, adiantamento (varia), outro
BONUS_TYPES                                     // homeoffice, ajuda, alimentacao, transporte (não tributam); bonificacao, comissao, plr (variam); bonificacao-vale (varia, não tributa); gratificacao, outro
thirteenth({regime, gross, varAvg, thirdMonths, dependents, rpps}) -> {months, total, first, inss, irrf, second, net, fgts, lines} | null
//   13º: (gross + varAvg) × meses/12; 1ª parcela = metade, sem descontos; INSS e imposto (com a redução da Lei 15.270) só
//   sobre o 13º inteiro, à parte do salário, e saem da 2ª parcela. Só clt e servidor; fgts só clt.
vacation({regime, gross, varAvg, vacDays, vacSell, dependents, rpps}) -> {days, pay, third, abono, taxable, inss, irrf, net, fgts, lines} | null
//   férias: (gross + varAvg) ÷ 30 × dias + 1/3; vender 10 dias (vacSell) soma o abono + 1/3 sem desconto e limita os dias
//   gozados a 20; INSS/imposto/FGTS só sobre os dias gozados + 1/3. Estimativa isolada do salário do mês.
discountAmount({mode: 'pct'|'fixed'|'perday'|'benefit', value, benefit, pct, charged, refDays, days}, base) -> reais
//   mode 'perday' (só vt e refeicao): charged ÷ refDays × days — o que foi cobrado num mês (em refDays dias de uso) vira
//   valor por dia e acompanha os dias de uso do mês (days, padrão: dias úteis; a pessoa corrige por feriados)
//   mode 'benefit' (só vt e refeicao): vt = min(benefit, pct% do salário), pois o desconto nunca passa do valor do vale;
//   refeicao = pct% do benefício recebido no mês. A tela calcula benefit do vt como passagem por dia × dias de uso
//   (padrão: dias úteis do mês, workdaysInMonth(ano, mês 0-11), sem descontar feriados)
netSalary({regime, gross, weeklyHours, h50, h100, dsr, workDays, restDays, dependents, discounts, rpps, meiKind, inssKind,
           simplesRate, otherPct, bonuses, sobreaviso})   // discounts: [{type, label?, mode: 'pct'|'fixed', value, varies?}]
//   bonuses (ganhos além do salário): [{type, label?, mode, value, varies?, taxable?}]; taxable soma à base do INSS e do
//   imposto (padrão por tipo: bonificação, comissão, gratificação, PLR pagam; auxílios e ajuda de custo não), senão só ao líquido
  -> {lines: [{id, label, amount, kind: 'base'|'plus'|'minus'}], gross, extras, onCall, fgts, fixedFgts, total, discounts, net, fixedNet, hasVariable, rate}
//   fgts = 8% do total tributável, só CLT; é depósito da empresa e NÃO entra no líquido (servidor, MEI etc.: 0).
//   Sobreaviso (sobreaviso = horas) é ganho variável e tributável, só clt e servidor, sem reflexo no DSR
//   regime: clt | servidor | mei | autonomo | pj | estagio | outro. Só o salário e os descontos que NÃO variam são fixos:
//   horas extras (e o repouso delas) e descontos com varies:true entram só em net (o mês); fixedNet é o que se registra
//   todo mês (igual a net quando hasVariable é false). Pensão alimentícia também reduz a base do imposto de renda.
//   O vale-transporte não é fixo em 6%: cada empresa desconta um valor, por isso é um desconto editável em R$ ou %.
//   Hora extra só em clt e servidor.
```
## Importar extrato OFX e CSV (`js/domain/statement.js`)
Lê o arquivo neste aparelho (nada é enviado), devolve itens padronizados e os rascunhos que a pessoa confere antes de gravar.
```js
decodeBytes(bytes) -> texto            // UTF-8; se não for, Windows-1252 (OFX antigo); tira o BOM
parseAmountText(txt, dotIsDecimal) -> número | NaN   // "R$ 1.234,56", "(45,00)", "45,00-"; no OFX o ponto é decimal
parseDateText(txt) -> 'AAAA-MM-DD' | ''              // 20261105, 05/11/2026, 05-11-26, 2026-11-05…
parseOfx(text) -> {kind: 'bank'|'card'|'unknown', accountId, items, skipped}   // OFX 1.x (SGML) e 2.x (XML)
parseCsv(text) -> {delimiter, rows}                  // ; , ou tab; aspas e "" escapadas; cabeçalho no meio do arquivo
detectCsvLayout(rows) -> {header, map: {date, desc, amount, debit, credit}, invert, rows} | null
csvItems(layout, map, invert) -> {items, skipped}    // invert: positivo é gasto (fatura de cartão estilo Nubank)
// item = {id (FITID ou ''), date, amount (negativo = saiu dinheiro), name}
buildDrafts(items, {accountId, isCard, existing, learned, validCategory}) -> rascunhos
//   {key, externalId ('ofx:conta:FITID'), date, type, amount, description, category, dup: ''|'imported'|'similar', ignore, checked}
//   imported = o mesmo FITID já foi importado; similar = lançamento manual do mesmo dia, tipo e valor (cobre no máximo um item);
//   cartão: crédito (pagamento da fatura, estorno) não vira ganho (ignore)
parsePdfLines(linhas, {today}) -> {items, skipped, looksCard, refDate}   // PDF já em texto, uma linha visual por item
//   linha = data (dd/mm[/aaaa] ou "05 NOV") + descrição + valor; ano pelo vencimento; D/C, "-" e parênteses dão o sinal; totais e saldos
//   ficam fora; com 2 valores na linha vale o primeiro (o segundo é saldo). Leitura APROXIMADA: sempre conferida na tela.
learnCategories(transactions) / descriptionKey(texto)  // categoria que a pessoa já usou para cada estabelecimento
```
Tela (`js/ui/import-statement.js`, botão “Importar extrato” em Ganhos e gastos): escolhe o arquivo e onde entram os
lançamentos (conta ou cartão), ajusta as colunas do CSV, confere (marcar, trocar categoria) e importa. Cada lançamento
grava `source: 'import'`, `externalId` (OFX) e `importBatch`; “Importações anteriores” desfaz uma importação inteira.
Limites: 2 MB (OFX/CSV; 10 MB e 30 páginas no PDF) e 800 lançamentos por vez. A tela recomenda OFX ou CSV gerados no banco (leitura exata)
e avisa que o PDF é aproximado. PDF: `js/ui/pdf-read.js` baixa o pdf.js 3.11.174 do cdnjs só ao escolher um PDF, com SRI no leitor e
`fetch(..., {integrity})` no worker (que roda como blob: a CSP tem `worker-src 'self' blob:`), `isEvalSupported: false` (CVE-2024-4367) e
pede a senha se o PDF tiver. Atualizar o pdf.js exige novos hashes SRI (cdnjs: api.cdnjs.com/libraries/pdf.js/VERSÃO?fields=sri).

## Plano do salário (`js/domain/salary-plan.js`)
O salário previsto todo mês é uma previsão de entrada (`forecasts`) com o campo `salary`; as datas e os valores de cada mês
saem de `forecastOccurrences`. Contas puras, sem feriados (a pessoa corrige a data ao confirmar).
```js
// forecast.salary = {rule, steps: [{from: 'AAAA-MM', gross, net}], months: {'AAAA-MM': {gross, net, extras, discounts, fgts, date}}, profile}
// profile = cópia do perfil da calculadora (prefs.workProfile, com updatedAt): sincroniza com a conta; hydrateSalaryProfile() traz
// a cópia mais nova de volta para as preferências deste aparelho
// rule: {type: 'day', day} | {type: 'workday', n, saturday}   (sábado conta como dia útil: Súmula 381 do TST; domingo nunca)
nthWorkday(ano, mês0a11, n, sábado) -> dia do mês
payDate(rule, 'AAAA-MM') -> 'AAAA-MM-DD'      // dia fixo cai no último dia do mês curto
ruleLabel(rule) -> 'no 5º dia útil' | 'todo dia 15'
stepFor(plan, key) / amountFor(plan, key, fallback)   // o último passo cujo "a partir de" já chegou (reajustes)
withStep(plan, key, gross, net) -> plan   // novo passo só se bruto ou líquido fixo mudaram
raises(plan) -> [{from, before, after, pct, net}]     // só quando o BRUTO muda
evolution(plan) -> [{key, gross, net, extras, netChange, grossChange, raise}]
```
Tela (`js/ui/salary-plan.js`): cartão no Início (`#salaryCard`: convida a prever, pergunta “já caiu?” ou mostra o próximo),
popup “Meu salário” (regra, recalcular, evolução, parar de prever) e a confirmação mensal, que abre a calculadora com os
valores guardados (`openSalaryCalculator({confirm: true})`) para acrescentar sobreaviso, extras e descontos do mês e
registra o ganho com o líquido do mês. Ao abrir o app (`askSalaryIfDue`) pergunta uma vez por dia (`salaryAskedOn`); “Recebi”
em Previstas leva ao mesmo popup. Mudança do salário/líquido vale do mês atual (ou do próximo, se o atual já foi recebido).
O simulador usa `savedSalary().fixedNet` como salário de costume enquanto não há 2 meses de salário lançado.

A tela (`js/ui/salary-calc.js`) mostra de início só o essencial (regime e salário bruto, com o líquido logo abaixo em `#scHeadline`);
jornada e dependentes, ganhos, descontos, horas extras e 13º/férias ficam em partes recolhidas (`.sc-sec`) com o resumo no título,
que abrem sozinhas quando já há conteúdo guardado e, na confirmação mensal, as que variam. A tela abre de “Previstas”, do simulador (ganho) e do formulário de ganho, e guarda o jeito de
trabalhar, o salário bruto, os descontos e os ganhos nas preferências (`workProfile`, gravado a cada alteração, mesmo se
a calculadora for só fechada), para já virem preenchidos no mês seguinte (menos os dias de uso do vale-transporte). “Usar o líquido fixo” preenche `fixedNet`; “Usar o líquido
deste mês” preenche `net` uma vez só (e desmarca “Repete todo mês” em Previstas).
