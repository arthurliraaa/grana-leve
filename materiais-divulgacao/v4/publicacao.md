# Divulgação do Grana Leve (versão 4: as novidades, com mais de um emprego e o Grana no cantinho)

Tudo aqui foi gravado **no app de verdade**, numa conta de demonstração fictícia (Marina Souza, modo local, sem tocar no
Supabase). O que aparece na tela (líquido do salário, soma dos empregos, 13º, férias, categorias sugeridas, respostas do
mascote, tela de carregamento, tema que se espalha) é calculado pelo próprio app; só os dados de exemplo (nomes e valores
lançados) são inventados. Os avisos no celular (Web Push) **ficaram de fora** porque ainda não estão ligados no servidor.

## Arquivos

| Arquivo | Para quê |
| --- | --- |
| `video-grana-leve-novidades.mp4` | Vídeo de ~76 s (4:5, 1080 × 1350, com legenda na tela e uma trilha instrumental simples, sem voz, em volume baixo) |
| `capa.png` | Imagem de capa/miniatura para o post |

Para refazer: `node materiais-divulgacao/gerar/v4-slides.mjs`, `node materiais-divulgacao/gerar/v4-gravar.mjs` (use
`SO=importar,salario` para regravar só alguns trechos; os trechos dependem uns dos outros, então na dúvida regrave tudo) e
`node materiais-divulgacao/gerar/v4-montar.mjs`. Precisam de Chrome e ffmpeg. O arquivo `gerar/numeros-v4.json` guarda a contagem
de testes do último quadro (1.566 verificações de tela + 214 de regras + 127 do banco = 1.907; o vídeo diz “mais de 1.900”).
A trilha é sintetizada em `gerar/v4-audio.py` (pad, harpa e baixo em Dó maior, feitos no próprio script, sem direitos de terceiros) e entra na montagem; `SEM_AUDIO=1 node materiais-divulgacao/gerar/v4-montar.mjs` gera a versão muda. Precisa de Python 3 com numpy. A `capa.png` é o primeiro quadro do vídeo.

## Post para o LinkedIn

> O Grana Leve ganhou um mascote que fica com você em todas as telas. 🌿
>
> O Grana Leve é um projeto de extensão do curso de Engenharia de Software: um app gratuito de controle financeiro para jovens e
> famílias, nascido de uma pesquisa com 48 pessoas. Nas últimas semanas ele ganhou bastante coisa. O que entrou (tudo
> funcionando, no vídeo):
>
> 🫧 **Grana, o mascote.** Fica no cantinho de todas as telas, anima, solta dicas da tela em que você está e tira dúvidas
> entendendo o sentido da pergunta: “posso colocar mais de um emprego no salário?” leva à resposta certa mesmo com palavras
> diferentes. Não é IA generativa: é um motor de similaridade (raiz das palavras, grupos de sentido, TF-IDF) que roda no aparelho.
> Nada do que a pessoa escreve vai para servidor. E dá para mandá-lo descansar quando atrapalhar.
>
> 💼 **Salário líquido de verdade, agora com mais de um emprego.** CLT, servidor, MEI, autônomo, PJ e estágio, com INSS e imposto
> de renda de 2026, descontos, ganhos extras, horas extras, sobreaviso, FGTS, 13º e férias. Cada emprego tem o seu cálculo, e o
> líquido fixo de todos vira um total só. No dia do pagamento o app pergunta “já caiu?” para confirmar o mês e acompanhar os
> reajustes.
>
> 🏦 **Importar extrato do banco.** OFX, CSV e até PDF. O app mostra tudo para conferir, sugere a categoria, evita lançar duas
> vezes e dá para desfazer. (O OFX ou CSV gerado no banco é o mais exato; o PDF é leitura aproximada, e o app avisa.)
>
> ✨ **Detalhes que fazem diferença:** uma tela de carregamento rápida com o Grana, “Salvar” que não grava em dobro quando a
> internet está lenta, gasto pago por outra pessoa ou dividido também no celular, novidades a cada atualização e uma troca de
> tema que nasce do botão e se espalha pela tela inteira.
>
> Por baixo: JavaScript puro, Supabase com regras de acesso por linha, checagem de tipos só como verificador, código dividido
> por área (menos JavaScript na abertura) e mais de 1.900 verificações automáticas a cada alteração.
>
> Ressalva honesta: o cálculo do salário usa as tabelas de 2026 e serve para planejar; não substitui o holerite. Com mais de um
> emprego, cada um é calculado à parte (o teto do INSS somado e o acerto do imposto de renda na declaração não são recalculados).
> As telas do vídeo usam dados de demonstração.
>
> Está gratuito e eu adoraria **testadores**. Qual dessas novidades faria mais diferença na sua rotina? Me conta nos comentários. 👇
>
> #FinançasPessoais #EducaçãoFinanceira #EngenhariaDeSoftware #ProjetoDeExtensão #BuildInPublic #PWA

