# Guia de estudo do Grana Leve (para quem está começando)

Este guia leva você do zero até entender o código do Grana Leve inteiro, usando o próprio projeto como material de estudo.
Você **não precisa saber programar** para começar: a Parte 2 ensina o JavaScript que o projeto usa, e cada lição aponta um
trecho real do código para você ver a ideia funcionando.

**Como o guia está organizado**

| Parte | O que é | Tempo |
| --- | --- | --- |
| 0 | Preparar o computador | 30 min |
| 1 | Como a web funciona, em linguagem simples | 30 min |
| 2 | JavaScript do zero (15 lições curtas) | 12 a 15 h |
| 3 | A trilha pelo projeto (8 etapas, da regra de dinheiro à publicação) | 20 h |
| 4 | Mapa: cada funcionalidade e os arquivos dela | consulta |
| 5 | Como mudar algo com segurança + projetos para praticar | 5 h |
| 6 | Glossário | consulta |

Ritmo sugerido: **2 horas por dia, em 3 a 4 semanas**. É melhor estudar pouco todo dia do que muito de uma vez.

**Os ícones que aparecem**

- 🧠 **Ideia**: o conceito, explicado sem pressa.
- 🔎 **No projeto**: onde essa ideia aparece no código do Grana Leve.
- ✍️ **Faça você**: um exercício curto (use o Console do navegador ou o `node`, veja a Parte 0).
- ✅ **Confirme**: uma pergunta para checar se entendeu. Se não souber responder, releia a lição.

**A regra que mais ajuda:** não leia código "de cima para baixo" como um livro. Abra o app, use a função, e só depois
procure o código dela. Você já usa o app todo dia, então já conhece o que cada tela faz; o código passa a ser "como isso foi
feito" e não um texto estranho.

---

## Parte 0. Preparar o computador (30 min)

### Ferramentas

- **Editor de código:** o Visual Studio Code (você já usa). Instale a extensão ESLint se quiser ver os avisos na tela.
- **Node.js 20 ou mais novo:** executa JavaScript fora do navegador (é o que roda os testes). Confira com `node -v`.
- **Git:** guarda o histórico do projeto. Confira com `git --version`.
- **Navegador (Chrome):** as Ferramentas do Desenvolvedor (tecla **F12**) são o seu melhor professor.

### Rodar o projeto

No terminal, dentro da pasta do projeto:

```bash
npm install        # baixa as ferramentas (uma vez só)
npm run dev        # abre o app em http://localhost:5500
```

Abra o endereço, crie uma conta de teste e use o app. Com o app aberto, aperte **F12**:

- **Console:** aqui você digita JavaScript e vê o resultado na hora. É o seu caderno de rascunho.
- **Elements:** a página como o navegador a entende (o HTML vivo). Passe o mouse e veja o que cada elemento é.
- **Network:** cada pedido que a página faz (arquivos, banco de dados). Útil para ver "o que acontece quando clico".
- **Application → Local Storage:** os dados que o app guarda no navegador. Procure `granaleve_local_db_v1`.

### Os quatro comandos que você mais vai usar

```bash
npm run check      # confere o estilo do código, os tipos e os testes das regras (rápido, ~10 s)
npm run test:e2e   # abre um Chrome de verdade e usa o app sozinho (~3 min)
node --test tests/unit/jobs.test.js   # roda UM arquivo de testes
git log --oneline  # lista o histórico de mudanças (a "linha do tempo" do projeto)
```

### ✍️ Faça você

1. Rode `npm run dev`, abra o app e abra o Console (F12). Digite `2 + 2` e aperte Enter.
2. No terminal, digite `node` e Enter, depois `2 + 2`. Saia com `Ctrl+C` duas vezes. Você acabou de rodar JavaScript fora do navegador.
3. Rode `git log --oneline | head -20` e leia os nomes das mudanças: é a história do projeto em português.

---

## Parte 1. A web em 30 minutos

### 🧠 Três linguagens, três papéis

Toda página da web é feita de três coisas:

| Linguagem | Papel | Analogia | No projeto |
| --- | --- | --- | --- |
| **HTML** | O conteúdo e a estrutura: títulos, botões, campos | O esqueleto e as paredes de uma casa | `index.html` |
| **CSS** | A aparência: cores, tamanhos, posição, modo escuro | A pintura e a decoração | `css/style.css` |
| **JavaScript** | O comportamento: o que acontece quando você clica | A eletricidade e os encanamentos | `js/` |

O navegador lê o HTML, monta uma árvore chamada **DOM** (Document Object Model: cada elemento da página vira um "objeto"
que o JavaScript pode mexer) e aplica o CSS. O JavaScript mexe no DOM e a tela muda.

### 🧠 Onde as coisas rodam

- **Navegador (cliente):** roda o HTML, o CSS e o JavaScript. No Grana Leve, **quase toda a lógica roda aqui**, no seu aparelho.
- **Servidor:** guarda dados e responde pedidos. O Grana Leve usa o **Supabase** (um banco de dados na nuvem com login pronto).
- **Hospedagem:** o **Vercel** entrega os arquivos do site para quem acessa `grana-leve.vercel.app`.
- **PWA:** um site que se comporta como aplicativo (instala no celular, abre sem internet). Isso vem do `manifest.webmanifest`
  e do `sw.js` (o *service worker*, um "porteiro" que guarda uma cópia do app).

### 🔎 O caminho de uma pessoa abrindo o app

1. O navegador baixa o `index.html`, que carrega `js/app.js`.
2. `js/app.js` chama `start()` em `js/ui/app.js`, que liga os botões e decide o que mostrar.
3. Os dados vêm do **Store** (`js/data/store.js`): da nuvem (Supabase) ou do próprio navegador (`localStorage`).
4. As telas são montadas por `js/ui/*.js`, usando as **regras** de `js/domain/*.js`.

### ✅ Confirme

