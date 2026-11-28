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
## Grana (mascote) e novidades
`js/domain/mascot.js`: `ask(texto, {member})` → `{kind: 'answer'|'suggest'|'small'|'none', id, text, go, chips}`. Entende o SENTIDO da pergunta, no aparelho
(nada é enviado): normaliza e reduz as palavras à raiz, agrupa palavras de mesmo sentido em conceitos (despesa/compra/paguei → GASTO),
compara com cada assunto da base `KB` por similaridade (TF-IDF + cosseno), tolera erro de digitação e, se não tem segurança, sugere assuntos
em vez de chutar. Para ensinar algo novo ao Grana, acrescente (ou edite) um assunto em `KB` com várias formas de perguntar (`q`) e as
respostas `visitor` (sem conta) e `member` (com conta, com o botão `go`); `tests/unit/mascot.test.js` tem 50+ perguntas de exemplo.
`js/ui/mascot.js` (sempre carregado: desenho SVG com humores idle/happy/think/wave, animações, dicas do Início, cartão de novidades) e
`js/ui/mascot-chat.js` (a conversa, sob demanda). Página inicial: `#meetGrana` (o Grana grande) e `#landingNews`; Início: `#newsCard`. **O Grana do cantinho** (`#granaCorner`, em toda tela): pequeno, animado, solta uma dica por tela
(`TIPS_BY_TAB`) a cada ~45–75 s, abre a conversa ao toque e tem “×” para descansar (`prefs.cornerOff`; Perfil → Preferências chama de volta); na página
inicial só aparece quando o Grana grande sai da tela; some com pop-up, tutorial ou login abertos. `syncCorner()` (chamado por `showTab`, ao entrar e ao sair).
localStorage `granaleve_grana = 'off'` o esconde (os testes ligam o desligado por padrão em `tests/e2e/lib.js`).
`js/domain/changelog.js`: `CHANGELOG` (novidades, a mais nova no TOPO, id = data). **Ao entregar algo que a pessoa vai notar, acrescente uma
entrada nova no topo**: ela aparece numa janela na primeira abertura depois da atualização (`js/ui/whats-new.js`, uma vez; conta nova e
vazia não vê), no cartão do Início (até fechar) e na página inicial. Em Perfil dá para rever.

## Avisos no celular (Web Push)
`js/domain/reminders.js`: `buildReminders({today, horizon, kinds: {salary, invoice, bill}, forecasts, cards, transactions, bills, paidOk})` →
`[{key, kind, date, hour, title, body, url}]` (salário no dia previsto; fatura e conta fixa um dia antes, só se ainda há o que pagar;
textos sem valores; `safeAppUrl` só aceita `./#/rota`). `js/ui/push.js`: `enablePush`, `disablePush(quiet, keepPref)`, `syncReminders`,
`maybeSyncPush` (ao abrir o app e ao voltar a ele), cartão em Perfil. Store (supabase): `pushSaveSubscription(sub)`,
`pushRemoveSubscription(endpoint)`, `pushSyncReminders(lista)`. Banco: `push_subscriptions` (gravação só por `save_push_subscription`) e
`push_reminders` (RLS própria, no máximo 200 pendentes, até 45 dias). Envio: `supabase/functions/send-push`. Tudo em `docs/avisos-push.md`.

## Partes carregadas sob demanda (`withPart`, em `js/ui/shell.js`)
`withPart(nome, (módulo) => ...)` baixa uma parte pesada na primeira vez que ela é usada (import() dinâmico, uma vez só por parte) e
avisa se não foi possível carregar. Partes: `admin` (aba Administração), `simulator` (guia Simular), `statement` (Importar extrato) e
`salary` (calculadora, Meu salário, 13º e férias) e `mascotChat` (a conversa com o Grana). A parte do salário só é pedida se `hasSalaryData()` (perfil calculado ou previsão de
salário) ou quando a pessoa toca num botão dela. Regra para novas partes: nenhum módulo carregado de cara pode importar a parte de forma
estática (senão o build a traz de volta para o arquivo principal); use `withPart`. O build (`tools/build.js`, esbuild `splitting`) gera
os chunks, pede o código compartilhado junto com o principal (`modulepreload`) e lista todos no service worker (offline).

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

