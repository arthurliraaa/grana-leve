/*
 * Backup em arquivo JSON: todas as coleções, as preferências deste usuário e a versão do formato.
 * Ao restaurar, o arquivo é validado registro por registro e atualizado para o formato atual.
 */
import {COLLECTIONS} from './store.js';
import {SCHEMA_VERSION, migrateData} from './migrations.js';
import {validateRecord} from '../domain/validate.js';

var COLLECTION_NAMES = {transactions:'lançamentos', budgets:'planejamento', goals:'metas', debts:'dívidas', cards:'cartões',
  receivables:'a receber', forecasts:'previsões', categories:'categorias', vouchers:'vales', accounts:'contas', transfers:'transferências'};
// Preferências que não fazem sentido levar para outro aparelho.
var LOCAL_ONLY_PREFS = ['lastWelcome', 'backupSnoozeUntil'];

export function buildBackup(data, prefs, profile){
  var out = {};
  COLLECTIONS.forEach(function(c){ out[c] = (data[c] || []).slice(); });
  var p = Object.assign({}, prefs);
  LOCAL_ONLY_PREFS.forEach(function(k){ delete p[k]; });
  delete p.lastBackup;
  return {app:'grana-leve', version: 2, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), profile: profile, prefs: p, data: out};
}

// Retorna {error} ou {data, prefs, count, exportedAt} pronto para gravar.
export function readBackup(obj){
  if (!obj || obj.app !== 'grana-leve' || typeof obj.data !== 'object' || !obj.data || Array.isArray(obj.data)) return {error: 'Este arquivo não é um backup do Grana Leve.'};
  var schema = Number(obj.schemaVersion) || 1;
  if (schema > SCHEMA_VERSION) return {error: 'Este backup foi feito por uma versão mais nova do Grana Leve. Atualize o app antes de restaurar.'};
  var data = migrateData(JSON.parse(JSON.stringify(obj.data)), schema);
  for (var i = 0; i < COLLECTIONS.length; i++){
    var c = COLLECTIONS[i];
    if (data[c] === undefined){ data[c] = []; continue; }
    if (!Array.isArray(data[c])) return {error: 'O backup está corrompido (' + COLLECTION_NAMES[c] + ').'};
    for (var j = 0; j < data[c].length; j++){
      var problem = validateRecord(c, data[c][j]);
      if (problem) return {error: 'O backup tem um registro com problema em ' + COLLECTION_NAMES[c] + ' (item ' + (j + 1) + ': ' + problem + ').'};
    }
  }
  var prefs = obj.prefs && typeof obj.prefs === 'object' && !Array.isArray(obj.prefs) ? obj.prefs : {};
  return {data: data, prefs: prefs, count: data.transactions.length, exportedAt: obj.exportedAt};
}