- Qual a diferença entre HTML e JavaScript?
- Por que o app funciona sem internet depois de aberto uma vez?

---

## Parte 2. JavaScript do zero

> **Sobre o estilo do projeto:** o Grana Leve usa um JavaScript "clássico": `var` para variáveis e `function(){ ... }` para
> funções. É JavaScript totalmente válido e funciona em qualquer navegador. Os testes usam o jeito "moderno" (`const`, `let` e
> `=>`). Você vai ler os dois, então as lições mostram ambos.

Para cada lição, teste os exemplos no Console (F12) ou no `node`. **Digitar é parte do estudo**: não cole.

### Lição 1. Valores e variáveis

🧠 Uma **variável** é uma caixa com nome onde você guarda um valor.

```js
var preco = 5.5;          // número
var nome = 'Baozi';       // texto (string)
var emEstoque = true;     // verdadeiro ou falso (boolean)
var nada = null;          // "de propósito, vazio"
var naoDefinido;          // undefined: "ninguém colocou nada aqui"
var lista = [1, 2, 3];    // array: uma lista
var pessoa = {nome: 'Ana', idade: 20};   // objeto: um conjunto de "etiqueta: valor"
```

Três formas de declarar: `var` (a antiga, usada no projeto), `let` (valor que pode mudar) e `const` (valor que não será
reatribuído). Em código novo, prefira `const` e use `let` só quando precisar mudar.

Para saber o tipo de algo: `typeof preco` → `'number'`. Curiosidade que pega todo mundo: `typeof null` é `'object'` (um erro
antigo da linguagem que ficou) e `typeof []` também é `'object'`; para saber se é lista, use `Array.isArray(lista)`.

🔎 **No projeto:** `js/domain/jobs.js` começa com `export var MAX_JOBS = 6;` e `DEFAULT_JOB_NAME = 'Emprego principal'`:
são valores fixos com nome, para não espalhar "números mágicos" pelo código.

✍️ Crie uma variável com o seu nome e outra com a sua idade. Depois mostre `'Olá, ' + nome + '! Você tem ' + idade + ' anos.'`.

✅ Qual a diferença entre `null` e `undefined`?

### Lição 2. Operadores, comparações e "verdadeiro ou falso"

🧠 Contas: `+ - * / %` (o `%` é o resto da divisão: `7 % 2` dá `1`). Comparações: `<  >  <=  >=  ===  !==`.

**Use sempre `===` (três iguais)**, que compara valor e tipo. O `==` converte tipos e dá surpresas.

```js
5 === '5'    // false  (número ≠ texto)
5 == '5'     // true   (o == "ajeita" os tipos: evite)
'5' + 3      // '53'   (+ com texto junta)
'5' - 3      // 2      (- converte para número)
```

**Verdadeiro e falso na prática ("truthy" e "falsy").** Em um `if`, estes valores contam como *falso*: `false`, `0`, `''` (texto
vazio), `null`, `undefined` e `NaN`. Todo o resto conta como *verdadeiro* (inclusive `[]` e `{}`).

`&&` ("e"), `||` ("ou") e `!` ("não") combinam condições. O `||` também serve para **valor padrão**:

```js
var nome = textoDigitado || 'Sem nome';   // se textoDigitado for vazio, usa 'Sem nome'
```

Números têm um lado traiçoeiro: `0.1 + 0.2` dá `0.30000000000000004`. Computadores guardam decimais em binário e perdem precisão.
`Number('12abc')` dá `NaN` ("não é um número"), e `NaN === NaN` é `false` (use `isFinite(x)` para checar).

🔎 **No projeto:** é por isso que `js/domain/money.js` guarda dinheiro **em centavos inteiros** (R$ 0,30 vira `30`). O comentário
no topo do arquivo explica exatamente o problema do `0,1 + 0,2`. A função `toCents` usa `isFinite` para tratar entrada inválida.

✍️ No Console: `0.1 + 0.2`, depois `(0.1 * 100 + 0.2 * 100) / 100`. Compare. Depois `Math.round(1.005 * 100)`, que dá `100` e não `101`.

✅ Por que `if ('0')` é verdadeiro mas `if (0)` é falso?

### Lição 3. Textos (strings) e expressões regulares

🧠 Textos têm "ferramentas" embutidas:

```js
var t = '  Mercado da Semana  ';
t.trim()              // 'Mercado da Semana'   (tira espaços das pontas)
t.trim().toLowerCase() // 'mercado da semana'
t.length              // 21
'a,b,c'.split(',')    // ['a','b','c']
['a','b'].join(' - ') // 'a - b'
'abc'.slice(1)        // 'bc'
'abc'.indexOf('c')    // 2   (-1 se não achar)
'banana'.replace(/a/g, 'o')   // 'bonono'
```

**Texto com variáveis**, o jeito moderno (crase, não aspas): `` `Olá, ${nome}!` ``.

**Expressão regular (regex)** é um "molde" para achar padrões em texto, entre barras: `/\d+/` acha dígitos. O básico:
`\d` dígito, `+` "um ou mais", `^` começo, `$` fim, `[abc]` qualquer um destes, `( )` guarda um pedaço, `.test(texto)` responde sim/não.

🔎 **No projeto:**
- `escapeHtml` em `js/ui/dom.js` troca `<`, `>`, `&` e aspas por códigos seguros. Veja a Lição 13: isso protege o app de ataques.
- `parseMoneyText` em `js/domain/money.js` entende `"1.500,00"`, `"R$ 1.500"` e `"32.50"` com regex. Leia o comentário, depois as linhas.
- `js/domain/parser.js` é o leitor de "gastei 30 no mercado": vai pegar números e palavras com os mesmos truques.

✍️ Escreva `/^\d{2}\/\d{2}\/\d{4}$/.test('17/11/2026')` e depois com `'17-11-2026'`.

✅ Para que serve `.trim()` num campo digitado pela pessoa?

