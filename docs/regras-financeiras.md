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
- **Pagar só uma parte da fatura** (`invoicePayments[key].mode`):
  - **o resto fica em aberto** (rotativo): o que faltou vai inteiro para a fatura seguinte;
  - **o resto é parcelado**: o que faltou é dividido em N parcelas nas N faturas seguintes,
    com o valor de parcela que o banco ofereceu.
  - Só o valor pago agora sai da conta. A fatura fica como **paga em parte**; o saldo que passa
    adiante aparece nas faturas seguintes ("Saldo em aberto da fatura de …" / "Parcelamento da
    fatura de … (i/N)") e ocupa o limite até ser pago.
  - Esse saldo **não é gasto novo** (as compras já contaram). Só os **juros** contam: os encargos
    informados no rotativo, ou no parcelamento N × parcela − o que faltou, divididos nas mesmas
    faturas, como gastos no cartão ("Juros do …", categoria Outros).
  - Desfazer o pagamento tira o saldo das faturas seguintes e apaga os juros lançados.
- **Fatura paga que ainda recebe compras**: ao marcar como paga, o app guarda o total que ela tinha
  (`invoicePaidDue[key] = {due, at}`). Se entrar compra nova depois (a fatura ainda estava aberta), a
  fatura volta a ter o que pagar: só o que passou desse total, abatido do que for pago depois. Faturas
  pagas antes desse registro continuam como estavam.
- **Início — fim do mês**: com contas cadastradas, a previsão é *nas contas − o que falta pagar + o que
  ainda vai entrar* (se tudo está pago, é o que há nas contas). “Ganhos − gastos do mês” aparece à parte.
- **Contas e cartões — mês que vem**: mostra as faturas que vencem no mês seguinte (e a parte sua) e
  quanto sobra se forem pagas com o que sobra hoje.
- **Relatório do cartão** tem o filtro **De quem**: tudo, só a minha parte ou só de outras pessoas
  (pago por alguém que vai devolver + a parte dos outros nas divididas, as mesmas regras de
  `myShare`/`othersShare`). Em "tudo", cada fatura aparece dividida nas duas partes, e há a
  tabela "Quanto é de cada pessoa" (na dividida, a parte da pessoa proporcional ao valor da parcela).

- **Relatórios e PDFs**: no relatório do cartão, cada categoria abre e mostra as compras dela, dizendo se
  a compra é sua, de uma pessoa ou dividida; o PDF traz o mesmo detalhe. O PDF da fatura tem as colunas
  *Minha parte*, *Outras pessoas* e *Total*. Em “Contas e cartões”, “PDF das faturas do mês” (ou do mês
  que vem) junta as faturas de todos os cartões que vencem no mês, com o resumo somando minha parte e a de
  outras pessoas e o que sobra nas contas.
- **Gráficos do Início**: tocar numa categoria (rosca, pizza, blocos, ranking ou tabela) abre os gastos
  dela no mês, na mesma visão do gráfico (“Tudo” ou só a sua parte). Contas fixas que ainda vão cair
  entram no gráfico e aparecem na lista como “conta fixa prevista”.
- **Ganhos e gastos**: o aviso “Compras deste mês que entram em faturas seguintes” abre e fecha (a
  escolha fica salva).

- **Planejar gastos — avisos**: uma categoria a partir de **90%** do limite (“perto do limite”) ou acima
  de 100% gera uma mensagem na hora e uma faixa de alertas no topo, em qualquer tela. “Dispensar” esconde o
  aviso da categoria no mês; ele volta se passar do limite. A aba traz um aviso de primeira vez e o gráfico
  “Evolução do mês” (gasto acumulado × ritmo ideal do limite, com a projeção do fim do mês).
- **Ajuste de saldo da conta**: corrigir o saldo de uma conta não apaga o histórico nem conta como ganho ou
  gasto: a diferença vira um lançamento “Ajuste de saldo” (`adjustments` da conta), que pode ser desfeito.
- **Me devem — registro automático**: parcelas de compras ligadas que já passaram pelas faturas são
  registradas como devolvidas sozinhas (sem perguntar), com aviso e “Desfazer”; depois de desfeito, o alerta
  não volta. Há também “Registrar tudo” por pessoa e “Registrar todos os recebimentos” (valor que vence
  agora de cada um), com “Desfazer”.

- **Simular (guia em Ganhos e gastos)**: nada é salvo ao simular. O saldo parte do que há nas contas hoje e
  segue mês a mês: *já assumido* (faturas suas que vencem no mês, contas fixas pendentes, parcela das dívidas)
  + *ganhos previstos* (previsões; e, se a pessoa teve salário em pelo menos 2 dos últimos 3 meses, o salário
  de costume nos meses sem salário lançado ou previsto) − o que a simulação coloca no mês. Compra no cartão
  pesa no mês em que **vence** a fatura de cada parcela (fechamento e vencimento do cartão). “Registrar de
  verdade” cria o gasto (conta ou parcelas), a dívida, a conta fixa, o ganho ou a previsão mensal.
- **Dinheiro de uma meta**: pagar com o dinheiro guardado numa meta tira o valor dela (movimentação
  `withdraw`) e, se a pessoa quiser, lança o gasto em Ganhos e gastos sem mexer no saldo de nenhuma conta
  (`goalId` no lançamento). Para o objetivo da meta não há aviso; para outra coisa (`purpose: 'outro'`) aparece
  um aviso de cuidado e, enquanto não for reposto com depósitos, um conselho de atenção.

- **Salário líquido (estimativa)**: ao informar um salário fixo (Previstas, simulador ou formulário de ganho), a
  calculadora estima o líquido conforme o jeito de trabalhar: CLT (INSS progressivo, imposto de renda com a
  dedução mais vantajosa entre INSS + dependentes e o simplificado, e a redução da Lei 15.270/2025), servidor (previdência em % e o mesmo imposto), MEI (DAS), autônomo (INSS e carnê-leão), PJ no Simples (%),
  estágio (sem descontos) e outro. Horas extras (CLT e servidor): 50% e 100% sobre a hora normal (salário ÷ jornada
  semanal × 5), com o sobreaviso (1/3 da hora normal por hora à disposição da empresa) e o reflexo das horas extras no descanso semanal (DSR) calculado pelos dias de trabalho e de repouso informados;
  elas entram na base do INSS e do imposto. Os ganhos além do salário (auxílio home office, ajuda de custo, bonificação, comissão…) entram por tipo: os tributáveis somam à base do INSS e do imposto, os indenizatórios só ao líquido (inclusive a bonificação paga em vales ou cartão benefício, que não tem desconto). No vale-transporte e no vale-refeição o desconto pode acompanhar os dias do mês (informa-se o que foi cobrado e em quantos dias de uso; nos meses seguintes o valor por dia é multiplicado pelos dias úteis, ajustáveis por feriados) ou ser calculado pelo benefício recebido no mês: o vale-transporte desconta até uma % do salário (6% no máximo), mas nunca mais do que o vale (passagem por dia × dias de uso); o vale-refeição desconta uma % do valor recebido. Os descontos do contracheque são escolhidos por tipo (vale-transporte,
  plano de saúde, pensão, consignado…), em R$ ou %, e cada um pode ser marcado como “varia todo mês” (o
  vale-transporte, por exemplo, costuma ser bem menos que 6%). Só o salário e os descontos que não variam são
  fixos: o “líquido fixo” é o que vira o salário fixo; horas extras, ganhos e descontos que variam (bonificação, adiantamento…) entram só no
  líquido do mês em que acontecem. O FGTS (8% da remuneração, só CLT) é depositado pela empresa: aparece
  como informação e nunca entra no líquido. As tabelas são de 2026 e precisam ser conferidas todo ano.

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
- **Cobrar** (`recvDueByMonth`): a pessoa escolhe o que vai na mensagem:
  - **do mês**: as parcelas que vencem até o fim do mês, incluindo as atrasadas e descontando o que
    já entrou da parcela atual. Numa compra no cartão, é a parcela da fatura do mês. Se nada vence
    no mês, vai a próxima parcela;
  - **total em aberto**.
  - A **chave Pix** é opcional e fica guardada neste aparelho (preferências) para as próximas
    cobranças.
- **Compartilhar** (`js/ui/share-charge.js`): gera um link (`#/cobranca/<dados>`) ou um arquivo
  `.json` com quem cobra, o valor, o que já foi pago, as parcelas, o vencimento e a chave Pix.
  - Os dados vão depois do `#`, então não passam pelo servidor.
  - Quem abre aceita, e a cobrança vira dívida em "Eu devo" (`debt.shared`).
  - Cada cobrança tem uma referência (`shareRef`): reenviar atualiza a mesma dívida, sem duplicar.
    O valor pago fica com o maior entre o enviado e o que a pessoa já registrou.
  - **Com conta online, as duas contas acompanham juntas** (tabela `shared_charges`, migração
    `20261012000000_ajuda_e_cobrancas.sql`, código em `js/ui/shared-sync.js`):
    - O link leva o id da cobrança e um segredo de 128 bits. Quem abre aceita, e a cobrança fica
      ligada à conta dela; outra conta não consegue pegar para si.
    - Quem deve registra um pagamento: vira um **aviso pendente** para quem cobra. Quem cobra
      **confirma**, e o recebimento entra em "Me devem" (pode escolher a conta), ou diz **"Não
      recebi"**.
    - Quem cobra registra um recebimento: o valor sobe no servidor. Desfazer também avisa.
    - O "já pago" de quem deve = o que quem cobra confirmou + os avisos ainda pendentes. Total,
      parcela e Pix vêm de quem cobra.
    - No login, cada lado vê numa janela as novidades do outro (aceitou, pagou, confirmou, não
      recebeu, atualizou). Os avisos pendentes também ficam no cartão até alguém decidir.
    - Excluir a cobrança (quem cobra) apaga no servidor; excluir a dívida (quem deve) sai dela.
  - Sem conta online, ou sem a migração, o link funciona como antes, sem o acompanhamento.
  - Os dados de fora são conferidos (formato, limites, datas) e mostrados sempre escapados.

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

## Ajuda, apagar dados e a pergunta ao entrar

- **Ajuda e sugestões** (Perfil, menu lateral e "Mais"):
  - Com conta online, a mensagem vai para a tabela `feedback`, aparece em Administração → Mensagens
    e, se o envio estiver configurado (pg_net + chave `brevo_api_key` no Vault), chega por e-mail em
    contato.granaleve@gmail.com, com "responder para" o e-mail de quem enviou.
  - Limite de 20 mensagens por conta a cada 24 horas.
  - Sem servidor, abre o e-mail da pessoa com a mensagem pronta.
- **Apagar dados** (Perfil): apaga tudo, ou só as partes escolhidas, e mantém a conta. Pede para
  digitar APAGAR e oferece salvar um backup antes.
- **"Teve gastos ou ganhos?"**: aparece só logo depois de um login de verdade (entrar, criar a conta
  ou o link do e-mail). Recarregar a página ou reabrir com a conta já aberta não pergunta de novo.
- O backup inclui as contas fixas.
