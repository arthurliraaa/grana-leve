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
- Como nos bancos, a fatura leva o **nome do mês em que vence** (fecha 31/10 e vence 07/11 =
  fatura de novembro). Internamente ela é guardada pelo mês em que fecha.
- Compra feita **antes** do dia de fechamento entra na fatura que está aberta; compra feita
  **no dia do fechamento ou depois** já vai para a fatura seguinte. Em mês mais curto, o
  fechamento cai no último dia (fecha 31 → fecha 30/09).
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

## Pago para outra pessoa e devoluções

- Gasto marcado como "paguei por outra pessoa e ela vai me devolver" fica ligado ao
  "A receber" da pessoa. O dinheiro sai da conta ou do cartão normalmente, mas o gasto
  **não entra** em "Gastos do mês", no planejamento nem nos gráficos de gastos. Aparece à
  parte ("pagos por outras pessoas") e no filtro de mesmo nome em "Ganhos e gastos".
- Ao registrar um recebimento, a pessoa escolhe **para onde foi o dinheiro** (uma conta ou
  nenhuma) e **como contar**: *devolução* (empréstimo ou gasto pago pela pessoa: o saldo da
  conta sobe, mas não é ganho) ou *ganho do mês* (dinheiro novo). Assim o mesmo valor não
  conta duas vezes.
- "Não vai devolver": o "A receber" fecha com o que faltava, e (opcional) esse valor vira um
  gasto seu na data de hoje, sem mexer em conta nem cartão (o dinheiro já tinha saído).
- Compras parceladas no cartão aparecem só em "Contas e cartões". "Eu devo" e "Dívida
  restante" mostram apenas as dívidas cadastradas, com as parcelas do cartão citadas à parte.

## Compras parceladas: em andamento, valor por parcela e edição

- No cadastro, o valor digitado pode ser **o total da compra** ou **o valor de cada parcela**
  (o total vira parcela × número de parcelas).
- **Data da compra decide as parcelas já pagas** (não há pergunta de "parcela atual"): a parcela
  i entra na i-ésima fatura a partir da fatura da compra. As parcelas de faturas que já venceram
  (vencimento antes de hoje) contam como pagas antes do cadastro e não viram lançamentos; as
  demais são lançadas, cada uma na data da compra + (i − 1) meses. A data da compra fica guardada
  (`purchaseDate`). Se todas já venceram, não há nada a lançar.
- O formulário mostra em qual fatura a compra (ou a próxima parcela) entra, com fechamento e
  vencimento.
- O valor de **uma parcela** pode ser editado sozinho (ex.: juros); o total da compra acompanha.
- **Editar a compra inteira** refaz as parcelas com valores iguais (total, número de parcelas,
  parcela atual, cartão, data, categoria e descrição). Compras com parcelas adiantadas não podem
  ser refeitas por aqui.

## Pagamentos de dívidas e recebimentos

- "Registrar pagamento" aceita **várias parcelas de uma vez**, pergunta de qual conta saiu e se
  conta como gasto do mês. Se não contar, o lançamento só mexe no saldo da conta.
- Cada pagamento (e cada recebimento em "Me devem") fica num **histórico**. "Desfazer" devolve o
  valor à dívida (ou ao que falta receber) e remove o lançamento ligado, mas o registro continua
  no histórico, marcado como desfeito.

## Contas fixas

- Cada conta fixa tem valor previsto, dia de vencimento, frequência (todo mês, a cada 2, 3 ou
  6 meses, ou uma vez por ano), categoria, forma de pagamento e mês de início.
- Os vencimentos de cada mês são calculados (não ficam gravados). Em mês mais curto, o
  vencimento cai no último dia.
- **Lançamento automático:** no dia de cada conta, o gasto entra sozinho em "Ganhos e gastos"
  (na conta ou no cartão escolhido), ao abrir o app. Vale desde o cadastro da conta fixa; um dia
  que já tinha passado quando a conta foi cadastrada aparece com "Lançar" (pode já ter sido
  lançado à mão). "Lançar agora" adianta um vencimento futuro.
- **Mudar valor** de um mês abre o próprio lançamento. **Desfazer** remove o gasto e marca o mês
  como desfeito: ele não é lançado de novo sozinho.
- Mudar o valor vale **a partir de** um mês; os meses anteriores mantêm o valor antigo.
  Ao pagar com outro valor, dá para manter o novo valor nos próximos meses.