### Lição 4. Decisões e repetições

🧠 **Decisão:**

```js
if (saldo < 0){ aviso = 'no vermelho'; }
else if (saldo === 0){ aviso = 'zerado'; }
else { aviso = 'positivo'; }

var aviso2 = saldo < 0 ? 'no vermelho' : 'ok';   // "ternário": if em uma linha
```

**Repetição:**

```js
for (var i = 0; i < 3; i++){ console.log(i); }   // 0, 1, 2
var j = 0; while (j < 3){ j++; }                 // enquanto a condição for verdadeira
for (const item of ['a', 'b']){ console.log(item); }   // percorre uma lista
```

`break` sai do laço; `continue` pula para a próxima volta.

🔎 **No projeto:** `splitAmount` em `js/domain/money.js` divide R$ 100 em 3 parcelas (33,34 + 33,33 + 33,33) com um `for`.
Leia o comentário e o código, e confira no teste `tests/unit/money-dates.test.js`.

✍️ Escreva um laço que imprima os números de 1 a 10 e diga se cada um é par ou ímpar (`n % 2 === 0`).

✅ Em `splitAmount`, por que a sobra da divisão vai na primeira parcela?

### Lição 5. Funções

🧠 Uma **função** é uma receita com nome: recebe **parâmetros** (ingredientes), faz algo e **devolve** (`return`) um resultado.

```js
function dobro(x){ return x * 2; }          // declaração
var triplo = function(x){ return x * 3; };  // expressão
var quadruplo = x => x * 4;                 // arrow function (moderna)
dobro(5)   // 10
```

Funções são **valores**: dá para guardar numa variável, passar para outra função e devolver de outra função. Isso aparece em todo
lugar (Lição 6 e Lição 8).

**Função pura** é a que só depende do que recebe e só devolve um resultado (não mexe na tela, não grava nada, não depende da hora).
Ela é fácil de testar e de entender. **Todo o `js/domain/` é feito de funções puras**; é a ideia mais importante do projeto.

🔎 **No projeto:** `money(v)`, `toCents(v)` e `fmtMoney(v)` em `js/domain/money.js`, e `findById(list, id)` em `js/domain/util.js`:

```js
export function findById(list, id){ for (var i=0;i<list.length;i++){ if (list[i].id === id) return list[i]; } return null; }
```

Leia em voz alta: "dada uma lista e um id, percorra a lista; se o id do item for igual ao procurado, devolva o item; se acabar sem achar, devolva `null`".

✍️ Escreva `function ehPar(n)` que devolve `true` se `n` for par. Depois escreva `function media(a, b)`.

✅ Por que `money(1.005)` sempre devolve o mesmo resultado, não importa quando você chame? (Dica: é uma função pura.)

### Lição 6. Listas (arrays) e o trio `map`, `filter`, `reduce`

🧠 Um **array** é uma lista numerada a partir do zero: `lista[0]` é o primeiro. `lista.length` é o tamanho.

```js
var gastos = [30, 20, 50];
gastos.push(10);          // adiciona no fim
gastos.slice(1, 3)        // [20, 50]   (cópia de um pedaço)
gastos.concat([5])        // nova lista com o 5 no fim
gastos.indexOf(50)        // 2
```

As ferramentas que mais aparecem no projeto recebem **uma função**:

```js
gastos.forEach(g => console.log(g));          // faz algo com cada um
gastos.map(g => g * 2);                       // [60, 40, 100, 20]    transforma cada um
gastos.filter(g => g > 25);                   // [30, 50]             fica só com quem passa no teste
gastos.find(g => g > 25);                     // 30                   o primeiro que passa
gastos.some(g => g > 40);                     // true                 algum passa?
gastos.every(g => g > 5);                     // true                 todos passam?
gastos.reduce((soma, g) => soma + g, 0);      // 110                  junta tudo em UM valor
gastos.slice().sort((a, b) => a - b);         // ordena (sem mexer na original)
```

O `reduce` é o mais difícil: ele carrega um **acumulador** (`soma`, começando em `0`) e vai juntando cada item.

🔎 **No projeto:**

```js
// js/domain/money.js  (soma dinheiro sem erro de centavos)
export function sumMoney(list, fn){
  return fromCents(list.reduce(function(s, x){ return s + toCents(fn ? fn(x) : x); }, 0));
}
// js/domain/jobs.js  (acha o emprego ativo: filtra e pega o primeiro)
export function activeJob(state){ return state.list.filter(function(j){ return j.id === state.active; })[0] || state.list[0]; }
```

Em `activeJob`: `.filter(...)` deixa só o emprego com o id ativo, `[0]` pega o primeiro, e `|| state.list[0]` é o "valor padrão" se não achar nenhum.

✍️ Com `var compras = [{item:'pão', valor:5.5}, {item:'leite', valor:6}, {item:'café', valor:18}]`, ache: (a) o total com `reduce`;
(b) só os itens acima de R$ 5,50; (c) a lista só com os nomes em maiúsculas.

✅ Qual a diferença entre `map` e `filter`? E entre `find` e `filter`?

### Lição 7. Objetos, cópias e JSON

🧠 Um **objeto** guarda "etiqueta: valor":

```js
var gasto = {type: 'expense', amount: 80, category: 'saude', date: '2026-11-17'};
gasto.amount        // 80
gasto['category']   // 'saude'
gasto.pago = true;  // adiciona uma etiqueta
delete gasto.pago;  // tira
Object.keys(gasto)  // ['type','amount','category','date']
```

**Armadilha clássica: objetos e listas são passados por referência.**

```js
var a = {x: 1};
var b = a;      // b NÃO é uma cópia: é a MESMA caixa
b.x = 99;
a.x             // 99 !
var c = Object.assign({}, a);   // cópia rasa (um nível)
```

Por isso o projeto prefere **criar novos objetos** em vez de alterar os que recebeu (veja `addJob`, que devolve uma lista nova).

