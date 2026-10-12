/*
 * Índices do Banco Central (API pública SGS, sem chave): CDI anualizado (série 4389), Selic meta
 * (432) e IPCA dos últimos 12 meses (13522). Guardados no navegador por um dia; sem internet, usa o
 * último valor guardado ou os valores de referência.
 */
import {parseSgs, REFERENCE_INDEXES} from '../domain/investments.js';

var KEY = 'granaleve_rates_v1', DAY = 86400000;
var SERIES = {cdi: 4389, selic: 432, ipca: 13522};
export var RATES_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.';

export function cachedIndexes(){
  try { var c = JSON.parse(localStorage.getItem(KEY)); return c && c.cdi ? c : null; } catch(e){ return null; }
}
// {cdi, selic, ipca, date, fetchedAt} — ou o guardado/referência (com reference: true) se falhar.
export async function fetchIndexes(force){
  var c = cachedIndexes();
  if (!force && c && Date.now() - c.fetchedAt < DAY) return c;
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 8000) : null;
  try {
    var out = {fetchedAt: Date.now()}, dates = {};
    await Promise.all(Object.keys(SERIES).map(async function(k){
      var res = await fetch(RATES_URL + SERIES[k] + '/dados/ultimos/1?formato=json', {cache: 'no-store', signal: ctrl ? ctrl.signal : undefined});
      if (!res.ok) throw new Error('Banco Central respondeu ' + res.status);
      var v = parseSgs(await res.json());
      if (!v) throw new Error('resposta vazia do Banco Central');
      out[k] = v.value; dates[k] = v.date;
    }));
    // Data de referência: a do CDI, que sai todo dia útil (a da Selic meta é a da vigência, que pode
    // ser futura, e a do IPCA é mensal).
    out.date = dates.cdi;
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch(e){ /* sem armazenamento: vale só agora */ }
    return out;
  } catch(e){
    return c || Object.assign({}, REFERENCE_INDEXES);
  } finally { if (timer) clearTimeout(timer); }
}
