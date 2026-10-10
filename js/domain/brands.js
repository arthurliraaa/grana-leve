/*
 * Visual de cartões e contas: cor do banco e um selo com as iniciais (não usamos os logotipos,
 * que são marcas registradas). Cores aproximadas das cores oficiais; a pessoa pode trocar.
 * Campos opcionais no registro: bank ('' = descobrir pelo nome, 'none' = sem banco, ou o id),
 * color ('#rrggbb' personalizada) e mark (até 3 caracteres: letras ou emoji).
 */
export var BANKS = [
  {id: 'nubank', name: 'Nubank', mark: 'Nu', color: '#820ad1', match: /\b(nubank|nu ?bank|nu|roxinho)\b/},
  {id: 'inter', name: 'Inter', mark: 'In', color: '#ff7a00', match: /\b(banco )?inter\b/},
  {id: 'itau', name: 'Itaú', mark: 'It', color: '#ec7000', match: /\b(itau|personnalite|iti)\b/},
  {id: 'bradesco', name: 'Bradesco', mark: 'Br', color: '#cc092f', match: /\bbradesco\b/},
  {id: 'bb', name: 'Banco do Brasil', mark: 'BB', color: '#fcd116', match: /\b(banco do brasil|bb|ourocard)\b/},
  {id: 'caixa', name: 'Caixa', mark: 'Cx', color: '#005ca9', match: /\b(caixa|cef)\b/},
  {id: 'santander', name: 'Santander', mark: 'Sa', color: '#ec0000', match: /\bsantander\b/},
  {id: 'c6', name: 'C6 Bank', mark: 'C6', color: '#242424', match: /\bc6\b/},
  {id: 'picpay', name: 'PicPay', mark: 'PP', color: '#21c25e', match: /\bpic ?pay\b/},
  {id: 'mercadopago', name: 'Mercado Pago', mark: 'MP', color: '#00b1ea', match: /\b(mercado ?pago|mercado ?livre)\b/},
  {id: 'pagbank', name: 'PagBank', mark: 'PB', color: '#1bb99a', match: /\b(pagbank|pagseguro)\b/},
  {id: 'neon', name: 'Neon', mark: 'Ne', color: '#0db5e6', match: /\bneon\b/},
  {id: 'btg', name: 'BTG Pactual', mark: 'BTG', color: '#0b2c5a', match: /\bbtg\b/},
  {id: 'xp', name: 'XP', mark: 'XP', color: '#111111', match: /\bxp\b/},
  {id: 'sicoob', name: 'Sicoob', mark: 'Sc', color: '#003641', match: /\bsicoob\b/},
  {id: 'sicredi', name: 'Sicredi', mark: 'Si', color: '#33a02c', match: /\bsicredi\b/},
  {id: 'will', name: 'Will Bank', mark: 'Wi', color: '#ffd500', match: /\bwill ?bank\b/}
];

function plain(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

export function bankById(id){ return BANKS.filter(function(b){ return b.id === id; })[0] || null; }
export function detectBank(name){
  var n = plain(name);
  return BANKS.filter(function(b){ return b.match.test(n); })[0] || null;
}
export function initials(name){
  var words = String(name || '').trim().split(/\s+/).filter(function(w){ return /[\p{L}\p{N}]/u.test(w); });
  if (!words.length) return '?';
  var first = Array.from(words[0]);
  var s = words.length > 1 ? first[0] + Array.from(words[1])[0] : first.slice(0, 2).join('');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Até 3 "letras" visíveis (um emoji conta como uma).
export function cleanMark(s){
  var parts = typeof Intl !== 'undefined' && Intl.Segmenter ? Array.from(new Intl.Segmenter('pt', {granularity: 'grapheme'}).segment(String(s || '').trim()), function(x){ return x.segment; }) : Array.from(String(s || '').trim());
  return parts.filter(function(p){ return p.trim(); }).slice(0, 3).join('');
}
export function validColor(c){ return /^#[0-9a-f]{6}$/i.test(String(c || '')); }

function luminance(hex){
  var v = [1, 3, 5].map(function(i){
    var c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function contrastRatio(a, b){
  var la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Texto branco ou quase preto, o que der mais contraste com o fundo.
export function textOn(hex){ return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#1a1a1a') ? '#ffffff' : '#1a1a1a'; }
// Tom mais escuro da mesma cor, para o degradê do cartão.
export function darker(hex, amount){
  return '#' + [1, 3, 5].map(function(i){
    var c = Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount));
    return ('0' + c.toString(16)).slice(-2);
  }).join('');
}

// Visual final: {bank, color (null = cor padrão do app), text, mark, auto (veio do nome?)}
export function lookOf(item){
  item = item || {};
  var bank = item.bank === 'none' ? null : (bankById(item.bank) || detectBank(item.name));
  var color = validColor(item.color) ? item.color.toLowerCase() : (bank ? bank.color : null);
  return {
    bank: bank,
    auto: !item.bank && !!bank,
    color: color,
    text: color ? textOn(color) : null,
    mark: cleanMark(item.mark) || (bank ? bank.mark : initials(item.name))
  };
}

// Tom mais claro da mesma cor.
export function lighter(hex, amount){
  return '#' + [1, 3, 5].map(function(i){
    var c = parseInt(hex.slice(i, i + 2), 16);
    return ('0' + Math.round(c + (255 - c) * amount).toString(16)).slice(-2);
  }).join('');
}

// Fundo em degradê do cartão com texto legível nas duas pontas: com texto escuro o degradê
// clareia, com texto branco ele escurece (assim o contraste nunca piora).
export function cardPaint(color){
  var text = textOn(color);
  var to = text === '#ffffff' ? darker(color, 0.22) : lighter(color, 0.18);
  return {from: color, to: to, text: text, contrast: Math.min(contrastRatio(color, text), contrastRatio(to, text))};
}