**JSON** é texto que descreve objetos. `JSON.stringify(obj)` vira texto; `JSON.parse(texto)` volta a ser objeto. É assim que
o app guarda dados no navegador e faz backup.

🔎 **No projeto:** um lançamento é um objeto como o do exemplo (`type`, `amount`, `category`, `date`...). Em `js/domain/jobs.js`,
`addJob` devolve `{list: state.list.concat([...]), active: id}`: **um estado novo**, sem mexer no antigo. O teste
`tests/unit/jobs.test.js` confere isso.

✍️ Crie `var a = {n: 1}; var b = a; b.n = 2;` e veja `a.n`. Depois faça `JSON.parse(JSON.stringify(a))` e mude a cópia.

✅ Por que mexer num objeto "recebido" dentro de uma função pode causar bugs em outros lugares?

### Lição 8. Escopo e closures (o "pulo do gato")

🧠 **Escopo** é "onde uma variável existe". Uma variável criada dentro de uma função só existe lá dentro.

Uma **closure** é uma função que **lembra** das variáveis do lugar onde nasceu, mesmo depois que esse lugar terminou:

```js
function criaContador(){
  var n = 0;
  return function(){ n++; return n; };   // esta função "lembra" o n
}
var c = criaContador();
c(); c(); c();   // 1, 2, 3
```

🔎 **No projeto:** `trackWrites` em `js/data/store.js`. Para cada operação (`add`, `update`, `remove`...) ele guarda a original em `fn` e cria uma
função nova (`wrapped`) que **lembra** de `fn` e de `store`. A nova soma 1 em `store.inflight`, chama a original e, no fim, subtrai 1.
É assim que o app sabe "tem uma gravação em andamento" e não deixa você gravar duas vezes ao tocar em "Salvar" repetidamente
(`js/ui/busy.js`).

✍️ Escreva `function somaCom(x)` que devolve uma função `y => x + y`. Use: `var mais10 = somaCom(10); mais10(5)`.

✅ No `criaContador`, por que `n` não volta a ser 0 a cada chamada de `c()`?

### Lição 9. O `this`, `apply` e `arguments` (só o necessário)

🧠 Dentro de um objeto, `this` é "o objeto dono do método". `fn.apply(this, arguments)` chama uma função com o mesmo `this` e os mesmos
argumentos recebidos. Em uma função "clássica", `arguments` é a lista de tudo o que foi passado.

🔎 **No projeto:** a linha `return await fn.apply(this, arguments);` em `trackWrites` repassa a chamada original sem perder nada. Você
não precisa dominar isso agora; basta saber que é "repasse a chamada exatamente como veio".

✅ Em uma frase: o que `wrapped` faz com a função original?

### Lição 10. Erros: `throw`, `try`, `catch`, `finally`

🧠 Quando algo dá errado, o JavaScript "lança" um erro. Você pode **capturar**:

```js
try {
  var dados = JSON.parse(textoQuebrado);    // pode dar erro
} catch (e) {
  console.log('não deu:', e.message);       // roda só se deu erro
} finally {
  console.log('isto roda sempre');          // com erro ou sem
}
```

🔎 **No projeto:**
- `Store.init` tem `try { localStorage.getItem(...) } catch(e){ /* sem localStorage */ }`: alguns navegadores bloqueiam o armazenamento, e o app não pode quebrar por isso.
- `trackWrites` usa `finally { store.inflight--; }` para **sempre** liberar a contagem, mesmo se a gravação falhar.

✅ Por que o `finally` é o lugar certo para "liberar o botão"?

### Lição 11. Tempo e assincronismo (`setTimeout`, `Promise`, `async/await`)

🧠 Algumas coisas **demoram**: buscar dados no servidor, esperar o usuário fechar um popup. O JavaScript não trava esperando: ele
deixa o pedido "andando" e continua. Há três formas de lidar:

```js
setTimeout(function(){ console.log('1 segundo depois'); }, 1000);   // 1) callback: "chame isto depois"

fetch('/dados').then(r => r.json()).then(d => console.log(d));       // 2) Promise: "uma promessa de resultado"

async function carrega(){                                            // 3) async/await: parece código normal
  var r = await fetch('/dados');       // "espere aqui, sem travar a tela"
  return r.json();
}
```

`await` só funciona dentro de `async function`. Uma função `async` **sempre devolve uma Promise**.

🔎 **No projeto:**
- Quase toda gravação é `await Store.add(...)` (ver `js/ui/tx-list.js`).
- `openModal` em `js/ui/modal.js` devolve uma **Promise** que só "se resolve" quando o popup fecha: por isso o código pode escrever
  `var resposta = await openModal({...})` e continuar só depois que a pessoa responder.
- `js/ui/busy.js` usa `setInterval` (um `setTimeout` que se repete) para perguntar de 50 em 50 ms "a gravação terminou?".

✍️ No Console: `setTimeout(() => console.log('depois'), 2000); console.log('antes');`. Qual aparece primeiro? Por quê?

✅ O que acontece se você esquecer o `await` antes de `Store.add(...)`?

### Lição 12. Módulos (`import` e `export`)

🧠 Um projeto grande é dividido em muitos arquivos. Cada arquivo **exporta** o que quer compartilhar e **importa** o que precisa:

```js
// util.js
export function dobro(x){ return x * 2; }
// outro.js
import {dobro} from './util.js';
```

No `package.json` há `"type": "module"`, e o navegador carrega os arquivos com `<script type="module">`. Por isso o `index.html`
**não abre direto do disco** (precisa de um servidor, daí o `npm run dev`).

🔎 **No projeto:** olhe as primeiras linhas de `js/ui/tx-edit.js`: uma lista longa de `import`. Isso é um "mapa de quem usa quem".
**Regra de ouro do projeto:** `js/domain/` **não importa** nada de `js/ui/` (as regras não conhecem a tela). Confira você mesmo: abra
qualquer arquivo de `js/domain/` e veja que os imports são só de outros arquivos de `domain`.