## Mais de um emprego (`js/domain/jobs.js`)
`prefs.workJobs = {list: [{id, name, profile}], active}`; quem só tinha o perfil único (`prefs.workProfile`) vira o “Emprego principal” (`migrateJobs`).
`js/ui/salary-calc.js`: o perfil ativo é o que a calculadora edita (`getWorkProfile(jobId?)`, `setWorkProfile(p, jobId?, nome?)`, `useJob`, `createJob`);
`savedSalary()` devolve o TOTAL dos empregos (o simulador e o convite do Início usam) e `activeSalary()` só o do ativo. Trocar/adicionar/remover emprego fecha
e reabre a calculadora (`{jobAction}`); cada emprego é calculado à parte (INSS tem teto somando tudo e o IR se acerta na declaração: estimativa).
Cada emprego pode ter a sua previsão de salário: `forecast.salary.jobId` (as antigas, sem jobId, são do primeiro) e `jobName`; `salaryForecasts()`,
`salaryForecast(jobId)`, `confirmSalaryById(id)`, o cartão do Início lista uma linha por previsão e os lembretes (push) levam o nome do emprego.

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

## Gasto para outra pessoa / dividir no popup do + (`js/ui/tx-others.js`)
- No celular (≤ 620 px) o formulário da aba fica escondido: o único formulário é o popup do **+**. Por isso o popup de **lançamento novo** (não a edição) tem “Pagou por alguém ou vai dividir?”, com os mesmos campos do formulário grande, mas ids com prefixo `m` (`mForOther`, `mSplit`, `mSplitRows`…) para os dois não se misturarem.
- A gravação é uma só para os dois: `attachOthers` em `js/ui/tx-list.js` (cria os “A receber” ligados e marca cada parcela com `forOther` ou `split`). Mudou uma regra de terceiros? Mude lá, não nos formulários.
- Teste: `tests/e2e/77-terceiros-celular.e2e.js` (375 px).

## 13º à parte, “já recebi este mês” e celular sem teclado automático
- **13º** (`registerThirteenth`, `js/ui/salary-plan.js`): botão “Registrar o 13º salário” em Meu salário (e no cartão do Início de outubro a dezembro). Abre a calculadora já na parte do 13º, sem “salvar o salário”; a pessoa toca na parcela, confirma valor, dia e conta e vira um ganho “13º salário · 1ª/2ª parcela” na categoria **Outros** (de propósito: a categoria Salário alimenta o “salário de costume” do simulador). Não depende da previsão do salário nem do “já caiu?”.
- **Já recebi este mês**: a caixa “O salário deste mês eu já recebi” em Meu salário (e “Pular este mês” no cartão) marca `forecast.received[mês]` sem lançar nada nos ganhos: não pergunta, não conta no mês e a previsão segue do mês seguinte.
- **Teclado no celular**: `autoFocus` / `touchLayout` em `js/ui/dom.js`. Em tela estreita ou de toque (`max-width: 620px` ou `pointer: coarse`) nada recebe foco sozinho; o popup foca a própria janela. Só foque campo por conta própria com `autoFocus`.
- **Entrar/criar conta** é uma folha no celular e fecha arrastando para baixo (`enableSwipeClose`, `js/ui/modal.js`, agora exportada).
- **“É salário? Calcular o líquido”** também está no popup do + (ganho): `salaryIntoPopup` fecha o popup, abre a calculadora e reabre o lançamento com o valor.
- Testes: `tests/e2e/78-decimo-terceiro-pular.e2e.js` e `79-celular-teclado-e-arrastar.e2e.js`.

## Configurações que acompanham a conta e avisos programáveis
- **Sincronização de preferências** (`js/ui/synced-prefs.js`, regra pura em `js/domain/synced-prefs.js`): só `workJobs` (os empregos da calculadora do salário) e `reminderRules` (regras dos avisos) viajam com a conta, num documento `prefs` da coleção `settings`
  (`{values, at}`; vale o mais recente por item, nada é apagado). Chega no `loadAllData` (`pullSyncedPrefs`) e sobe 0,8 s depois de cada mudança (`markSynced`). Em modo local ou sem a migração `20261124…`, continua só no aparelho. Para sincronizar outra preferência, acrescente o nome em `SYNCED_PREFS` e chame `markSynced` ao gravá-la.
- **13º por valor**: `opts.thirdValue` em `thirteenth()` (`js/domain/salary.js`): o valor bruto informado vale no lugar dos meses e da média de extras; INSS e imposto saem dele. Campo “Já sabe o valor do 13º?” na calculadora (não é guardado no perfil, como os meses e a média).
- **Avisos programáveis** (`js/domain/reminders.js`, tela em `js/ui/push.js`): `normalizeRules` → `{kinds, lead (0 a 7 dias por tipo), hour, custom (até 10)}`. Aviso próprio: `type` (`expense` lançar gastos, `statement` importar extrato, `custom` texto livre), `repeat` (`monthly` dia 1–31, `weekly` dia da semana, `once` data) e `hour`. Textos nunca levam valores em reais; o título do aviso `custom` é da pessoa (vai ao servidor, a tela avisa). Tipos aceitos no banco: `salary, invoice, bill, custom, statement`.
- Testes: `tests/unit/reminders.test.js`, `synced-prefs.test.js`, `salario.test.js`, `tests/e2e/80-avisos-programaveis-e-13-valor.e2e.js` e `supabase/tests/rls.test.sql`.

