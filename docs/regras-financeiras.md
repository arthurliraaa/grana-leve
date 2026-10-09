# Regras financeiras do Grana Leve

Este documento define como cada número do app é calculado. As regras ficam em `js/domain/`
(funções puras, sem tela) e são testadas em `tests/unit/`. Quando uma regra mudar, mude
aqui, no código e no teste juntos.

## Dinheiro

- Valores ficam guardados em reais com no máximo 2 casas: tudo passa por `money()`, que
  arredonda para centavos.
- Somas são feitas em **centavos inteiros** (`sumMoney`), para não acumular erro de ponto
  flutuante (em reais, 0,1 + 0,2 daria 0,30000000000000004).
- Ao dividir um valor em partes (parcelas), os centavos que sobram ficam na **1ª parte**:
  R$ 100,00 em 3x = 33,34 + 33,33 + 33,33 (`splitAmount`).

## Lançamentos: realizado e agendado

Um lançamento é um ganho ou um gasto com valor, data e categoria.

- **Realizado**: data até hoje.
- **Agendado**: data depois de hoje (por exemplo, uma parcela que ainda vai cair).
- No painel, “Ganhos do mês” e “Gastos do mês” mostram só o realizado. O agendado do mês
  aparece embaixo (“Agendado: + R$ …”) e entra na previsão do fim do mês.
- Gráficos, comparação entre meses e relatório em PDF usam o mês inteiro (realizado +
  agendado), porque descrevem o mês como um todo.

## Previsões de entrada

- Uma previsão é um valor que você espera receber em uma data. Pode repetir todo mês.
- Em mês mais curto, a previsão do dia 31 cai no último dia do mês.
- “Recebi” registra um ganho e marca a previsão daquele mês como recebida.
- **Esperado** no painel = previsões do mês ainda não recebidas + ganhos agendados no mês.
- **Previsto no fim do mês** = saldo realizado + esperado − gastos agendados.

## Cartão de crédito

- **A compra conta como gasto na data da compra** (no mês em que foi feita), não no mês em
  que a fatura é paga.
- A fatura é identificada pelo **mês em que fecha**. Compra feita até o dia de fechamento
  entra na fatura daquele mês; depois do fechamento, na fatura seguinte.
- O vencimento cai no mesmo mês do fechamento quando o dia de vencimento é maior que o de
  fechamento; senão, no mês seguinte. Em mês mais curto, usa o último dia.
- Situação da fatura: **aberta** (ainda recebe compras), **fechada** (fechou, ainda não
  venceu), **vencida** (passou do vencimento sem ser marcada como paga) ou **paga**.
- **Limite usado** = soma das faturas não pagas, incluindo parcelas futuras (que já ocupam
  o limite).
- **Faturas a pagar** (painel) = faturas fechadas ou vencidas e não pagas. A fatura aberta
  aparece embaixo, separada, porque o valor ainda pode mudar.
- **Pagar a fatura não é um gasto novo**: as compras já contaram. Ao marcar como paga, se
  uma conta for escolhida (pode ser de outro banco), o valor sai do saldo dessa conta.
  Desmarcar devolve o saldo.

## Compras parceladas

- Só compras no cartão são parceladas (até 24x). Cada parcela é um lançamento, uma por
  mês, na mesma data da compra (ou no último dia do mês, se o dia não existir).
- Parcelas com data até hoje contam como pagas; as futuras somam em “Dívida restante”.
- **Adiantar** apaga as últimas parcelas e registra um gasto com o valor pago (com ou sem
  desconto) na fatura atual.
- Editar uma parcela muda categoria e descrição de todas; valor, data e número de parcelas
  só mudam excluindo e lançando de novo.

## Contas bancárias e transferências

- A conta guarda o **saldo informado** e o momento em que ele foi informado (data e hora).
- **Saldo de hoje** = saldo informado + tudo que aconteceu depois dele e até hoje:
  ganhos ligados à conta, gastos “Pix ou débito” da conta, transferências e faturas pagas
  com ela.
- Lançamentos com data anterior ao saldo informado não mexem nele (o saldo do banco já os
  inclui). Lançamentos com data futura só contam quando a data chega.
- **Ajustar o saldo** (Editar conta) passa a contar a partir de agora.
- **Transferência** muda o saldo das duas contas e não é ganho nem gasto.
- **Disponível nas contas** (painel) = soma dos saldos de hoje.

## Planejar gastos

- Cada mês guarda o próprio planejamento por categoria. Um mês sem planejamento próprio
  usa o do último mês planejado antes dele.
- Mudar o mês atual não altera os anteriores, que ficam travados. O próximo mês pode ser
  planejado e começa com os valores do atual.
- Aviso: 80% do planejado (“quase no limite”) e acima de 100% (“estourou”).

## A receber

- Pode ser à vista ou parcelado (informando o total ou o valor de cada parcela).
- Parcelado: as parcelas recebidas contam pelo total que já entrou (em centavos); um valor
  parcial não pula a parcela. A próxima vence um mês depois da anterior, a partir da 1ª.
- Atrasado = próximo vencimento antes de hoje e ainda falta receber.

## Vale-alimentação / refeição

- **Com acúmulo**: saldo informado (ou o 1º crédito) + um crédito por mês − gastos com o
  vale desde então.
- **Sem acúmulo**: crédito do mês − gastos com o vale no mês.

## Lançamento por mensagem

- O leitor (`js/domain/parser.js`) é baseado em regras e palavras-chave, não é IA.
- Nada é salvo direto: cada item vira um rascunho editável. Campos supostos ficam
  marcados (`recognized`): categoria não reconhecida, data não dita (“suposto: hoje”),
  forma de pagamento não dita e tipo quando a frase não tem verbo.
- Antes de gravar, cada lançamento passa pela validação central (`js/domain/validate.js`).
