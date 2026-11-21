# Divulgação do Grana Leve (versão 2)

Tudo aqui foi gerado a partir de **capturas reais do app** numa conta de demonstração fictícia
(Marina Souza), sem tocar no Supabase. Os valores são de exemplo.

## Arquivos

| Arquivo | Para quê |
| --- | --- |
| `carrossel-01.png` … `carrossel-07.png` | Carrossel do LinkedIn (1080 × 1350). Publique como documento/imagens múltiplas, nesta ordem |
| `video-grana-leve.mp4` | Vídeo de ~38 s (4:5, sem áudio) com a tela do app em uso. Pode ir sozinho ou no lugar do carrossel |
| `../../icons/og-image.png` | Imagem que aparece quando o link do site é colado no LinkedIn/WhatsApp (já ligada no `index.html`) |

Para refazer tudo (por exemplo depois de mudar o visual do app): `node materiais-divulgacao/gerar/capturas.mjs`,
`node materiais-divulgacao/gerar/slides.mjs`, `node materiais-divulgacao/gerar/gravar.mjs` e
`node materiais-divulgacao/gerar/montar.mjs`. Precisam de Chrome e ffmpeg.

## Convite curto (WhatsApp, Direct, e-mail)

> Oi! Tô testando o **Grana Leve**, um app gratuito de controle financeiro que nasceu de um projeto de extensão da faculdade.
> Dá pra lançar gastos escrevendo do seu jeito (“gastei 30 no mercado”), ver o mês de relance e acompanhar metas.
> Leva uns 2 minutos: **grana-leve.vercel.app** (criar a conta é com e-mail ou Google).
> Se puder abrir pelo celular e me contar o que achou, ajuda muito. Dentro do app tem o botão “Ajuda e sugestões”. 🌿

Versão ainda mais curta (para mensagem direta):

> Pode testar o Grana Leve pra mim? É um app grátis de controle financeiro, leva 2 minutos: grana-leve.vercel.app. Me conta o que achou? 🙏

## Post para o LinkedIn

> Anotar gasto não precisa dar ansiedade. 🌿
>
> Uma pesquisa com 48 pessoas sobre hábitos financeiros foi o ponto de partida do **Grana Leve**, um projeto de extensão do curso de Engenharia de Software: uma ferramenta simples, gratuita, para jovens e famílias que querem entender para onde o dinheiro vai sem virar contador.
>
> O que mais me orgulha nele:
>
> 💬 **Lançamento por mensagem**: escreva “gastei 32 no mercado e 18 de uber” e o app monta os dois lançamentos. Você confere e só então salva. Nada entra sem a sua confirmação.
> 📊 **O mês de relance**: gastos por categoria em rosca, pizza ou blocos, navegando por meses passados e futuros.
> 💳 **Cartão sem susto**: o app mostra o que sobra depois de pagar as faturas, com a conta à mostra (contas − faturas = sobra), e separa o que é seu do que outras pessoas vão te devolver.
> 🎯 **Metas que rendem**: você diz onde o dinheiro está (CDB, poupança, Tesouro) e a previsão usa os índices do Banco Central.
>
> Por baixo: PWA em JavaScript puro (instala no celular, sem loja), Supabase com regras de acesso por linha e mais de mil verificações automáticas rodando a cada alteração.
>
> Está gratuito e eu adoraria **testadores**: grana-leve.vercel.app
> Qual dessas funções faria mais diferença na sua rotina? Me conta nos comentários. 👇
>
> #FinançasPessoais #EducaçãoFinanceira #EngenhariaDeSoftware #ProjetoDeExtensão #BuildInPublic #PWA

Dicas de publicação:

- Publique o **carrossel** (documento ou imagens) e coloque o link no **primeiro comentário**: o LinkedIn tende a mostrar menos posts com link no corpo.
- Marque a faculdade/orientador, se fizer sentido (e se eles concordarem).
- Escreva o texto alternativo das imagens (acessibilidade): “Tela do Grana Leve com o chat de lançamento…”.
- Se usar o vídeo, ele já tem legenda na tela; adicione música pela própria rede se quiser.
- Os valores das telas são fictícios. Se alguém perguntar, diga que é uma conta de demonstração.

## Ideia de animação (o vídeo já segue este roteiro)

| Tempo | Cena | O que aparece |
| --- | --- | --- |
| 0–3 s | Gancho | Texto grande: “Anotar gasto não precisa dar ansiedade.” |
| 3–14 s | Escreva como você fala | Toque no “+”, chat, digitação da frase, os dois itens aparecem para conferir, toque em “Salvar” |
| 14–25 s | O mês de relance | Rosca → pizza → blocos; volta um e dois meses e retorna a “este mês” |
| 25–31 s | Cartão sem susto | “Nas contas − Faturas a pagar = Sobra”; depois as faturas “minha parte × outras pessoas” |
| 31–35 s | Metas | Cartão da meta com CDB e a previsão de quando chega ao valor |
| 35–38 s | Convite | “Quer testar o Grana Leve?” + endereço |

Cada toque tem um círculo verde para quem assiste acompanhar. Variações que valem testar:

1. **Versão de 15 s** (só chat + gráficos) para Stories/Reels.
2. **Antes × depois**: de um lado a planilha cheia de colunas, do outro a frase digitada virando lançamentos.
3. **Contador na tela**: “10 segundos para lançar 2 gastos”.
