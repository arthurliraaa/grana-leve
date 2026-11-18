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

// Quanto do planejado cada categoria já usou: [{cat, pct, level}] com level 'near' (a partir da porcentagem escolhida,
// padrão 90%, “perto do limite”) ou 'over' (passou de 100%). Só categorias com limite.
export var NEAR_LIMIT = 0.9;
export function budgetAlerts(spentByCat, limits, near){
  var from = near > 0 && near < 1 ? near : NEAR_LIMIT;
  var out = [];
  Object.keys(limits || {}).forEach(function(cat){
    var limit = Number(limits[cat]) || 0, spent = Number(spentByCat[cat]) || 0;
    if (!(limit > 0)) return;
    var pct = spent / limit;
    if (pct > 1) out.push({cat: cat, pct: pct, level: 'over', spent: spent, limit: limit});
    else if (pct >= from) out.push({cat: cat, pct: pct, level: 'near', spent: spent, limit: limit});
  });
  return out.sort(function(a, b){ return b.pct - a.pct; });
}

// Evolução do gasto no mês: acumulado dia a dia (até hoje, ou o mês inteiro se já passou) contra o ritmo
// ideal (o limite dividido igualmente pelos dias). items = [{date 'AAAA-MM-DD', amount}]. Compra fora do
// mês (fatura que cai nele) conta no dia 1 se for anterior ou no último dia se for posterior.
export function monthBurn(items, key, today, limit){
  var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)), n = new Date(y, m, 0).getDate();
  var upto = today.slice(0, 7) === key ? Number(today.slice(8, 10)) : today.slice(0, 7) > key ? n : 0;
  var daily = [], i;
  for (i = 0; i < n; i++) daily.push(0);
  var scheduled = 0;
  items.forEach(function(it){
    var mk = it.date.slice(0, 7), d = mk < key ? 1 : mk > key ? n : Number(it.date.slice(8, 10));
    if (d > upto){ scheduled += Number(it.amount) || 0; return; }
    daily[d - 1] += Number(it.amount) || 0;
  });
  var cum = [], run = 0;
  for (i = 0; i < upto; i++){ run += daily[i]; cum.push(Math.round(run * 100) / 100); }
  var spent = cum.length ? cum[cum.length - 1] : 0;
  var ideal = limit > 0 ? daily.map(function(_, k){ return Math.round(limit * (k + 1) / n * 100) / 100; }) : [];
  return {days: n, upto: upto, cum: cum, spent: spent, scheduled: Math.round(scheduled * 100) / 100, limit: limit || 0, ideal: ideal,
    projected: upto > 0 ? Math.round(spent / upto * n * 100) / 100 : 0,
    ahead: limit > 0 && upto > 0 ? Math.round((spent - limit * upto / n) * 100) / 100 : 0};
}

// Porcentagem de aviso escolhida pela pessoa (50 a 99); fora disso, o padrão de 90%.
export function alertPercent(v){ var n = Math.round(Number(v)); return n >= 50 && n <= 99 ? n : Math.round(NEAR_LIMIT * 100); }
