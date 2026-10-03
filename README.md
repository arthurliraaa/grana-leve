# Grana Leve 💸

Ferramenta de controle financeiro pessoal para jovens e famílias. Nasceu do projeto
de Atividade Extensionista (Engenharia de Software), a partir de uma pesquisa com 48
pessoas sobre hábitos financeiros.

## Funcionalidades

- Cadastro e login (dados salvos no `localStorage` do navegador)
- Painel com saldo, gráfico de gastos por categoria e receitas × despesas (6 meses)
- Comparação com o mês anterior
- Lançamentos de receitas e despesas, com exportação em CSV
- Orçamento por categoria com alertas
- Metas de economia e controle de dívidas
- Dicas de educação financeira
- Relatório mensal em PDF (jsPDF)

## Como rodar

Opção 1, no VS Code: instale a extensão recomendada **Live Server** e clique em
"Go Live" na barra inferior.

Opção 2, no terminal:

```bash
npm run dev
```

Depois abra http://localhost:5500.

## Estrutura

```
index.html      marcação das telas (landing, login, app)
css/style.css   estilos e tema claro/escuro
js/app.js       lógica: Store (persistência), renderização, gráficos SVG, PDF/CSV
```

## Observações

- O app foi gerado originalmente como artefato do Claude. O `Store` tenta usar o
  banco do artefato (`window.claude`) e, fora dele, usa o `localStorage`.
- A senha é guardada como hash SHA-256 no navegador. É suficiente para um protótipo,
  mas não para produção: para uso real, o próximo passo é um backend com autenticação.