✍️ Abra `js/domain/cards.js` e liste de quais arquivos ele importa.

✅ Por que as regras de dinheiro ficam separadas da tela?

### Lição 13. O DOM, os eventos e a segurança

🧠 O **DOM** é a página como um conjunto de objetos. Você **acha** elementos, **muda** e **escuta** o que a pessoa faz:

```js
var botao = document.querySelector('#salvar');      // acha pelo id (# = id, . = classe)
botao.addEventListener('click', function(){          // "quando clicarem..."
  botao.textContent = 'Salvo!';
  botao.classList.add('ok');
  botao.hidden = true;
});
```

**Delegação de eventos:** em vez de colocar um "ouvinte" em cada botão, coloca-se um só no documento e pergunta-se "o que foi clicado?"
com `e.target.closest('[data-...]')`. Os botões carregam seus dados em **atributos `data-`** (`<button data-salary-open="j2">`),
que o JavaScript lê depois. O projeto usa muito isso em `js/ui/shell.js`.

**Segurança (XSS):** se você colocar texto digitado pela pessoa dentro de `innerHTML` sem tratar, ela pode digitar
`<script>` e rodar código no app de outra pessoa. A defesa é `escapeHtml` (que o projeto usa em **todo** texto digitado) e a
*Content Security Policy* no `index.html`.

🔎 **No projeto:** `js/ui/busy.js` é um ótimo arquivo curto para ler: usa `document.addEventListener('submit', ...)` e
`e.target`, e mexe em `disabled`, `classList` e `setAttribute`. Leia o comentário no topo antes.

✍️ No Console, no app aberto: `document.querySelectorAll('button').length` e `document.getElementById('fabAdd').textContent`.

✅ Por que `escapeHtml` é obrigatório antes de colocar um nome digitado numa tela?

### Lição 14. Datas e armazenamento no navegador

🧠 `new Date()` é a data de agora, mas datas em JavaScript têm armadilhas (fuso horário, meses começando em 0). O Grana Leve evita
o problema guardando datas como **texto `'AAAA-MM-DD'`** (`'2026-11-17'`) e centralizando as contas em `js/domain/dates.js`.

`localStorage` é um "armário" do navegador: guarda pares texto-texto que sobrevivem ao fechar a página:

```js
localStorage.setItem('chave', JSON.stringify({a: 1}));
JSON.parse(localStorage.getItem('chave'));
```

🔎 **No projeto:** o modo "local" do `Store` (`granaleve_local_db_v1`) é só isso, tudo dentro de um JSON no `localStorage`. Os testes do
navegador usam esse modo (`granaleve_backend=local`) para não tocar no banco de verdade, e um **relógio fixo em 17/11/2026** para
os resultados serem sempre iguais.

✅ Por que guardar a data como texto `'2026-11-17'` evita bugs de fuso horário?

### Lição 15. Testes automáticos

🧠 Um **teste** é um programa que chama o seu código e confere se o resultado é o esperado. Assim, ao mudar algo, você descobre na
hora se quebrou outra coisa. A estrutura é sempre: **preparar → agir → conferir**.

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {money} from '../../js/domain/money.js';

