// Categorias padrão. As categorias criadas pela pessoa ({id, label, type, color}) somam-se a estas
// e valem tanto em “Ganhos e gastos” quanto em “Planejar gastos”.
export var DEFAULT_EXPENSE_CATS = [
  {id:'moradia', label:'Moradia', color:'var(--cat-1)'},
  {id:'alimentacao', label:'Alimentação', color:'var(--cat-2)'},
  {id:'transporte', label:'Transporte', color:'var(--cat-3)'},
  {id:'lazer', label:'Lazer', color:'var(--cat-4)'},
  {id:'saude', label:'Saúde', color:'var(--cat-5)'},
  {id:'educacao', label:'Educação', color:'var(--cat-6)'},
  {id:'compras', label:'Compras', color:'var(--cat-7)'},
  {id:'dividas', label:'Dívidas', color:'var(--cat-9)'},
  {id:'outros', label:'Outros', color:'var(--cat-8)'}
];
export var DEFAULT_INCOME_CATS = [
  {id:'salario', label:'Salário'},
  {id:'freelance', label:'Freelance / Extra'},
  {id:'presente', label:'Presente / Ajuda'},
  {id:'recebimento', label:'Recebimento de terceiros'},
  {id:'outros_receita', label:'Outros'}
];
export var CUSTOM_COLORS = ['#2a9d8f','#8e6cc2','#c2577a','#4f7cac','#b0883a','#5a9e4b','#d0703d','#6b7280'];
// Categorias que o lançamento por mensagem usa quando não reconhece nenhuma palavra.
export var FALLBACK_CATEGORY = {expense: 'outros', income: 'outros_receita'};

export function expenseCats(custom){ return DEFAULT_EXPENSE_CATS.concat((custom || []).filter(function(c){ return c.type === 'expense'; })); }
export function incomeCats(custom){ return DEFAULT_INCOME_CATS.concat((custom || []).filter(function(c){ return c.type === 'income'; })); }
export function catsOfType(type, custom){ return type === 'income' ? incomeCats(custom) : expenseCats(custom); }

// Nome repetido é recusado sem diferenciar maiúsculas. exceptId permite manter o nome ao renomear.
export function categoryNameProblem(name, type, custom, exceptId){
  if (!name) return 'Dê um nome para a categoria.';
  if (name.length > 30) return 'Use até 30 caracteres no nome da categoria.';
  var lower = name.toLowerCase();
  if (catsOfType(type, custom).some(function(c){ return c.id !== exceptId && c.label.toLowerCase() === lower; })) return 'Já existe uma categoria com esse nome.';
  return '';
}
