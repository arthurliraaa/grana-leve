# Divulgação do Grana Leve (versão 3: as novidades)

Tudo aqui foi gravado **no app de verdade**, numa conta de demonstração fictícia (Marina Souza, modo local, sem tocar no
Supabase). O que aparece na tela (líquido do salário, 13º, férias, categorias sugeridas, respostas do mascote, tema que se
espalha) é calculado pelo próprio app; só os dados de exemplo (nomes e valores lançados) são inventados. Os avisos no
celular (Web Push) **ficaram de fora** porque ainda não estão ligados no servidor.

## Arquivos

| Arquivo | Para quê |
| --- | --- |
| `video-grana-leve-novidades.mp4` | Vídeo de ~61 s (4:5, 1080 × 1350, sem áudio, com legenda na tela) |
| `capa.png` | Imagem de capa/miniatura para o post |

Para refazer (por exemplo depois de mudar o visual): `node materiais-divulgacao/gerar/v3-slides.mjs`,
`node materiais-divulgacao/gerar/v3-gravar.mjs` (use `SO=importar,salario` para regravar só alguns trechos) e
`node materiais-divulgacao/gerar/v3-montar.mjs`. Precisam de Chrome e ffmpeg. O arquivo `gerar/numeros-v3.json` guarda a contagem
de testes usada no último quadro (1.501 verificações de tela + 207 de regras + 127 do banco = 1.835; o vídeo diz “mais de 1.800”).

## Post para o LinkedIn

> Anotar gasto não precisa dar ansiedade, e agora o Grana Leve ficou ainda mais fácil de usar. 🌿
>
> O Grana Leve é um projeto de extensão do curso de Engenharia de Software: um app gratuito de controle financeiro para jovens e
> famílias, nascido de uma pesquisa com 48 pessoas. Nas últimas semanas ele ganhou bastante coisa. O que entrou (tudo
> funcionando, no vídeo):
>
> 🫧 **Grana, o mascote.** Tira dúvidas sobre o app entendendo o sentido da pergunta: “como anoto uma despesa?” leva ao
> lançamento de gastos mesmo sem a palavra “gasto”. Não é IA generativa: é um motor de similaridade (raiz das palavras, grupos de
> sentido, TF-IDF) que roda no aparelho. Nada do que a pessoa escreve vai para servidor.
>
> 🏦 **Importar extrato do banco.** OFX, CSV e até PDF. O app mostra tudo para conferir, sugere a categoria, evita lançar duas
> vezes e dá para desfazer. (O OFX ou CSV gerado no banco é o mais exato; o PDF é leitura aproximada, e o app avisa.)
>
> 💼 **Salário líquido de verdade.** CLT, servidor, MEI, autônomo, PJ e estágio, com INSS e imposto de renda de 2026,
> descontos, ganhos extras, horas extras, sobreaviso, FGTS, 13º e férias. E no dia do pagamento o app pergunta “já caiu?” para
> confirmar o mês e acompanhar os reajustes.
>
> ✨ **Detalhes que fazem diferença:** novidades a cada atualização, um tutorial refeito e uma troca de tema que nasce do botão
> e se espalha pela tela inteira.
>
> Por baixo: JavaScript puro, Supabase com regras de acesso por linha, checagem de tipos só como verificador, código dividido
> por área (17% menos JavaScript na abertura) e mais de 1.800 verificações automáticas a cada alteração.
>
> Ressalva honesta: o cálculo do salário usa as tabelas de 2026 e serve para planejar; não substitui o holerite. As telas do
> vídeo usam dados de demonstração.
>
> Está gratuito e eu adoraria **testadores**. Qual dessas novidades faria mais diferença na sua rotina? Me conta nos comentários. 👇
>
> #FinançasPessoais #EducaçãoFinanceira #EngenhariaDeSoftware #ProjetoDeExtensão #BuildInPublic #PWA

**Primeiro comentário** (o LinkedIn tende a mostrar menos posts com link no corpo): `grana-leve.vercel.app`

### Versão mais curta (se preferir)

> O Grana Leve ganhou um mascote que tira dúvidas pelo sentido da pergunta (tudo no aparelho), importa extrato do banco (OFX, CSV
> e PDF, com conferência e “desfazer”) e calcula o salário líquido com 13º e férias, perguntando “já caiu?” no dia do
> pagamento. Gratuito e feito num projeto de extensão. Vídeo com o app de verdade 👇 Link no primeiro comentário.

## Roteiro do vídeo (o que cada trecho mostra de verdade)

| Tempo | Cena | O que aparece |
| --- | --- | --- |
| 0–3 s | Abertura | “Ficou ainda mais fácil usar o Grana Leve.” |
| 3–17 s | Conheça o Grana | Página inicial: o mascote reage ao toque e responde três perguntas escritas do jeito da pessoa; abaixo, as novidades |
| 17–26 s | Traga o extrato do banco | “Importar extrato”, arquivo OFX, conferência com categorias sugeridas, importar |
| 26–36 s | Salário líquido de verdade | Calculadora: bruto, desconto de vale-transporte, 13º e férias calculados |
| 36–45 s | “Já caiu?” | Meu salário (5º dia útil) e a confirmação do mês com sobreaviso, registrando o ganho |
| 45–57 s | Novidades e tema | O Grana no Início, o cartão de novidades e o modo escuro nascendo do botão e se espalhando |
| 57–61 s | Convite | “Quer testar o Grana Leve?” + endereço e o que o app tem |

## Dicas de publicação

- Publique o **vídeo** com a `capa.png` como miniatura e coloque o link no **primeiro comentário**.
- Texto alternativo do vídeo/capa: “Vídeo do app Grana Leve mostrando o mascote Grana respondendo dúvidas, a importação de um
  extrato do banco, o cálculo do salário líquido com 13º e férias e a troca para o modo escuro se espalhando a partir do botão”.
- Marque a faculdade/orientador, se fizer sentido (e se eles concordarem).
- Os valores das telas são fictícios (conta de demonstração). Se alguém perguntar, diga isso.
- Se alguém perguntar sobre o mascote: ele conhece bem o que o app faz (22 assuntos) e, quando não sabe, diz e oferece falar com a
  equipe; não é um assistente aberto.
