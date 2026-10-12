// Categorias padrão. As categorias criadas pela pessoa ({id, label, type, color}) somam-se a estas
// e valem tanto em “Ganhos e gastos” quanto em “Planejar gastos”.
export var DEFAULT_EXPENSE_CATS = [
  {id:'moradia', label:'Moradia', color:'var(--cat-1)', emoji:'🏠'},
  {id:'alimentacao', label:'Alimentação', color:'var(--cat-2)', emoji:'🍽️'},
  {id:'transporte', label:'Transporte', color:'var(--cat-3)', emoji:'🚌'},
  {id:'lazer', label:'Lazer', color:'var(--cat-4)', emoji:'🎉'},
  {id:'saude', label:'Saúde', color:'var(--cat-5)', emoji:'💊'},
  {id:'educacao', label:'Educação', color:'var(--cat-6)', emoji:'📚'},
  {id:'compras', label:'Compras', color:'var(--cat-7)', emoji:'🛍️'},
  {id:'dividas', label:'Dívidas', color:'var(--cat-9)', emoji:'💳'},
  {id:'outros', label:'Outros', color:'var(--cat-8)', emoji:'📦'}
];
export var DEFAULT_INCOME_CATS = [
  {id:'salario', label:'Salário', color:'#2f8f5b', emoji:'💼'},
  {id:'freelance', label:'Freelance / Extra', color:'#4f7cac', emoji:'💻'},
  {id:'presente', label:'Presente / Ajuda', color:'#c2577a', emoji:'🎁'},
  {id:'recebimento', label:'Recebimento de terceiros', color:'#8e6cc2', emoji:'🤝'},
  {id:'outros_receita', label:'Outros', color:'#6b7280', emoji:'💰'}
];
export var CUSTOM_COLORS = ['#2a9d8f','#8e6cc2','#c2577a','#4f7cac','#b0883a','#5a9e4b','#d0703d','#6b7280'];
// Cores e emojis oferecidos ao personalizar uma categoria (qualquer emoji também pode ser digitado).
export var PICKER_COLORS = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#2f8f5b','#4a3aa7','#8c6239','#e34948','#2a9d8f','#8e6cc2','#6b7280'];
export var PICKER_EMOJIS = ['🏠','🍽️','🛒','🍔','☕','🚌','🚗','⛽','🎉','🎮','🎬','✈️','💊','🏥','🏋️','📚','🎓','🛍️','👕','💄','💳','🏦','📱','💡','💧','🐶','👶','🎁','💼','💻','💰','🤝','📦','🔧','🧾','⭐'];
export var DEFAULT_EMOJI = '🏷️';

// Categorias que o lançamento por mensagem usa quando não reconhece nenhuma palavra.
export var FALLBACK_CATEGORY = {expense: 'outros', income: 'outros_receita'};

// Categorias salvas pela pessoa: as criadas por ela e as padrão personalizadas (mesmo id da padrão,
// com isDefault: true), que trocam nome, cor ou emoji da padrão sem perder os lançamentos ligados a ela.
function merged(defaults, custom, type){
  var mine = (custom || []).filter(function(c){ return c.type === type; });
  var byId = {};
  mine.forEach(function(c){ byId[c.id] = c; });
  var isDefault = {};
  var base = defaults.map(function(d){ isDefault[d.id] = true; return byId[d.id] ? Object.assign({}, d, pick(byId[d.id]), {isDefault: true}) : Object.assign({isDefault: true}, d); });
  return base.concat(mine.filter(function(c){ return !isDefault[c.id]; }).map(function(c){ return Object.assign({emoji: DEFAULT_EMOJI}, c); }));
}
function pick(c){
  var out = {};
  ['label', 'color', 'emoji'].forEach(function(k){ if (c[k]) out[k] = c[k]; });
  return out;
}
export function expenseCats(custom){ return merged(DEFAULT_EXPENSE_CATS, custom, 'expense'); }
export function incomeCats(custom){ return merged(DEFAULT_INCOME_CATS, custom, 'income'); }
export function isDefaultCategory(id){ return DEFAULT_EXPENSE_CATS.concat(DEFAULT_INCOME_CATS).some(function(c){ return c.id === id; }); }
export function catsOfType(type, custom){ return type === 'income' ? incomeCats(custom) : expenseCats(custom); }

// Nome repetido é recusado sem diferenciar maiúsculas. exceptId permite manter o nome ao renomear.
export function categoryNameProblem(name, type, custom, exceptId){
  if (!name) return 'Dê um nome para a categoria.';
  if (name.length > 30) return 'Use até 30 caracteres no nome da categoria.';
  var lower = name.toLowerCase();
  if (catsOfType(type, custom).some(function(c){ return c.id !== exceptId && c.label.toLowerCase() === lower; })) return 'Já existe uma categoria com esse nome.';
  return '';
}

// Uso das categorias nos lançamentos de um tipo (ganho ou gasto) desde sinceKey ('AAAA-MM-DD'):
// {id: {count, last}}. Estornos e lançamentos fora dos totais não contam.
export function categoryUsage(transactions, type, sinceKey){
  var out = {};
  (transactions || []).forEach(function(t){
    if (t.type !== type || !t.category || t.reversal || t.outsideTotals || (sinceKey && t.date < sinceKey)) return;
    var u = out[t.category] || (out[t.category] = {count: 0, last: ''});
    u.count++;
    if (t.date > u.last) u.last = t.date;
  });
  return out;
}
// Categorias separadas em "mais usadas" (até max, da mais usada para a menos) e "outras" (na ordem
// de sempre). Sem histórico, tudo fica em "outras".
export function splitByUsage(list, usage, max){
  var used = list.filter(function(c){ return usage[c.id]; }).sort(function(a, b){
    return usage[b.id].count - usage[a.id].count || usage[b.id].last.localeCompare(usage[a.id].last);
  }).slice(0, max || 6);
  return {used: used, others: list.filter(function(c){ return used.indexOf(c) < 0; })};
}
function plainText(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
// Categoria sugerida para uma descrição: a que a pessoa mais usou com a mesma descrição (ou começando
// igual, como "mercado" e "mercado da semana"); senão, uma palavra conhecida (keywordCat(texto)).
// Retorna o id ou ''. validIds limita às categorias que ainda existem.
export function suggestCategory(description, type, transactions, validIds, keywordCat){
  var d = plainText(description);
  if (d.length < 3) return '';
  var counts = {};
  (transactions || []).forEach(function(t){
    if (t.type !== type || !t.category || t.reversal || validIds.indexOf(t.category) < 0) return;
    var past = plainText(t.installment ? t.installment.baseDescription : t.description);
    if (!past) return;
    var score = past === d ? 3 : (past.indexOf(d) === 0 || d.indexOf(past) === 0) && Math.min(past.length, d.length) >= 4 ? 1 : 0;
    if (score) counts[t.category] = (counts[t.category] || 0) + score;
  });
  var best = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; })[0];
  if (best) return best;
  var k = keywordCat ? keywordCat(description) : '';
  return k && validIds.indexOf(k) >= 0 ? k : '';
}
