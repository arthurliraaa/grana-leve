/*
 * Preferências que acompanham a pessoa entre aparelhos (celular e computador): o que ela preencheu na calculadora do salário (os empregos)
 * e as regras dos avisos. As demais preferências (tema, “não perguntar de novo”, avisos ligados neste aparelho…) continuam só neste aparelho.
 * Ficam num documento só da coleção "settings" (id "prefs"): {values: {nome: valor}, at: {nome: instante}}. Vale o mais recente por item.
 * Sem conta online (modo do navegador) ou sem a atualização do banco, tudo continua funcionando só neste aparelho.
 */
import {Store} from '../data/store.js';
import {getPrefs, setPref} from '../data/session.js';
import {planPull} from '../domain/synced-prefs.js';
import {State, k} from './state.js';

export var SYNCED_PREFS = ['workJobs', 'reminderRules'];
var DOC_ID = 'prefs';
var timer = null, pushing = false;

function stamps(){ return getPrefs().syncedAt || {}; }
function setStamp(name, at){ var s = Object.assign({}, stamps()); s[name] = at; setPref('syncedAt', s); }

// Chame depois de gravar uma preferência sincronizada: marca a hora e agenda o envio.
export function markSynced(name){
  if (SYNCED_PREFS.indexOf(name) < 0) return;
  setStamp(name, Date.now());
  schedulePush();
}

// Traz o que é mais novo na conta para este aparelho (chamado ao carregar os dados). Se este aparelho tem algo mais novo, envia.
export function pullSyncedPrefs(docs){
  var doc = (docs || []).filter(function(d){ return d.id === DOC_ID; })[0] || null;
  var plan = planPull(doc, getPrefs(), stamps(), Date.now(), SYNCED_PREFS);
  plan.apply.forEach(function(a){ setPref(a.name, a.value); setStamp(a.name, a.at); });
  plan.stamp.forEach(function(a){ setStamp(a.name, a.at); });
  if (plan.push) schedulePush();
  return plan.apply.length > 0;
}

function schedulePush(){
  if (Store.mode !== 'supabase' || !State.session) return;
  clearTimeout(timer);
  timer = setTimeout(pushNow, 800);
}
export async function pushNow(){
  if (pushing){ schedulePush(); return; }
  if (Store.mode !== 'supabase' || !State.session) return;
  var prefs = getPrefs(), at = stamps(), values = {}, ats = {};
  SYNCED_PREFS.forEach(function(name){ if (prefs[name] !== undefined){ values[name] = prefs[name]; ats[name] = Number(at[name]) || Date.now(); } });
  pushing = true;
  try {
    await Store.put(k(), 'settings', DOC_ID, {values: values, at: ats});
    var cur = State.settings.filter(function(d){ return d.id === DOC_ID; })[0];
    if (cur){ cur.values = values; cur.at = ats; } else State.settings.push({id: DOC_ID, values: values, at: ats});
  } catch(e){ /* sem internet ou sem a atualização do banco: continua só neste aparelho e tenta de novo na próxima mudança */ }
  finally { pushing = false; }
}
