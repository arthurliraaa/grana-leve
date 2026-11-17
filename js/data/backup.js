/*
 * Backup em arquivo JSON: todas as coleções, as preferências deste usuário e a versão do formato.
 * Ao restaurar, o arquivo é atualizado para o formato atual, os valores em dinheiro são arredondados
 * em centavos com money() e cada registro é validado.
 */
import {COLLECTIONS} from './store.js';
import {SCHEMA_VERSION, migrateData} from './migrations.js';
import {validateRecord} from '../domain/validate.js';
import {money} from '../domain/money.js';

var COLLECTION_NAMES = {transactions:'lançamentos', budgets:'planejamento', goals:'metas', debts:'dívidas', cards:'cartões',
  receivables:'a receber', forecasts:'previsões', categories:'categorias', vouchers:'vales', accounts:'contas', transfers:'transferências', bills:'contas fixas'};
// Preferências que não fazem sentido levar para outro aparelho.
var LOCAL_ONLY_PREFS = ['lastWelcome', 'backupSnoozeUntil'];

// Campos de valor em dinheiro: ao restaurar, todo número passa por money() (no máximo 2 casas).
// Texto numérico em formato JS ("10.005", "-3.5") vira número e também é arredondado.
// Outro texto, nulo ou campo ausente fica como está: a validação decide se o registro serve.
var NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
var MONEY_FIELDS = ['amount', 'totalAmount', 'receivedAmount', 'paidAmount', 'initialBalance', 'limit',
  'targetAmount', 'currentAmount', 'installmentAmount', 'monthlyPayment', 'forgivenAmount'];
function isObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function roundKeys(o, keys){
  if (!isObj(o)) return;
  keys.forEach(function(k){
    var v = o[k];
    if (typeof v === 'string' && NUMERIC_TEXT.test(v.trim())) v = Number(v.trim());
    if (typeof v === 'number' && isFinite(v)) o[k] = money(v);
  });
}
function roundList(list, keys){ if (Array.isArray(list)) list.forEach(function(x){ roundKeys(x, keys); }); }
// Objeto {chave: valor}: arredonda cada valor numérico.
function roundValues(o){ if (isObj(o)) roundKeys(o, Object.keys(o)); }
// Objeto {chave: registro}: arredonda os campos de cada registro.
function roundEach(o, fn){ if (isObj(o)) Object.keys(o).forEach(function(k){ fn(o[k]); }); }
// Valores aninhados de cada coleção.
var NESTED = {
  transactions: function(t){
    if (isObj(t.split)){ roundKeys(t.split, ['total', 'mine']); roundList(t.split.people, ['amount']); }
    roundKeys(t.installment, ['totalAmount']);
    roundKeys(t.installmentAdvance, ['original', 'discount']);
  },
  budgets: function(b){ roundValues(b.limits); },
  goals: function(g){ roundList(g.moves, ['amount']); },
  debts: function(d){ roundList(d.payments, ['amount']); },
  receivables: function(r){ roundList(r.payments, ['amount']); },
  cards: function(c){
    roundEach(c.invoicePayments, function(p){ roundKeys(p, ['amount', 'total', 'rest', 'parcel']); });
    roundEach(c.invoiceAdvances, function(list){ roundList(list, ['amount']); });
    roundEach(c.invoicePaidDue, function(p){ roundKeys(p, ['due']); });
  },
  forecasts: function(f){ roundValues(f.received); },
  bills: function(b){
    roundList(b.amounts, ['amount']);
    roundEach(b.paid, function(p){ roundKeys(p, ['amount']); });
  }
};
function roundMoney(c, item){
  if (!isObj(item)) return;
  roundKeys(item, MONEY_FIELDS);
  if (NESTED[c]) NESTED[c](item);
}

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
      roundMoney(c, data[c][j]);
      var problem = validateRecord(c, data[c][j]);
      if (problem) return {error: 'O backup tem um registro com problema em ' + COLLECTION_NAMES[c] + ' (item ' + (j + 1) + ': ' + problem + ').'};
    }
  }
  var prefs = obj.prefs && typeof obj.prefs === 'object' && !Array.isArray(obj.prefs) ? obj.prefs : {};
  return {data: data, prefs: prefs, count: data.transactions.length, exportedAt: obj.exportedAt};
}
