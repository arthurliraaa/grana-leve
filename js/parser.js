/*
 * GranaParser: entende frases como "gastei 32,50 no mercado" ou
 * "recebi 1.500 de salário ontem" e devolve lançamentos estruturados.
 *
 * Não depende do navegador: o mesmo arquivo pode ser usado no futuro
 * servidor do WhatsApp (Node: const GranaParser = require('./parser.js')).
 */
(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GranaParser = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  "use strict";

  var EXPENSE_WORDS = /\b(gastei|gasto|gastos|paguei|pagar|pago|comprei|compra|compras|torrei|saiu|sa[ií]ram|debitou|conta de)\b/;
  var INCOME_WORDS = /\b(recebi|receb[ie]|ganhei|ganho|entrou|entraram|caiu|ca[ií]ram|vendi|me pagou|me pagaram|depositaram|sal[aá]rio)\b/;
  var NOTHING = /^\s*(n[aã]o|nada|nenhum[a]?|n[aã]o tive|sem gastos?|nops?|negativo)\b/;

  // Palavra-chave -> categoria. A primeira que aparecer no texto vence.
  var EXPENSE_KEYWORDS = [
    ['alimentacao', ['mercado','supermercado','almo[cç]o','jantar','janta','lanche','ifood','restaurante','padaria','comida','pizza','hamb[uú]rguer','caf[eé]','feira','a[cç]ougue','delivery','marmita','sorvete','p[aã]o']],
    ['transporte', ['uber','99','[oô]nibus','gasolina','combust[ií]vel','metr[oô]','passagem','estacionamento','t[aá]xi','bilhete','ped[aá]gio','oficina']],
    ['moradia', ['aluguel','luz','energia','[aá]gua','condom[ií]nio','internet','g[aá]s','iptu','reforma']],
    ['lazer', ['cinema','show','bar','festa','netflix','spotify','streaming','viagem','jogo','game','ingresso','balada','cerveja']],
    ['saude', ['farm[aá]cia','rem[eé]dio','m[eé]dico','consulta','dentista','exame','plano de sa[uú]de','academia','terapia']],
    ['educacao', ['curso','faculdade','livro','escola','mensalidade','material escolar','apostila']],
    ['compras', ['roupa','t[eê]nis','sapato','shopping','presente','amazon','shopee','mercado livre','celular','eletr[oô]nico','maquiagem']]
  ];
  var INCOME_KEYWORDS = [
    ['salario', ['sal[aá]rio','pagamento do trabalho','holerite']],
    ['freelance', ['freela','freelance','bico','extra','servi[cç]o','trabalho','venda','vendi']],
    ['presente', ['presente','mesada','ajuda','pix da m[aã]e','pix do pai']],
    ['recebimento', ['me pagou','me pagaram','devolveu','emprest']]
  ];

  function norm(s){ return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function dateKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }

  // "1.500,00" -> 1500 | "32,50" -> 32.5 | "32.50" -> 32.5 | "2 mil" -> 2000 | "R$ 40" -> 40
  var AMOUNT_RE = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*mil\b)?\s*(?:reais|real|conto|contos|pila|r\$)?/i;
  function parseAmount(text){
    var m = AMOUNT_RE.exec(text);
    if (!m) return null;
    var raw = m[1], value;
    if (/\.\d{3}/.test(raw)) value = Number(raw.replace(/\./g, '').replace(',', '.'));
    else value = Number(raw.replace(',', '.'));
    if (m[2]) value *= 1000;
    if (!isFinite(value) || value <= 0) return null;
    return {value: Math.round(value * 100) / 100, index: m.index, length: m[0].length};
  }

  function parseDate(text, today){
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (/\banteontem\b/.test(text)){ d.setDate(d.getDate() - 2); return dateKey(d); }
    if (/\bontem\b/.test(text)){ d.setDate(d.getDate() - 1); return dateKey(d); }
    var m = /\bdia (\d{1,2})\b/.exec(text);
    if (m){
      var day = Number(m[1]);
      if (day >= 1 && day <= 31){
        var c = new Date(d.getFullYear(), d.getMonth(), day);
        if (c > d) c = new Date(d.getFullYear(), d.getMonth() - 1, day);
        return dateKey(c);
      }
    }
    return dateKey(d);
  }

  function findCategory(text, table){
    var best = null;
    table.forEach(function(entry){
      entry[1].forEach(function(word){
        var re = new RegExp('(^|[^a-zà-ú0-9])' + word + '($|[^a-zà-ú0-9])');
        var m = re.exec(text);
        if (m && (best === null || m.index < best.index)) best = {id: entry[0], index: m.index, word: m[0].trim()};
      });
    });
    return best;
  }

  function findPayment(text){
    if (/\b(no |do |com o |pelo )?cart[aã]o\b|\bcr[eé]dito\b|\bparcel/.test(text)) return 'cartao';
    if (/\b(vale|vr|va|ticket|alelo|sodexo|flash)\b/.test(text)) return 'vale';
    if (/\b(pix|d[eé]bito|dinheiro|esp[eé]cie)\b/.test(text)) return 'conta';
    return null;
  }

  // Tira verbos, valor, datas e conectores para sobrar uma descrição curta.
  // Trabalha por palavras porque o \b do JavaScript não entende letras acentuadas.
  var STOP = ('gastei gasto gastos paguei pagar pago comprei compra compras torrei saiu saíram sairam debitou ' +
    'recebi recebe ganhei ganho entrou entraram caiu caíram cairam vendi pagou pagaram depositaram me ' +
    'hoje ontem anteontem dia reais real r$ conto contos pila mil eu com de do da dos das no na nos nas em um uma ' +
    'pra para o a os as cartão cartao crédito credito débito debito pix vale também tambem mais foi').split(' ');
  function describe(text, amount){
    var s = text;
    if (amount) s = s.slice(0, amount.index) + ' ' + s.slice(amount.index + amount.length);
    var words = s.replace(/[^0-9a-zà-ú\s$-]/g, ' ').split(/\s+/).filter(function(w){
      return w && STOP.indexOf(w) < 0 && !/^\d+$/.test(w);
    });
    if (!words.length) return '';
    s = words.join(' ').slice(0, 60);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Divide "gastei 30 no mercado e 20 no uber" em duas partes, cada uma com seu valor.
  function splitItems(text){
    // A vírgula só separa itens quando vem seguida de espaço ("32,50" é um valor só).
    var parts = text.split(/\s*(?:,(?=\s)|;|(?<![0-9a-zà-ú])(?:e|tamb[eé]m|mais)(?![0-9a-zà-ú]))\s*/);
    var items = [], carry = '';
    parts.forEach(function(p){
      if (!p) return;
      if (parseAmount(p)){ items.push(carry ? carry + ' ' + p : p); carry = ''; }
      else if (items.length) items[items.length - 1] += ' ' + p;
      else carry += (carry ? ' ' : '') + p;
    });
    if (carry && items.length) items[items.length - 1] += ' ' + carry;
    return items;
  }

  /**
   * parse(texto, {today: Date}) ->
   *   {nothing: true}                         quando a pessoa diz que não teve nada
   *   {items: [{type, amount, category, description, date, paymentMethod}]}
   *   {error: 'mensagem'}                     quando não deu para entender
   */
  function parse(input, opts){
    opts = opts || {};
    var today = opts.today || new Date();
    var text = norm(input);
    if (!text) return {error: 'Escreva o que aconteceu, por exemplo: “gastei 30 no mercado”.'};
    if (NOTHING.test(text) && !parseAmount(text)) return {nothing: true};

    var chunks = splitItems(text);
    if (!chunks.length) return {error: 'Não encontrei o valor. Tente algo como “gastei 25 no almoço” ou “recebi 1.500 de salário”.'};

    var lastType = null, lastPayment = null, items = [];
    var globalDate = parseDate(text, today);
    chunks.forEach(function(chunk){
      var amount = parseAmount(chunk);
      var isIncome = INCOME_WORDS.test(chunk), isExpense = EXPENSE_WORDS.test(chunk);
      var type = isIncome && !isExpense ? 'income' : isExpense ? 'expense' : (lastType || (INCOME_WORDS.test(text) && !EXPENSE_WORDS.test(text) ? 'income' : 'expense'));
      lastType = type;
      var cat = findCategory(chunk, type === 'income' ? INCOME_KEYWORDS : EXPENSE_KEYWORDS);
      var payment = type === 'expense' ? (findPayment(chunk) || lastPayment) : null;
      if (type === 'expense') lastPayment = payment;
      var hasOwnDate = /\b(hoje|ontem|anteontem|dia \d{1,2})\b/.test(chunk);
      items.push({
        type: type,
        amount: amount.value,
        category: cat ? cat.id : (type === 'income' ? 'outros_receita' : 'outros'),
        description: describe(chunk, amount) || (cat ? cat.word.charAt(0).toUpperCase() + cat.word.slice(1) : ''),
        date: hasOwnDate ? parseDate(chunk, today) : globalDate,
        paymentMethod: payment
      });
    });
    return {items: items};
  }

  return {parse: parse, parseAmount: parseAmount};
});