## Central de avisos (o sininho, `js/ui/notices.js`)
- O sino no topo abre “Avisos”: **Chegaram** (linhas de `push_reminders` com `sent_at`, lidas por `Store.pushListSent`; o servidor as guarda por 30 dias; `sentHistory` descarta as vencidas há mais de 24 h, que a função só dá como tratadas) e **Próximos avisos** (`upcomingReminders`, as mesmas contas que agendam no servidor, para os próximos 14 dias; vale mesmo sem os avisos ligados neste aparelho).
- Sem conta online não há histórico (só os próximos). O número no sino conta os enviados depois de `prefs.noticesSeenAt` (por aparelho). Tocar num aviso leva à tela dele (`safeAppUrl`).
- **Novidades do app** (`CHANGELOG` de `js/domain/changelog.js`) também aparecem na central, as 5 últimas, com a nova aberta e o botão “Ver” (leva à tela). O número do sino soma avisos novos e novidades ainda não vistas (`prefs.noticesNewsSeen`; quem já viu o popup de novidades, `whatsNewSeen`, não é avisado de novo; conta nova e vazia não tem o que “atualizar”). Toda entrega visível acrescenta uma entrada no changelog (regra do CLAUDE.md), então ela vira aviso no sino sozinha.
- Teste: `tests/e2e/81-central-de-avisos.e2e.js`; contas puras em `tests/unit/reminders.test.js` (`whenLabel`, `sentHistory`, `unseenCount`).

## Dia em que o vale cai (`voucher.creditDay`)
- Campo opcional (1 a 31) no cadastro e na edição do vale-alimentação/refeição (Contas e cartões). `creditDay`, `creditDate` (mês curto cai no último dia) e `nextCredit` ficam em `js/domain/vouchers.js`. **Muda o saldo** (ver abaixo); vale sem o dia e sem marcação segue como antes (crédito desde o dia 1).
- Aparece no cartão do vale (“Cai todo dia 5 · próximo em 05/12/2026 (em 18 dias)”), no calendário de Ganhos e gastos (tipo `vale`, ponto dourado, conta como entrada no filtro) e nos avisos: tipo `voucher` (liga/desliga e antecedência em Perfil, no dia por padrão). No banco o aviso do vale vai como tipo `custom` (`reminderRows` converte), então não precisa de migração nova.
- Teste: `tests/unit/vale-dia.test.js` e `tests/e2e/82-vale-dia.e2e.js`.

## Tutorial e configuração rápida (primeiro uso)
- **Tutorial** (`js/ui/tutorial.js`, 10 passos): bem-vindo, mês de relance, lançar (inclui terceiros e divisão), bancos e cartões, salário, importar extrato, planejar e guardar (com o menu), avisos e novidades (sino), ajuda e o Grana, tudo pronto. Ao fim, “Configurar agora” abre a configuração rápida. Toda novidade importante do app deve entrar aqui só se for essencial para começar; o resto vai para o changelog.
- **Configuração rápida** (`js/ui/setup.js`, parte sob demanda `withPart('setup')`): passo 1 bancos e cartões (vários; `addBank` em `js/ui/accounts-tab.js` cria conta com saldo e/ou cartão com limite, fechamento e vencimento, ligados), passo 2 salário (calculadora e previsão, ou “Não tenho salário fixo” = `prefs.noSalary`), passo 3 atalhos (vale, contas fixas, limites, metas, importar extrato, avisos). Todos os passos são pulavéis; `prefs.setupDone` marca que foi aberta. Abre depois do tutorial, em Perfil (“Configurar o essencial”) e pelos Primeiros passos (“Configuração guiada”).
- **Primeiros passos** (Início): 4 passos (bancos e cartões, salário ou “Não tenho”, primeiro lançamento, limite por categoria).
- Testes: `tests/e2e/53-tutorial.e2e.js`, `54-menos-informacao.e2e.js`, `83-configuracao-rapida.e2e.js`.

