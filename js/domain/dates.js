/*
 * Datas do Grana Leve. Tudo trabalha com textos "AAAA-MM-DD" (dia) e "AAAA-MM" (mês),
 * no fuso do aparelho, para não depender de horário nem de UTC.
 */
export var monthNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export function pad2(n){ return String(n).padStart(2,'0'); }
export function toDateKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
export function todayKey(now){ return toDateKey(now || new Date()); }
export function monthKeyOf(dateStr){ return (dateStr || '').slice(0,7); }
export function parseDate(iso){ var p = String(iso||'').split('-'); return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]||1)); }
export function daysInMonth(y, m){ return new Date(y, m+1, 0).getDate(); }
export function formatDateBr(iso){ if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1]; }
export function formatDateFull(iso){ if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
// Data vazia é válida (campo opcional); fora de 1900–3000 não.
export function validDateStr(s){
  if (!s) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var y = Number(s.slice(0,4)), m = Number(s.slice(5,7)), d = Number(s.slice(8,10));
  return y >= 1900 && y <= 3000 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m - 1);
}

// Mês a "offset" meses do mês atual (0 = este mês, -1 = anterior).
export function monthBounds(offset, now){
  now = now || new Date();
  var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  var key = d.getFullYear() + '-' + pad2(d.getMonth()+1);
  return {key: key, label: monthNames[d.getMonth()] + ' de ' + d.getFullYear(), date: d};
}
export function monthLabelOf(key){ var p = key.split('-'); return monthNames[Number(p[1])-1] + ' de ' + p[0]; }
export function monthsBetween(fromKey, toKey){
  return (Number(toKey.slice(0,4)) - Number(fromKey.slice(0,4))) * 12 + Number(toKey.slice(5,7)) - Number(fromKey.slice(5,7));
}
export function shiftMonthKey(key, n){
  var d = new Date(Number(key.slice(0,4)), Number(key.slice(5,7)) - 1 + n, 1);
  return d.getFullYear() + '-' + pad2(d.getMonth()+1);
}
// Soma meses mantendo o dia; se o mês não tem esse dia (31 em fevereiro), usa o último dia do mês.
export function addMonthsIso(iso, n){
  var d = parseDate(iso);
  var first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return toDateKey(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysInMonth(first.getFullYear(), first.getMonth()))));
}
