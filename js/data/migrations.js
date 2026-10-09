/*
 * Versão do formato dos dados. Quando o formato muda, uma função aqui atualiza os dados
 * antigos (do navegador ou de um backup) para o formato atual.
 *
 * 1: formato original (planejamento como objeto {categoria: valor}).
 * 2: planejamento por mês (budgets [{id:'plan-AAAA-MM', month, limits}]), contas e transferências,
 *    valores sempre arredondados em centavos.
 */
import {money} from '../domain/money.js';

export var SCHEMA_VERSION = 2;

var STEPS = {
  1: function(d){
    if (d.budgets && !Array.isArray(d.budgets)){
      d.budgets = Object.keys(d.budgets).map(function(k){ return {id: k, limit: Number(d.budgets[k]) || 0}; });
    }
    ['accounts', 'transfers'].forEach(function(c){ if (!Array.isArray(d[c])) d[c] = []; });
    // Dados corrompidos não são consertados aqui: a validação do backup recusa depois, com mensagem clara.
    if (Array.isArray(d.transactions)) d.transactions.forEach(function(t){ if (t && t.amount !== undefined) t.amount = money(t.amount); });
  }
};

// Atualiza "data" (objeto com as coleções) de "from" até a versão atual. Altera o próprio objeto.
export function migrateData(data, from){
  var v = Number(from) || 1;
  while (v < SCHEMA_VERSION){ STEPS[v](data); v++; }
  return data;
}
