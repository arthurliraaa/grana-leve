/*
 * Planejar gastos. Cada mês guarda o próprio planejamento em months[mês] = {categoria: valor}.
 * Um mês sem planejamento próprio usa o do último mês planejado antes dele; sem nenhum, usa
 * os valores antigos (base), de quando o planejamento valia para todos os meses.
 */
export function budgetsFor(base, months, key){
  var best = null;
  Object.keys(months).forEach(function(m){ if (m <= key && (!best || m > best)) best = m; });
  return best ? months[best] : base;
}
export function budgetLimit(base, months, key, cat){ return Number(budgetsFor(base, months, key)[cat] || 0); }
// Só o mês atual e o próximo podem mudar; os meses que já passaram ficam travados.
export function budgetLocked(key, curKey){ return key < curKey; }
// Novo planejamento do mês: copia o que valia e troca só a categoria alterada (0 = sem limite).
export function planWith(base, months, key, cat, val){
  var plan = Object.assign({}, budgetsFor(base, months, key));
  if (val > 0) plan[cat] = val; else delete plan[cat];
  return plan;
}
export function statusForPct(pct){
  if (pct >= 1) return 'critical';
  if (pct >= 0.8) return 'warning';
  return 'good';
}
