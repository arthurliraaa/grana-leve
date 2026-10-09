/*
 * Dinheiro. Os valores ficam guardados em reais com no máximo 2 casas (sempre passam por money()),
 * e toda soma é feita em centavos inteiros, para não acumular erro de ponto flutuante
 * (0,1 + 0,2 em reais dá 0,30000000000000004; em centavos dá 30).
 */
var currencyFmt = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});

export function toCents(v){ var n = Math.round(Number(v) * 100); return isFinite(n) ? n : 0; }
export function fromCents(c){ return c / 100; }
// Arredonda para centavos. Valores inválidos viram 0.
export function money(v){ return fromCents(toCents(v)); }
export function sumMoney(list, fn){
  return fromCents(list.reduce(function(s, x){ return s + toCents(fn ? fn(x) : x); }, 0));
}
export function fmtMoney(v){ return currencyFmt.format(Number(v) || 0); }

// Divide um valor em n partes iguais em centavos; o que sobra da divisão vai na 1ª parte.
// Ex.: R$ 100,00 em 3x -> [33,34; 33,33; 33,33].
export function splitAmount(amount, n){
  var cents = toCents(amount), base = Math.floor(cents / n), first = cents - base * (n - 1);
  var out = [];
  for (var i = 0; i < n; i++) out.push(fromCents(i === 0 ? first : base));
  return out;
}
