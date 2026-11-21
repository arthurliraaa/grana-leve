/*
 * Importação de extratos: lê OFX (1.x em SGML e 2.x em XML) e CSV de bancos brasileiros e devolve itens padronizados
 *   {id, date: 'AAAA-MM-DD', amount (com sinal: negativo = saiu dinheiro), name}
 * e, a partir deles, os rascunhos que a pessoa confere antes de gravar (categoria sugerida, duplicados, o que ignorar).
 * Só contas puras: nada de tela nem de acesso ao navegador (o arquivo chega como bytes ou texto).
 */
import {money} from './money.js';
import {categoryFromText} from './parser.js';
import {FALLBACK_CATEGORY} from './categories.js';

export var MAX_BYTES = 2 * 1024 * 1024;
export var MAX_ITEMS = 3000;

// Bytes do arquivo → texto. Tenta UTF-8 (que também serve para ASCII); se não for, é Windows-1252, comum em OFX antigo.
export function decodeBytes(bytes){
  var text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch(e){ text = new TextDecoder('windows-1252').decode(bytes); }
  return text.replace(/^﻿/, '');
}

/* ---------- números e datas ---------- */

// "R$ 1.234,56", "-1234.56", "(45,00)", "45,00-" → número (negativo quando a pessoa pagou). NaN se não for valor.
// dotIsDecimal: no OFX o ponto é sempre decimal. No CSV brasileiro "1.234" (três dígitos depois do ponto) é milhar.
export function parseAmountText(raw, dotIsDecimal){
  var s = String(raw == null ? '' : raw).replace(/R\$| |\s/g, '');
  if (!s) return NaN;
  var neg = false;
  if (/^\(.*\)$/.test(s)){ neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)){ neg = true; s = s.slice(0, -1); }
  if (/^-/.test(s)){ neg = true; s = s.slice(1); }
  if (/^\+/.test(s)) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  var commas = (s.match(/,/g) || []).length, dots = (s.match(/\./g) || []).length, dec = '';
  if (commas && dots) dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
  else if (commas) dec = commas === 1 ? ',' : '';
  else if (dots === 1) dec = (dotIsDecimal || s.length - s.indexOf('.') - 1 !== 3) ? '.' : '';
  var out = dec ? s.slice(0, s.lastIndexOf(dec)).replace(/[.,]/g, '') + '.' + s.slice(s.lastIndexOf(dec) + 1) : s.replace(/[.,]/g, '');
  var n = Number(out);
  if (!isFinite(n)) return NaN;
  return money(neg ? -n : n);
}

function realDate(y, m, d){
  var dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 1990 && y <= 2100;
}
function iso(y, m, d){ return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
// 20261105, 2026-11-05, 05/11/2026, 05-11-26, 05.11.2026 → 'AAAA-MM-DD' ('' se não for data). Dia/mês no jeito brasileiro; se o mês
// vier maior que 12 (e o dia não), entende como mês/dia.
export function parseDateText(raw){
  var s = String(raw == null ? '' : raw).trim(), m;
  if ((m = s.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})(?!\d)/))){ var y0 = +m[1], mo0 = +m[2], d0 = +m[3]; return realDate(y0, mo0, d0) ? iso(y0, mo0, d0) : ''; }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/))){
    var a = +m[1], b = +m[2], y = +m[3]; if (m[3].length === 2) y += 2000;
    if (b > 12 && a <= 12){ var t = a; a = b; b = t; }
    return realDate(y, b, a) ? iso(y, b, a) : '';
  }
  return '';
}

/* ---------- OFX ---------- */

function unescapeXml(s){
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&');
}
function ofxTag(block, name){
  var m = block.match(new RegExp('<' + name + '>([^<\\r\\n]*)', 'i'));
  return m ? unescapeXml(m[1].trim()) : '';
}
function joinDescription(name, memo){
  if (name && memo) return memo.toLowerCase().indexOf(name.toLowerCase()) >= 0 ? memo : name + ' - ' + memo;
  return memo || name || '';
}
// OFX → {kind: 'bank' | 'card' | 'unknown', accountId, items, skipped}. kind 'card' é extrato de cartão de crédito.
export function parseOfx(text){
  var t = String(text || '').replace(/\r/g, '\n');
  var kind = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(t) ? 'card' : /<STMTRS>|<BANKMSGSRSV1>|<STMTTRN>/i.test(t) ? 'bank' : 'unknown';
  var accountId = ofxTag(t, 'ACCTID'), items = [], skipped = 0;
  t.split(/<STMTTRN>/i).slice(1).forEach(function(chunk){
    var b = chunk.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<LEDGERBAL>|<\/CCSTMTRS>|<\/STMTRS>/i)[0];
    var date = parseDateText(ofxTag(b, 'DTPOSTED').slice(0, 8)), amount = parseAmountText(ofxTag(b, 'TRNAMT'), true);
    if (!date || !isFinite(amount) || amount === 0){ skipped++; return; }
    items.push({id: ofxTag(b, 'FITID'), date: date, amount: amount, name: joinDescription(ofxTag(b, 'NAME'), ofxTag(b, 'MEMO')).slice(0, 100)});
  });
  return {kind: kind, accountId: accountId, items: items, skipped: skipped};
}