- **Encerrar** para os vencimentos depois do mês atual e mantém o histórico.
- No Início, as contas fixas não pagas (do mês e atrasadas do mês anterior) aparecem em
  "Próximo compromisso", e o "Previsto no fim do mês" já desconta as que faltam pagar.

## Estornos

- O estorno é um **crédito** (lançamento com valor negativo) ligado à compra original
  (`reversal.of`). A compra não é apagada: fica marcada como "Estornado", e o estorno aparece
  como "+" na lista.
- Pix/débito/vale: o valor volta para onde saiu. Cartão: a pessoa escolhe **em qual fatura** o
  crédito aparece (da fatura da compra até a próxima à aberta). Fatura aberta: abate nela;
  fatura fechada: normalmente na próxima. O crédito libera o limite do cartão.
- Compra parcelada: o estorno vale para as parcelas já cobradas e, se marcado, para as
  futuras, cada uma na própria data (mesma fatura da parcela).
- O estorno abate os gastos do mês em que entrou. Estorno parcial é permitido; não dá para
  estornar mais que o valor da compra. Estornos não são editados: exclua e registre de novo.

## Compra dividida com outras pessoas

- No lançamento de um gasto, "Dividir com outras pessoas" registra a parte de cada pessoa em
  valor (R$) ou porcentagem; o resto é a **sua parte**. "Dividir igualmente" inclui você.
- O total da compra continua na conta/fatura e no limite do cartão. Nos seus gastos (painel,
  planejamento, gráficos) entra só a sua parte, proporcional em cada parcela.
- Cada pessoa vira um "A receber" ligado à compra, com a parte dela (parcelado como a compra,
  no mesmo cartão). O que ela devolver é devolução, não ganho.

## Bancos e cartões

- Um cadastro por banco: a conta (saldo), o cartão de crédito (limite, fechamento e vencimento)
  ou os dois. Conta e cartão continuam sendo registros separados, ligados por `card.accountId`.
- A tela mostra um bloco por banco: a conta e o(s) cartão(ões) do mesmo banco. Registros antigos
  sem vínculo são juntados pelo banco reconhecido (cor/ícone) ou pelo nome.
- A fatura é paga, por padrão, pela conta escolhida no cartão; senão, pela conta ligada a ele;
  senão, pela conta do mesmo banco.

## Compra parcelada antiga (inclusive para outra pessoa)

- Todas as parcelas são criadas, cada uma no seu mês (a 1ª na data da compra), para a compra ficar
  no histórico. As que caíram em faturas já vencidas antes do cadastro ficam marcadas como pagas
  (`installment.settled`): aparecem na fatura delas (histórico), mas não em "faturas a pagar" nem
  no limite usado.
- Compra para outra pessoa: o "A receber" guarda o total original e o número de parcelas. As
  parcelas já vencidas contam como devolvidas ou ainda devidas, conforme a escolha no cadastro
  (`priorSettled`), e "Me devem" avisa isso.
- Em "Ganhos e gastos", cada compra no cartão mostra a parcela, a fatura (curta: nov/2026) e a
  situação: atual, futura, fechada a pagar, vencida, paga ou paga antes do cadastro. A lista da
  fatura no cartão mostra as mesmas compras (não somam de novo).

## Contas fixas: dia conforme a forma de pagamento

- Pix, débito ou dinheiro: dia do pagamento. Cartão: dia da compra no cartão; a fatura em que ela
  entra segue a regra do cartão (no dia do fechamento ou depois, vai para a seguinte).

## Mês do gasto no cartão (competência pela fatura)

- Cada compra no cartão (ou parcela) conta como gasto no **mês em que vence a fatura dela**:
  em "Gastos do mês", no planejamento, nos gráficos e na lista de "Ganhos e gastos". Ex.: compra
  de 04/10 num cartão que fecha dia 31 e vence dia 7 entra na fatura de novembro e conta em novembro
  (1/12 em novembro, 2/12 em dezembro…).
- No mês da compra, ela aparece como aviso ("Compras deste mês que entram em faturas seguintes"),
  sem somar. No calendário, a parcela fica no dia do vencimento da fatura.
- O saldo das contas e o quadro "crédito × débito" continuam pela data (quando o dinheiro saiu ou a
  compra foi feita). Pix, débito, dinheiro e vale continuam pela data.