test('arredonda para centavos', () => {
  assert.equal(money(1.005), 1.01);    // conferir: esperado vs. recebido
});
```

Há dois tipos no projeto:
- **Unitários** (`tests/unit/`): testam funções puras de `domain/`. Rápidos (milissegundos).
- **Ponta a ponta, "e2e"** (`tests/e2e/`): abrem um Chrome de verdade e usam o app (clicam, digitam, conferem a tela).

🔎 **No projeto:** leia `tests/unit/jobs.test.js`. Cada `test('frase', ...)` é uma frase em português que **descreve uma regra**.
Ler só os títulos dos testes de um arquivo já ensina o que aquela parte do app promete fazer.

✍️ Rode `node --test tests/unit/jobs.test.js`. Depois, em `js/domain/jobs.js`, mude `MAX_JOBS` de 6 para 5, rode de novo e veja qual teste
falha (e por quê). **Volte a mudança** com `git restore js/domain/jobs.js`.

✅ Por que existem testes "e2e" se os unitários já passam?

### Checklist final da Parte 2

Marque quando conseguir explicar **com as suas palavras**:

- [ ] O que é uma função pura e por que o `domain/` é feito delas
- [ ] `map`, `filter`, `find` e `reduce`
- [ ] Por que `0.1 + 0.2 ≠ 0.3` e por que o dinheiro fica em centavos
- [ ] Referência × cópia de objetos
- [ ] O que é uma closure (e onde `trackWrites` usa uma)
- [ ] `async/await` e o que é uma Promise
- [ ] `import/export` e por que o app precisa de servidor
- [ ] O DOM, eventos e `escapeHtml`
- [ ] Como um teste é estruturado

---

## Parte 3. A trilha pelo projeto

Em cada etapa: **use a tela → leia o domínio → leia o teste → leia a interface → mude algo pequeno**.
Os caminhos abaixo são relativos à pasta do projeto.

### Mapa mental das pastas

```
index.html          as telas (HTML)                       css/style.css   a aparência
js/app.js           a porta de entrada
js/domain/          REGRAS (funções puras, sem tela)      tests/unit/     testes das regras
js/data/            ONDE OS DADOS FICAM (nuvem/navegador)  tests/e2e/      testes no Chrome de verdade
js/ui/              AS TELAS (uma área por arquivo)
supabase/           o banco de dados (migrações e segurança)
tools/              montar o site para publicar
docs/               regras financeiras e decisões
```

**A ideia central: três camadas.** `domain` decide **o quê** (as contas), `ui` decide **como aparece**, `data` decide **onde guarda**.
Quem entende essa divisão consegue achar qualquer coisa no projeto.

### Etapa 1. O esqueleto (2 h)

**Leia:** `js/app.js` (3 linhas) → `js/ui/app.js` (o "mapa do código" está no comentário do topo) → `js/ui/shell.js` (navegação e eventos) →
`js/data/store.js` → `js/data/session.js`.

**Para entender:**
- Como o app decide entre tela de login, tela inicial e o app em si.
- O `Store`: uma "tomada universal" que esconde se os dados estão na nuvem ou no navegador. Todas as telas só chamam `Store.add(...)`, etc.
- `withPart(...)` em `shell.js`: carrega partes pesadas (Administração, Simular, Importar extrato…) **só quando a pessoa abre**.

**Perguntas:** O que acontece entre abrir o site e ver o Início? Por onde passa uma gravação? O que é `State` (`js/ui/state.js`)?

**✍️ Exercício:** coloque `console.log('gravando', collection)` dentro de `Store.add` (ou na função de gravação do modo local) e lance um gasto
com o Console aberto. Depois **desfaça** com `git restore`.

**✅ Confirme:** desenhe no papel o caminho "clique em Salvar → ... → aparece na lista".

### Etapa 2. O dinheiro (3 h), a base de tudo

**Leia, nesta ordem:** `js/domain/money.js` → `dates.js` → `transactions.js` → `accounts.js` → `cards.js` (fatura, fechamento, vencimento, parcelas).
**Ao lado**, abra [`docs/regras-financeiras.md`](regras-financeiras.md): ele explica o **porquê** de cada regra.

**Para entender:**
- Dinheiro sempre em centavos; `money()` arredonda, `sumMoney()` soma sem erro.
- "Total × realmente meu": quando você paga algo por outra pessoa ou divide, o dinheiro sai da conta mas só a sua parte é gasto seu
  (`myShare`, `othersShare`, `isPersonal` em `transactions.js`).
- Em que fatura cai uma compra no cartão (o dia de fechamento decide).

**Teste de confirmação:** abra `tests/unit/` dos mesmos assuntos (`money-dates`, `total-e-meu`, `cards-installments`). Leia os **títulos** primeiro; eles contam os casos de borda
(compra no fim do mês, parcela quebrada, estorno).

**✍️ Exercício:** com um cartão que fecha dia 20, preveja em qual fatura cai uma compra de 3x feita dia 31. Confira lançando no app e vendo a fatura.

**✅ Confirme:** por que "R$ 100 em 3x" vira 33,34 + 33,33 + 33,33?

### Etapa 3. Lançar gastos (2 h)

**Leia:** `js/domain/parser.js` (o "leitor" de "gastei 30 no mercado": regras, **não é IA**) → `js/ui/chat.js` → `js/ui/tx-list.js` (o formulário e a lista) →
`js/ui/tx-edit.js` (o popup do "+", editar, estorno, parcelas) → `js/ui/tx-others.js` (pagou por outra pessoa e dividir) → `js/ui/modal.js`.

**Para entender:**
- O app **nunca salva sem você conferir** o que o leitor entendeu.
- No celular o formulário grande fica escondido e o "+" abre um popup: por isso o popup precisa ter as mesmas opções (a lógica de gravar é uma só, `attachOthers` em `tx-list.js`).

**✍️ Exercício:** escreva no chat "gastei 30 no mercado e 20 no uber ontem" e acompanhe, no `parser.js`, qual pedaço identificou o valor, o lugar e a data.

**✅ Confirme:** o que o `attachOthers` cria no banco quando você marca "Paguei por outra pessoa"?

### Etapa 4. O Início e os gráficos (2 h)

**Leia:** `js/ui/home-tab.js` → `dash-data.js` (os **números**) → `dash-charts.js` (os **gráficos**) → `dash-details.js` → `charts.js`.

**Ideia central:** cálculo separado de apresentação. Os números nascem em `dash-data.js` e `domain/`; os gráficos só **desenham** o que recebem.

**✍️ Exercício:** ache no código a frase "Neste mês entraram R$ ... e saíram R$ ..." (`monthStatusHtml` em `home-tab.js`) e identifique de onde vem cada número.

**✅ Confirme:** onde você mexeria para trocar a cor de um gráfico? E para mudar como o total do mês é calculado?

### Etapa 5. Planejamento e compromissos (3 h)

**Leia:** `js/domain/budgets.js` e `js/ui/planning-tab.js` (Planejar gastos e Metas) → `goals.js` e `investments.js` → `receivables.js` com `commitments-tab.js`
(Me devem / Eu devo) → `bills.js` (contas fixas) → `advice.js` com `advice-tab.js` (os Conselhos, regras sobre os seus gastos) → `simulate.js` com `simulator.js`.

**Para entender:** cada área tem o par "regras em `domain/`" + "tela em `ui/`". Procure sempre o par.

**✍️ Exercício:** crie uma meta no app e acompanhe no código como "quanto falta" e "previsão" são calculados em `goals.js`.

**✅ Confirme:** por que os Conselhos não são "inteligência artificial"? (Leia o topo de `advice.js`.)

### Etapa 6. Salário (3 h)

**Leia:** `js/domain/salary.js` (INSS, imposto de renda, 13º, férias; as tabelas de 2026) → `salary-plan.js` → `jobs.js` (mais de um emprego) →
`js/ui/salary-calc.js` (a calculadora) → `js/ui/salary-plan.js` (o "já caiu?").

**Para entender:**
- A calculadora estima o líquido por **regime** (CLT, servidor, MEI, autônomo, PJ, estágio).
- Cada emprego tem o seu perfil; `jobs.js` só faz as contas **sobre a lista** (puro), e `salary-calc.js` guarda.

**✍️ Exercício:** calcule à mão (com as tabelas em `salary.js`) o INSS de um salário de R$ 4.900 e compare com a calculadora do app.

**✅ Confirme:** por que `migrateJobs` existe? (Dica: quem usava o app antes de "mais de um emprego".)

### Etapa 7. O que entrou nas últimas semanas (3 h)

| Tema | Domínio (as regras) | Tela |
| --- | --- | --- |
| Importar extrato (OFX, CSV, PDF) | `js/domain/statement.js` | `js/ui/import-statement.js`, `pdf-read.js` |
| Grana, o mascote | `js/domain/mascot.js` (motor de significado) | `js/ui/mascot.js`, `mascot-art.js`, `mascot-chat.js` |
| Novidades a cada atualização | `js/domain/changelog.js` | `js/ui/whats-new.js` |
| Avisos no celular (Web Push) | `js/domain/reminders.js` | `js/ui/push.js`, `sw.js`, `supabase/functions/` |
| Tela de carregamento | (nenhum) | `js/ui/splash.js` + `#splash` no `index.html` |
| Toque repetido não grava 2x | `Store.inflight` em `js/data/store.js` | `js/ui/busy.js` |
| Tema claro/escuro animado | (nenhum) | `js/ui/theme.js` |