/* ---------- CSV ---------- */

function splitCsv(text, delim){
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++){
    var c = text[i];
    if (q){
      if (c === '"'){ if (text[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim){ row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r'){
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(function(x){ return x !== ''; })) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(function(x){ return x !== ''; })) rows.push(row);
  return rows;
}
function detectDelimiter(text){
  var lines = text.split(/\r?\n/).filter(function(l){ return l.trim(); }).slice(0, 8), best = ';', top = 0;
  [';', '\t', ','].forEach(function(d){
    var n = lines.reduce(function(sum, l){ return sum + (l.replace(/"[^"]*"/g, '').split(d).length - 1); }, 0);
    if (n > top){ top = n; best = d; }
  });
  return best;
}
export function parseCsv(text){
  var t = String(text || '').replace(/^﻿/, ''), delim = detectDelimiter(t);
  return {delimiter: delim, rows: splitCsv(t, delim)};
}

var H_DESC = /descri|hist[oó]rico|t[ií]tulo|title|estabelec|lan[cç]amento|memo|detalhe|benefici[aá]rio|nome/i;
var H_AMOUNT = /valor|amount|quantia|montante/i;
var H_DEBIT = /d[eé]bito|sa[ií]da|retirada|debit/i;
var H_CREDIT = /cr[eé]dito|entrada|dep[oó]sito|credit/i;
var H_BALANCE = /saldo|balance/i;

// Descobre as colunas de um CSV de banco: data, descrição, valor (ou débito e crédito) e se o sinal vem invertido (fatura de
// cartão em que o positivo é compra). Devolve também a linha do cabeçalho, se houver, e as linhas de dados.
export function detectCsvLayout(rows){
  var width = rows.reduce(function(w, r){ return Math.max(w, r.length); }, 0), dateCol = -1, bestScore = 0;
  if (width < 2 || rows.length < 1) return null;
  for (var c = 0; c < width; c++){
    var hits = rows.filter(function(r){ return parseDateText(r[c]); }).length;
    if (hits > bestScore){ bestScore = hits; dateCol = c; }
  }
  if (dateCol < 0 || bestScore < 1) return null;
  var first = -1;
  for (var i = 0; i < rows.length; i++){ if (parseDateText(rows[i][dateCol])){ first = i; break; } }
  var header = first > 0 && !rows[first - 1].some(function(x){ return isFinite(parseAmountText(x)) || parseDateText(x); }) ? rows[first - 1] : null;
  var data = rows.slice(first).filter(function(r){ return parseDateText(r[dateCol]); });
  var map = {date: dateCol, desc: -1, amount: -1, debit: -1, credit: -1}, names = header || [];
  names.forEach(function(h, idx){
    if (idx === dateCol || H_BALANCE.test(h)) return;
    if (map.debit < 0 && H_DEBIT.test(h)) map.debit = idx;
    else if (map.credit < 0 && H_CREDIT.test(h)) map.credit = idx;
    else if (map.amount < 0 && H_AMOUNT.test(h)) map.amount = idx;
    else if (map.desc < 0 && H_DESC.test(h)) map.desc = idx;
  });
  var numeric = function(col){ return data.filter(function(r){ return isFinite(parseAmountText(r[col])) && !parseDateText(r[col]); }).length; };
  if (map.amount < 0 && !(map.debit >= 0 && map.credit >= 0)){
    var bestN = 0;
    for (var k = 0; k < width; k++){
      if (k === dateCol || k === map.desc || k === map.debit || k === map.credit || (names[k] && H_BALANCE.test(names[k]))) continue;
      var n = numeric(k); if (n > bestN){ bestN = n; map.amount = k; }
    }
  }
  if (map.desc < 0){
    var bestLen = 0;
    for (var j = 0; j < width; j++){
      if (j === dateCol || j === map.amount || j === map.debit || j === map.credit || (names[j] && H_BALANCE.test(names[j]))) continue;
      var len = data.reduce(function(s, r){ return s + (isFinite(parseAmountText(r[j])) ? 0 : String(r[j] || '').length); }, 0);
      if (len > bestLen){ bestLen = len; map.desc = j; }
    }
  }
  if (map.amount < 0 && map.debit < 0 && map.credit < 0) return null;
  var joined = names.join(' ').toLowerCase();
  // Exportação de cartão (Nubank: data, categoria, título, valor): compra é positiva; pagamento da fatura é negativo.
  var invert = /t[ií]tulo|title/.test(joined) && /categoria|category/.test(joined) && map.amount >= 0 && map.debit < 0;
  return {delimiter: null, header: header, map: map, invert: invert, rows: data};
}

// CSV + colunas escolhidas → itens padronizados.
export function csvItems(layout, map, invert){
  var items = [], skipped = 0;
  layout.rows.forEach(function(r){
    var date = parseDateText(r[map.date]), amount = NaN;
    if (map.debit >= 0 || map.credit >= 0){
      var d = map.debit >= 0 ? parseAmountText(r[map.debit]) : NaN, c = map.credit >= 0 ? parseAmountText(r[map.credit]) : NaN;
      amount = money((isFinite(c) ? Math.abs(c) : 0) - (isFinite(d) ? Math.abs(d) : 0));
      if (!isFinite(d) && !isFinite(c)) amount = NaN;
    } else if (map.amount >= 0) amount = parseAmountText(r[map.amount]);
    if (!date || !isFinite(amount) || amount === 0){ skipped++; return; }
    items.push({id: '', date: date, amount: invert ? money(-amount) : amount, name: String(map.desc >= 0 ? r[map.desc] || '' : '').slice(0, 100)});
  });
  return {items: items, skipped: skipped};
}

/* ---------- rascunhos para conferir ---------- */

function words(text){ return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(function(w){ return w.length > 2; }); }
// Chave de uma descrição de banco: as primeiras palavras sem números ("COMPRA MERCADO XYZ 1234" e "COMPRA MERCADO XYZ 5678" batem).
export function descriptionKey(text){ return words(text).slice(0, 3).join(' '); }
// Categorias que a pessoa já usou para cada descrição: {expense: {chave: categoria}, income: {...}} (a mais usada).
export function learnCategories(transactions){
  var counts = {expense: {}, income: {}};
  (transactions || []).forEach(function(t){
    if (!t.description || !t.category || t.reversal || (t.type !== 'expense' && t.type !== 'income')) return;
    var key = descriptionKey(t.description); if (!key) return;
    var m = counts[t.type][key] = counts[t.type][key] || {};
    m[t.category] = (m[t.category] || 0) + 1;
  });
  var out = {expense: {}, income: {}};
  ['expense', 'income'].forEach(function(type){
    Object.keys(counts[type]).forEach(function(key){
      var best = '', n = 0; Object.keys(counts[type][key]).forEach(function(cat){ if (counts[type][key][cat] > n){ n = counts[type][key][cat]; best = cat; } });
      out[type][key] = best;
    });
  });
  return out;
}
// Pagamento da própria fatura aparece no extrato do cartão como crédito: não é ganho.
var CARD_PAYMENT = /pagamento (recebido|de fatura|efetuado|fatura)|pgto\.? ?(de )?fatura|fatura paga|pagto fatura/i;

export function externalIdOf(item, accountId){ return item.id ? 'ofx:' + (accountId || '') + ':' + item.id : ''; }

// Rascunhos: {key, id, externalId, date, type, amount (positivo), description, category, dup: '' | 'imported' | 'similar', ignore: '' | motivo, checked}.
// opts: {accountId, isCard, existing: lançamentos já gravados, learned: learnCategories(...), validCategory(type, id)}.
export function buildDrafts(items, opts){
  opts = opts || {};
  var existing = opts.existing || [], learned = opts.learned || {expense: {}, income: {}}, seenIds = {};
  var known = {}; existing.forEach(function(t){ if (t.externalId) known[t.externalId] = true; });
  // Lançamento parecido já gravado (mesmo dia, tipo e valor) cobre no máximo um item do arquivo.
  var similar = {};
  existing.forEach(function(t){
    if (t.externalId || t.reversal || (t.type !== 'expense' && t.type !== 'income')) return;
    var k = t.date + '|' + t.type + '|' + Math.round(Math.abs(t.amount) * 100); similar[k] = (similar[k] || 0) + 1;
  });
  var ok = opts.validCategory || function(){ return true; };
  return items.map(function(it, i){
    var type = it.amount < 0 ? 'expense' : 'income', amount = money(Math.abs(it.amount)), ext = externalIdOf(it, opts.accountId);
    var d = {key: i, id: it.id, externalId: ext, date: it.date, type: type, amount: amount, description: it.name || '', category: '', dup: '', ignore: '', checked: true};
    var cat = learned[type][descriptionKey(d.description)] || categoryFromText(d.description, type) || FALLBACK_CATEGORY[type];
    d.category = ok(type, cat) ? cat : FALLBACK_CATEGORY[type];
    if (ext && (known[ext] || seenIds[ext])){ d.dup = 'imported'; d.checked = false; }
    else if (ext) seenIds[ext] = true;
    if (!d.dup){
      var sk = d.date + '|' + type + '|' + Math.round(amount * 100);
      if (similar[sk] > 0){ similar[sk]--; d.dup = 'similar'; d.checked = false; }
    }
    if (opts.isCard && type === 'income'){ d.ignore = CARD_PAYMENT.test(d.description) ? 'pagamento da fatura' : 'crédito no cartão (estorno ou pagamento)'; d.checked = false; }
    return d;
  });
}

// Resumo do que está marcado.
export function summarize(drafts){
  var on = drafts.filter(function(d){ return d.checked && !d.ignore; });
  return {count: on.length,
    expense: money(on.filter(function(d){ return d.type === 'expense'; }).reduce(function(s, d){ return s + d.amount; }, 0)),
    income: money(on.filter(function(d){ return d.type === 'income'; }).reduce(function(s, d){ return s + d.amount; }, 0))};
}

/* ---------- PDF (texto já extraído, uma linha por item da lista) ---------- */

var MONTHS_ABBR = {jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12};
var PDF_AMOUNT = /(-|\()?\s?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(\)|-)?(?:\s?([CD])(?![A-Za-zÀ-ÿ]))?/g;
var PDF_SKIP = /saldo (anterior|final|do dia|dispon|em conta)|total (da |de )?(fatura|compras|a pagar|geral)|pagamento m[ií]nimo|limite (de|total|dispon)|encargos (futuros|financeiros)|valor total|resumo da fatura/i;

function daysBetween(a, b){ return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000); }

// Linhas de texto de uma fatura ou extrato em PDF → itens {id: '', date, amount, name}, com o valor como aparece (positivo se não
// houver sinal; "-", parênteses e "D" viram negativo, "C" positivo). Quem decide se o positivo é gasto (fatura de cartão) é quem chama,
// com looksCard como palpite. opts.today: 'AAAA-MM-DD' (para o ano, quando o PDF só tem dia e mês).
// É uma leitura aproximada: cada banco desenha de um jeito. Por isso a pessoa sempre confere antes de gravar.
export function parsePdfLines(lines, opts){
  var today = (opts && opts.today) || '', all = lines.join('\n'), refDate = '', m, full = /(\d{2})[/.-](\d{2})[/.-](\d{4})/g;
  while ((m = full.exec(all))){ var d0 = parseDateText(m[0]); if (d0 && d0 > refDate) refDate = d0; }
  if (!refDate) refDate = today;
  var looksCard = /fatura/i.test(all) && !/saldo anterior|extrato (de )?conta/i.test(all);
  var items = [], skipped = 0;
  function yearFor(day, month){
    var y = Number(refDate.slice(0, 4)), cand = iso(y, month, day);
    if (!realDate(y, month, day)) return '';
    return daysBetween(cand, refDate) > 45 ? (realDate(y - 1, month, day) ? iso(y - 1, month, day) : '') : cand;
  }
  lines.forEach(function(raw){
    var line = String(raw || '').replace(/\s+/g, ' ').trim(), date = '', rest = '', dm;
    if ((dm = line.match(/^(\d{2}[/.-]\d{2}[/.-]\d{4})\s+(.*)$/))){ date = parseDateText(dm[1]); rest = dm[2]; }
    else if ((dm = line.match(/^(\d{2})[/.-](\d{2})(?:[/.-](\d{2}))?\s+(.*)$/))){
      date = dm[3] ? parseDateText(dm[1] + '/' + dm[2] + '/' + dm[3]) : yearFor(Number(dm[1]), Number(dm[2])); rest = dm[4];
    } else if ((dm = line.match(/^(\d{1,2}) (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.? (.*)$/i))){ date = yearFor(Number(dm[1]), MONTHS_ABBR[dm[2].toLowerCase()]); rest = dm[3]; }
    if (!date || !rest) return;
    PDF_AMOUNT.lastIndex = 0;
    var found = [], a;
    while ((a = PDF_AMOUNT.exec(rest))) found.push({index: a.index, neg: !!(a[1] === '-' || a[1] === '(' || a[4] === '-' || a[4] === ')' || a[5] === 'D'), pos: a[5] === 'C', value: Number(a[2].replace(/\./g, '') + '.' + a[3])});
    if (!found.length) return;
    var pick = found[0], desc = rest.slice(0, pick.index).replace(/\s*R\$\s*$/, '').trim();
    if (!desc || /^[\d\s./-]+$/.test(desc) || PDF_SKIP.test(rest) || !(pick.value > 0)){ skipped++; return; }
    items.push({id: '', date: date, amount: money(pick.neg && !pick.pos ? -pick.value : pick.value), name: desc.slice(0, 100)});
  });
  return {items: items, skipped: skipped, looksCard: looksCard, refDate: refDate};
}
