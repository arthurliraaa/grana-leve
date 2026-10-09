/*
 * Urgência de dívidas, valores a receber e metas: alta, média ou baixa.
 * Itens sem urgência escolhida contam como média. A lista mais urgente vem primeiro.
 */
export var URGENCY = [
  {id: 'alta', label: 'Alta', rank: 0},
  {id: 'media', label: 'Média', rank: 1},
  {id: 'baixa', label: 'Baixa', rank: 2}
];
export var DEFAULT_URGENCY = 'media';

export function urgencyOf(item){
  var u = item && item.urgency;
  return URGENCY.some(function(x){ return x.id === u; }) ? u : DEFAULT_URGENCY;
}
export function urgencyRank(item){
  var u = urgencyOf(item);
  return URGENCY.filter(function(x){ return x.id === u; })[0].rank;
}
export function urgencyLabel(id){ return (URGENCY.filter(function(x){ return x.id === id; })[0] || URGENCY[1]).label; }
// Ordena por urgência e, empatando, pela função "then" (opcional). Não altera a lista original.
export function byUrgency(list, then){
  return list.slice().sort(function(a, b){ return (urgencyRank(a) - urgencyRank(b)) || (then ? then(a, b) : 0); });
}
