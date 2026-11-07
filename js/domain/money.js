/*
 * Dinheiro. Os valores ficam guardados em reais com no máximo 2 casas (sempre passam por money()),
 * e toda soma é feita em centavos inteiros, para não acumular erro de ponto flutuante
 * (0,1 + 0,2 em reais dá 0,30000000000000004; em centavos dá 30).
 */
var currencyFmt = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});

// v*100 em binário pode cair logo abaixo do meio centavo (1,005*100 = 100,49999…). Esticar o módulo
// em 4 ulps antes de arredondar tira esse ruído (rápido: sem toPrecision); o meio centavo vai para
// longe do zero (1,005 → 1,01; −1,005 → −1,01). Entrada inválida vira 0, e nunca devolve −0.
export function toCents(v){
  var x = Number(v);
  if (!isFinite(x)) return 0;
  var n = Math.round(Math.abs(x) * 100 * (1 + 4 * Number.EPSILON));
  return x < 0 && n ? -n : n;
}
export function fromCents(c){ return c / 100; }
// Arredonda para centavos. Valores inválidos viram 0.
export function money(v){ return fromCents(toCents(v)); }
export function sumMoney(list, fn){
  return fromCents(list.reduce(function(s, x){ return s + toCents(fn ? fn(x) : x); }, 0));
}
export function fmtMoney(v){ return currencyFmt.format(Number(v) || 0); }

// Divide um valor em n partes iguais em centavos; o que sobra da divisão vai na 1ª parte.
// Ex.: R$ 100,00 em 3x -> [33,34; 33,33; 33,33]. Valor negativo divide o módulo e aplica o sinal
// (−10 em 3x -> [−3,34; −3,33; −3,33]).
export function splitAmount(amount, n){
  var cents = toCents(amount), sign = cents < 0 ? -1 : 1, abs = Math.abs(cents);
  var base = Math.floor(abs / n), first = abs - base * (n - 1);
  var out = [];
  for (var i = 0; i < n; i++){ var c = i === 0 ? first : base; out.push(fromCents(c && sign * c)); }
  return out;
}

// Valor digitado num campo de dinheiro, no jeito brasileiro ou não: "1.500,00", "1500,5", "32.50",
// "R$ 1.500" ou "-20". Devolve o número em texto com ponto ("1500.00"), '' se estiver vazio, ou
// 'NaN' se não der para entender (o formulário mostra "informe o valor").
// Com vírgula, ela é a casa decimal e os pontos separam milhares. Sem vírgula, pontos em grupos de
// 3 dígitos são milhares ("1.500" = 1500) e um ponto com 1 ou 2 dígitos depois é decimal ("32.5").
export function parseMoneyText(raw){
  var s = String(raw == null ? '' : raw).replace(/\s+/g, '').replace(/^r\$/i, '').replace(/^-r\$/i, '-');
  if (!s) return '';
  var neg = s.charAt(0) === '-';
  if (neg) s = s.slice(1);
  var m;
  if (s.indexOf(',') >= 0){
    // 1.500,00 | 1500,5 | ,50
    m = /^(\d{1,3}(?:\.\d{3})+|\d*),(\d{1,2})$/.exec(s);
    if (!m) return 'NaN';
    s = (m[1].replace(/\./g, '') || '0') + '.' + m[2];
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)){
    s = s.replace(/\./g, '');          // 1.500 | 12.345.678
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)){
    return 'NaN';                      // 1.5.6, 12abc, 3.456 7
  }
  if (s.charAt(0) === '.') s = '0' + s;
  return (neg ? '-' : '') + s;
}
// Número para mostrar no campo: 1500 -> "1.500,00". Texto que não é número fica como está.
var inputFmt = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
export function formatMoneyInput(v){
  if (v === '' || v == null) return '';
  var n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) && String(v).trim() !== '' ? inputFmt.format(n) : String(v);
}