**Primeiro comentário** (o LinkedIn tende a mostrar menos posts com link no corpo): `grana-leve.vercel.app`

### Versão mais curta (se preferir)

> O Grana Leve agora tem um mascote no cantinho de todas as telas, que tira dúvidas pelo sentido da pergunta (tudo no aparelho),
> calcula o salário líquido de um ou mais empregos, com 13º e férias, e importa extrato do banco (OFX, CSV e PDF, com
> conferência e “desfazer”). Gratuito e feito num projeto de extensão. Vídeo com o app de verdade 👇 Link no primeiro comentário.

## Roteiro do vídeo (o que cada trecho mostra de verdade)

| Tempo | Cena | O que aparece |
| --- | --- | --- |
| 0–3 s | Abertura | “Ficou ainda mais fácil usar o Grana Leve.” |
| 3–17 s | Conheça o Grana | Página inicial: o mascote reage ao toque e responde três perguntas escritas do jeito da pessoa; abaixo, as novidades |
| 17–26 s | Traga o extrato do banco | “Importar extrato”, arquivo OFX, conferência com categorias sugeridas, importar |
| 26–36 s | Salário líquido de verdade | Calculadora: bruto, desconto de vale-transporte, 13º e férias calculados |
| 36–45 s | “Já caiu?” | Meu salário (5º dia útil) e a confirmação do mês com sobreaviso, registrando o ganho |
| 45–54 s | Mais de um emprego | “Tenho mais de um emprego”: um segundo emprego (MEI) com o seu cálculo e o líquido fixo somado |
| 54–71 s | O Grana no cantinho | A tela de carregamento, o Grana no cantinho com a dica, a conversa (“posso colocar mais de um emprego no salário?”) e o modo escuro nascendo do botão |
| 71–76 s | Convite | “Quer testar o Grana Leve?” + endereço e o que o app tem |

## Dicas de publicação

- Publique o **vídeo** com a `capa.png` como miniatura e coloque o link no **primeiro comentário**.
- Texto alternativo do vídeo/capa: “Vídeo do app Grana Leve mostrando o mascote Grana no cantinho da tela e respondendo dúvidas, a
  importação de um extrato do banco, o cálculo do salário líquido de mais de um emprego com 13º e férias e a troca para o modo
  escuro se espalhando a partir do botão”.
- Muita gente assiste sem som: a legenda na tela conta a história sozinha, e a trilha é só um fundo. Se quiser narração, grave a sua voz (ou me diga o texto) e eu a coloco por cima.
- Marque a faculdade/orientador, se fizer sentido (e se eles concordarem).
- Os valores das telas são fictícios (conta de demonstração). Se alguém perguntar, diga isso.
- Se alguém perguntar sobre o mascote: ele conhece bem o que o app faz e, quando não sabe, diz e oferece falar com a equipe; não é
  um assistente aberto.
