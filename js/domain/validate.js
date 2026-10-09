/*
 * Validação central de cada tipo de registro. Usada ao restaurar backup e ao importar
 * lançamentos (chat e, no futuro, WhatsApp/Open Finance). Retorna '' quando está tudo certo
 * ou uma mensagem curta dizendo o que está errado.
 */
import {validDateStr} from './dates.js';

function isText(v, max){ return typeof v === 'string' && v.length <= (max || 200); }
function isNum(v){ return typeof v === 'number' && isFinite(v); }
function isDate(v){ return typeof v === 'string' && v !== '' && validDateStr(v); }
function optText(v, max){ return v === undefined || v === null || isText(v, max); }
function okUrgency(x){ return x.urgency === undefined || x.urgency === null || ['alta', 'media', 'baixa'].indexOf(x.urgency) >= 0; }
function day(v){ return Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31; }

var RULES = {
  transactions: function(t){
    if (t.type !== 'income' && t.type !== 'expense') return 'tipo inválido';
    if (!isNum(t.amount) || t.amount <= 0) return 'valor inválido';
    if (!isDate(t.date)) return 'data inválida';
    if (!isText(t.category, 60)) return 'categoria inválida';
    if (!optText(t.description, 200)) return 'descrição inválida';
    if ([undefined, null, 'conta', 'cartao', 'vale'].indexOf(t.paymentMethod) < 0) return 'forma de pagamento inválida';
    return '';
  },
  accounts: function(a){
    if (!isText(a.name, 60) || !a.name) return 'nome inválido';
    if (!isNum(Number(a.initialBalance || 0))) return 'saldo inválido';
    if (a.baseDate !== undefined && !isDate(a.baseDate)) return 'data inválida';
    return '';
  },
  transfers: function(x){
    if (!isText(x.fromId) || !isText(x.toId) || x.fromId === x.toId) return 'contas inválidas';
    if (!isNum(x.amount) || x.amount <= 0) return 'valor inválido';
    if (!isDate(x.date)) return 'data inválida';
    return '';
  },
  cards: function(c){
    if (!isText(c.name, 60) || !c.name) return 'nome inválido';
    if (!day(c.closingDay) || !day(c.dueDay)) return 'dias de fechamento/vencimento inválidos';
    if (!isNum(Number(c.limit || 0)) || Number(c.limit || 0) < 0) return 'limite inválido';
    return '';
  },
  budgets: function(b){
    if (b.month !== undefined){
      if (!/^\d{4}-\d{2}$/.test(b.month) || !b.limits || typeof b.limits !== 'object') return 'planejamento inválido';
      for (var k in b.limits){ if (!isNum(b.limits[k]) || b.limits[k] < 0) return 'valor planejado inválido'; }
      return '';
    }
    return isNum(Number(b.limit)) && Number(b.limit) >= 0 ? '' : 'valor planejado inválido';
  },
  goals: function(g){ return isText(g.name, 100) && isNum(Number(g.targetAmount)) && okUrgency(g) ? '' : 'meta inválida'; },
  debts: function(d){ return isText(d.name, 100) && isNum(Number(d.totalAmount)) && okUrgency(d) ? '' : 'dívida inválida'; },
  receivables: function(r){ return isText(r.person, 100) && isNum(Number(r.totalAmount)) && okUrgency(r) ? '' : 'valor a receber inválido'; },
  forecasts: function(f){ return isText(f.description, 100) && isNum(Number(f.amount)) && isDate(f.date) ? '' : 'previsão inválida'; },
  categories: function(c){
    if (!isText(c.label, 30) || !c.label || (c.type !== 'income' && c.type !== 'expense')) return 'categoria inválida';
    if (!optText(c.emoji, 16) || !optText(c.color, 40)) return 'emoji ou cor inválidos';
    return '';
  },
  vouchers: function(v){ return isText(v.name, 60) && isNum(Number(v.amount)) ? '' : 'vale inválido'; }
};

// Valida um registro da coleção. Todo registro precisa de um id em texto.
export function validateRecord(collection, item){
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'registro inválido';
  if (typeof item.id !== 'string' || !item.id || item.id.length > 120) return 'registro sem identificação';
  var rule = RULES[collection];
  return rule ? rule(item) : '';
}
// Para lançamentos que ainda não foram salvos (sem id).
export function validateNewTransaction(t){ return RULES.transactions(t); }