## Benefícios que caem separado do salário (`bonus.separate`, `bonus.day`)
- Na calculadora, cada ganho extra tem “Cai separado do salário” e “no dia” (1 a 31; mês curto cai no último). Em `netSalary`, o separado sai do `net`/`fixedNet` (o líquido do **salário**) e aparece em `separate`, `separateTotal` e `totalNet`; **os descontos são calculados sobre tudo**, como antes (só muda onde o valor aparece).
- Ao salvar “Meu salário” (e ao confirmar um mês) `syncBenefits(jobId)` (`js/ui/salary-plan.js`) cria/atualiza/apaga uma previsão por benefício (`forecast.benefit = {jobId, type, label, day}`, categoria **Outros**, recorrente). Parar de prever o salário apaga as previsões dos benefícios; ganhos já registrados ficam. “Já recebi o deste mês” marca também os benefícios.
- No Início, o cartão do salário lista os benefícios do mês com “Recebi” (o mesmo de “Previstas”); dá para registrá-los antes do salário, sem contar duas vezes. Os avisos do salário também valem para eles (tipo `salary`, sem valores).
- Usar só a calculadora (sem criar a previsão) não cria previsões de benefícios.
- Teste: `tests/unit/salario.test.js`, `reminders.test.js`, `tests/e2e/84-beneficios-separados.e2e.js`.

## “Já caiu” à mão (salário e benefícios)
- O cartão do salário (cada previsão) e “Meu salário” têm **Já caiu** / **Registrar que caiu** mesmo antes da data: registra a primeira vez ainda não recebida a partir do mês atual (`nextPending`, olha até 3 meses). Se a pendente é de outro mês, o botão diz qual: “Já caiu (dezembro)”; no cartão do Início o do mês que vem só aparece a partir de 10 dias antes da data (`EARLY_DAYS`, para ninguém registrar por engano), e em “Meu salário” está sempre disponível. O dia em que caiu vem preenchido com hoje (se a data prevista não chegou).
- **Pergunta automática** (`salary.ask`, padrão ligada): a caixa “Perguntar já caiu? sozinho” em “Meu salário” desliga o popup ao abrir o app (`salaryDue(true)`); o cartão e o botão continuam. Vale por previsão e sincroniza com a conta.
- Os benefícios separados têm “Recebi” (e “Recebi (dezembro)” depois que o do mês foi registrado). O app continua perguntando sozinho quando a data chega.
- Teste: `tests/e2e/85-caiu-manual.e2e.js`.

## Cartão do salário compacto (Início)
- Uma linha por salário (quando cai, valor, “Já caiu”), depois a lista **Ganhos além do salário** (`<details class="sal-details">`, começa fechada, resumo “N itens · M para registrar”, aberta/fechada guardada em `prefs.salaryListOpen`) com “Recebi antes” e o que cai separado, e uma linha de atalhos. Não aumente a altura fechada (teste 86: menos de 170 px no computador).

## Ganho que vem junto do salário, recebido antes (“Recebi antes”)
- No cartão do salário e em “Meu salário”, cada ganho extra **não separado** tem **Recebi antes** (para o mês ainda pendente). Registra um ganho em **Outros** e guarda em `forecast.salary.paid[mês] = [{type, label, amount, varies, received, txId, date}]`.
- O “já caiu?” daquele mês recebe `paid` na calculadora: `netSalary` o tira só do líquido do **mês** (`paidBefore`, nunca mais que o próprio ganho; o fixo não muda). A previsão do mês também fica menor, mas só pelos ganhos fixos (`forecasts.js`).
- Se a pessoa apagar o lançamento, o ganho volta a somar, tanto na confirmação (`paidOf`) quanto na previsão (`forecastOccurrences` de `js/ui/state.js` ignora os “recebidos antes” sem lançamento).
- A confirmação do salário abre com um aviso em destaque (`.sc-paid-notice`) listando o que já foi recebido, o valor em destaque diz “Líquido a registrar”, o cartão avisa “já recebido antes: não entra de novo” e a mensagem final repete.
- Ganhos marcados “cai separado” continuam com a própria previsão e “Recebi”.
- Teste: `tests/unit/salario.test.js`, `salary-plan.test.js`, `tests/e2e/86-ganho-recebido-antes.e2e.js`.

## Saldo do vale e “Já caiu” / “Ainda não caiu”
- Com dia informado (ou alguma marcação, `tracksCredit`), o crédito de cada mês só conta **depois que cai**: pelo dia, ou pela marcação `voucher.credited[mês]` (data: a pessoa disse que caiu nesse dia; `false`: disse que ainda não caiu). `creditedOn` e `voucherBalance` (`js/domain/vouchers.js`).
- Acumulando: soma um crédito por mês que caiu (com saldo informado, só o que caiu depois dele). Sem acumular: vale o último crédito que caiu, menos o gasto desde então (antes do próximo, ainda é o anterior).
- Cartão do vale: “Já caiu” (confirma o dia, até hoje), “Ainda não caiu” e, a 10 dias do mês que vem, “Caiu antes”. Vale marcado como caído não gera aviso; o calendário usa o dia marcado.
- Teste: `tests/unit/vale-dia.test.js`, `tests/e2e/87-vale-caiu.e2e.js`.