**Para entender o mascote:** ele **não é IA generativa**. É um motor de similaridade: normaliza o texto (tira acento), reduz as palavras à raiz,
agrupa sinônimos e compara com uma base de assuntos (TF-IDF + cosseno, ideia de "quão parecidas são duas frases"). Tudo roda no seu aparelho.
Leia o comentário do topo de `js/domain/mascot.js` e depois `tests/unit/mascot.test.js` (as frases de exemplo mostram o que ele entende).

**✍️ Exercício:** no app, pergunte ao Grana "posso colocar mais de um emprego no salário?" e depois "quanto custa uma pizza?". Veja a diferença e ache no
código (função `ask`, em `js/domain/mascot.js`) as notas de corte (`0.30` e `0.18`) que decidem entre "responder", "sugerir" e "não sei".

**✅ Confirme:** por que o motor foi feito sem enviar nada para um servidor? (Dica: leia a política de privacidade do app.)

### Etapa 8. Nuvem, segurança, testes e publicação (4 h)

**Banco e segurança:** `supabase/migrations/` **em ordem de data**, começando pela `…_inicial.sql` (as tabelas e a **Row Level Security**: cada pessoa só enxerga o que é dela).
Depois `js/data/supabase.js` e `auth.js`. Leia a seção "Segurança e privacidade" do [`README.md`](../README.md).

**Testes:** `tests/e2e/lib.js` (os "ajudantes" que usam o app) e dois testes pequenos (por exemplo `73-toque-repetido.e2e.js` e `77-terceiros-celular.e2e.js`).
Rode `npm run check` e depois `npm run test:e2e`.

**Publicação:** `tools/build.js` (junta e minifica os arquivos com o esbuild, divide o código em partes) e [`docs/publicar.md`](publicar.md). O `vercel.json`
manda o Vercel rodar `npm run build` e publicar `dist/`.

**Decisões do projeto:** [`docs/CONTRATOS.md`](CONTRATOS.md) registra, área por área, "o que a tela promete e por quê". É o melhor resumo para explicar o projeto em uma entrevista.

**✅ Confirme:**
- O que é Row Level Security e por que a chave `anon` pública no código não é um vazamento?
- Para que serve cada comando: `lint`, `types`, `test`, `test:e2e`, `build`?

---

## Parte 4. Mapa: funcionalidade → arquivos

Use esta tabela quando quiser achar "onde está o código de X".

| O que você vê no app | Regras (`js/domain/`) | Tela (`js/ui/`) |
| --- | --- | --- |
| Lançar gasto/ganho, parcelas, estorno | `transactions.js`, `parser.js`, `validate.js` | `tx-list.js`, `tx-edit.js`, `tx-others.js`, `chat.js` |
| Pagou por outra pessoa / dividir | `transactions.js` (`splitShares`, `myShare`) | `tx-others.js`, `tx-list.js` (`attachOthers`) |
| Início, resumo do mês | `transactions.js`, `urgency.js` | `home-tab.js`, `dash-data.js` |
| Gráficos e detalhes do mês | `transactions.js` | `dash-charts.js`, `dash-details.js`, `charts.js` |
| Contas, cartões, faturas | `accounts.js`, `cards.js`, `brands.js`, `vouchers.js` | `accounts-tab.js`, `cards-tab.js`, `brand-picker.js` |
| Contas fixas | `bills.js` | `bills.js` |
| Planejar gastos | `budgets.js` | `planning-tab.js` |
| Metas e investimentos | `goals.js`, `investments.js` | `planning-tab.js` |
| Me devem / Eu devo, cobranças | `receivables.js` | `commitments-tab.js`, `share-charge.js`, `shared-sync.js` |
| Conselhos | `advice.js` | `advice-tab.js` |
| Simular | `simulate.js` | `simulator.js` |
| Salário e "já caiu?" | `salary.js`, `salary-plan.js`, `jobs.js`, `forecasts.js` | `salary-calc.js`, `salary-plan.js` |
| Importar extrato | `statement.js` | `import-statement.js`, `pdf-read.js` |
| Relatórios e PDF | (usa as regras acima) | `reports.js`, `pdf.js` |
| Grana, o mascote | `mascot.js` | `mascot.js`, `mascot-art.js`, `mascot-chat.js` |
| Novidades | `changelog.js` | `whats-new.js` |
| Avisos no celular | `reminders.js` | `push.js` |
| Login, conta, senha | `auth.js` (em `js/data/`) | `online.js`, `password.js`, `captcha.js`, `landing.js` |
| Perfil, backup, exclusão de conta | `backup.js` (em `js/data/`) | `profile.js`, `my-data.js` |
| Tutorial e ajuda | — | `tutorial.js`, `learn-tab.js`, `feedback.js` |
| Painel de administração | — | `admin.js` |
| Tema claro/escuro | — | `theme.js` |
| Tela de carregamento | — | `splash.js` |

---

## Parte 5. Mudar algo com segurança, e projetos para praticar

### O ciclo de trabalho do projeto

1. **Crie uma ramificação** (opcional para estudo): `git switch -c meu-estudo`.
2. **Mude pouco** e rode o teste mais perto: `node --test tests/unit/arquivo.test.js`.
3. `npm run check` (estilo + tipos + todos os testes das regras).
4. Se mexeu em tela: `node tests/e2e/run.js 77` (o número do teste) ou `npm run test:e2e` (todos).
5. Se criou um arquivo novo em `js/`: `npm run sw:update` (atualiza a lista do service worker).
6. `git diff` para rever, e só então `git commit`.
7. **Nunca** coloque senhas ou chaves secretas no código (a chave `anon` do Supabase é pública de propósito; a `service_role` **jamais**).

### Projetos para praticar (do mais fácil ao mais difícil)

1. **Trocar um texto.** Mude uma frase em `index.html` e veja na tela. (Pratica: HTML, DOM.)
2. **Nova pergunta para o Grana.** Em `js/domain/mascot.js`, adicione uma frase de exemplo a um assunto e confirme com um teste em `tests/unit/mascot.test.js`.
   Atenção: o motor é sensível; rode `npm run check` para ver se você "confundiu" outro assunto. (Pratica: arrays, testes.)
3. **Nova novidade.** Em `js/domain/changelog.js`, acrescente uma entrada **no topo** (id com data maior que a anterior) e veja o popup de novidades. (Pratica: objetos, regras do projeto.)
4. **Nova função pura.** Crie `ehFimDeSemana(dataTexto)` em `js/domain/dates.js` (`'2026-11-21'` → `true`) **com testes primeiro** (escreva o teste, veja falhar, depois o código).
   (Pratica: funções, datas, testes.)
5. **Nova categoria padrão.** Leia `js/domain/categories.js` e adicione uma, conferindo onde ela aparece (formulário, gráficos, Planejar). (Pratica: seguir um dado pelas camadas.)
6. **Mini-feature.** Mostre no Início "maior gasto do mês" (cálculo em `domain/`, texto em `home-tab.js`, teste unitário e um e2e). (Pratica: tudo.)

Para cada um, escreva em **3 linhas** o que mudou e por que funciona. Se conseguir explicar, aprendeu.

### Quando algo quebrar

- **Leia a mensagem de erro de baixo para cima:** a linha com o nome de um arquivo seu (`js/...`) é a pista.
- No navegador, o erro aparece em vermelho no **Console** (F12), com o arquivo e a linha clicáveis.
- Use `console.log(variavel)` para "espiar" valores. Coloque, rode, e **tire** depois.
- Volte atrás sem medo: `git restore arquivo` desfaz as mudanças não salvas de um arquivo; `git log` e `git diff` mostram a história.

---

## Parte 6. Glossário

| Termo | Em português simples |
| --- | --- |
| **Algoritmo** | Um passo a passo para resolver um problema |
| **API** | Uma "tomada" para dois programas conversarem |
| **Array** | Uma lista numerada |
| **Async / await** | Jeito de escrever "espere isto terminar" sem travar a tela |
| **Backend / frontend** | Parte que roda no servidor / parte que roda no navegador |
| **Build** | Montar o site final (juntar e comprimir arquivos) |
| **Callback** | Uma função entregue a outra para ser chamada depois |
| **CSS** | A linguagem da aparência |
| **DOM** | A página como objetos que o JavaScript pode mexer |
| **E2E (ponta a ponta)** | Teste que usa o app como uma pessoa usaria |
| **ES modules** | O sistema de `import` e `export` |
| **Evento** | Algo que acontece (clique, tecla, envio de formulário) |
| **Função pura** | Função que só depende do que recebe e só devolve um resultado |
| **Git / commit** | Histórico de mudanças / uma "foto" salva dele |
| **JSON** | Texto que descreve objetos e listas |
| **Lint** | Corretor automático de estilo e erros comuns |
| **Migração** | Um passo versionado de mudança no banco de dados |
| **npm** | O gerenciador das ferramentas do projeto |
| **Objeto** | Um conjunto de "etiqueta: valor" |
| **Promise** | Uma promessa de resultado que ainda vai chegar |
| **PWA** | Site que se comporta como aplicativo |
| **RLS (Row Level Security)** | Regra do banco que deixa cada pessoa ver só as próprias linhas |
| **Service worker** | Um "porteiro" que guarda uma cópia do app para funcionar sem internet |
| **Supabase** | Banco de dados na nuvem com login pronto |
| **Teste unitário** | Teste de uma função pequena e isolada |
| **TF-IDF** | Jeito de dar peso às palavras mais "informativas" de um texto |
| **Tipo (TypeScript)** | Etiqueta que diz o que cada valor deve ser; aqui só confere, o código segue JavaScript |
| **XSS** | Ataque que injeta código num texto digitado; a defesa é `escapeHtml` |

---

## Cronograma sugerido (4 semanas, 2 h por dia útil)

| Semana | Foco | Entrega |
| --- | --- | --- |
| 1 | Partes 0, 1 e lições 1 a 7 | Explicar `map/filter/reduce` e por que dinheiro é em centavos |
| 2 | Lições 8 a 15 e Etapa 1 | Desenhar o caminho de uma gravação (clique → Store) |
| 3 | Etapas 2 a 5 | Prever a fatura de uma compra e explicar "total × realmente meu" |
| 4 | Etapas 6 a 8 e um projeto da Parte 5 | Apresentar o projeto em 5 minutos (arquitetura + uma decisão que você achou boa) |

**Dica final:** guarde um caderno (ou um arquivo de notas) com "o que aprendi hoje" e "o que ainda não entendi". Quando a dúvida
aparecer, é só trazer o arquivo e a linha exata: a pergunta mais fácil de responder é a que tem um trecho de código junto.
