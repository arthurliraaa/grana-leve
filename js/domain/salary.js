/*
 * Salário líquido (estimativa) e horas extras, de acordo com o jeito de trabalhar de cada pessoa.
 * Regime: 'clt' | 'servidor' | 'mei' | 'autonomo' | 'pj' | 'estagio' | 'outro'.
 *
 * As tabelas abaixo são as de 2026 e mudam todo ano: ficam todas em TABLES, para atualizar num lugar só.
 * Fontes: tabelas publicadas para 2026 (INSS: salário mínimo R$ 1.621,00 e teto R$ 8.475,55; IRRF mensal com o
 * desconto simplificado de R$ 607,20, dependente de R$ 189,59 e a redução da Lei 15.270/2025; DAS do MEI).
 * É só uma estimativa: o holerite pode ter adicionais, convenção coletiva e outros descontos.
 */
import {money, sumMoney} from './money.js';

export var TABLES = {
  year: 2026,
  minWage: 1621.00,
  inss: {ceiling: 8475.55, brackets: [[1621.00, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]]},
  irrf: {
    // [limite da base, alíquota, parcela a deduzir]
    brackets: [[2428.80, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]],
    simplified: 607.20, dependent: 189.59,
    // Lei 15.270/2025: até 5.000 de rendimento mensal o imposto zera; de 5.000 a 7.350 a redução cai com a renda.
    reducer: {full: 5000, end: 7350, a: 978.62, b: 0.133145}
  },
  mei: {commerce: 82.05, services: 86.05, both: 87.05},
  autonomo: {rate: 0.20, simplifiedRate: 0.11},
  // Hora extra: 50% em dia útil e 100% em domingo/feriado; reflexo no descanso semanal (DSR) estimado com 25 dias
  // úteis e 5 domingos/feriados por mês.
  overtime: {rate50: 0.5, rate100: 1, workDays: 25, restDays: 5},
  // Sobreaviso: cada hora à disposição da empresa (fora do expediente, aguardando ser chamado) paga 1/3 da hora normal.
  onCall: 1 / 3,
  // FGTS: a empresa deposita 8% da remuneração numa conta do trabalhador; não sai do salário.
  fgts: 0.08,
  vt: 0.06
};

function pct(v){ return Math.max(0, Number(v) || 0); }

// INSS do empregado: alíquotas progressivas, cada uma só sobre a parte do salário que cai na faixa; limitado ao teto.
export function inssEmployee(gross, tables){
  var T = (tables || TABLES).inss, base = Math.min(Math.max(0, Number(gross) || 0), T.ceiling), prev = 0, total = 0;
  T.brackets.forEach(function(b){
    if (base > prev) total += (Math.min(base, b[0]) - prev) * b[1];
    prev = b[0];
  });
  return money(total);
}

// Imposto de renda retido (mensal). gross = rendimento tributável do mês; deductions = INSS/previdência + dependentes;
// vale a dedução mais vantajosa entre essa soma e o desconto simplificado. Depois entra a redução da Lei 15.270/2025.
export function irrfMonthly(opts, tables){
  var T = (tables || TABLES).irrf, gross = Math.max(0, Number(opts.gross) || 0);
  var deductions = (Number(opts.pension) || 0) + (Number(opts.dependents) || 0) * T.dependent + (Number(opts.alimony) || 0);
  var base = Math.max(0, gross - Math.max(deductions, T.simplified));
  var tax = 0;
  for (var i = 0; i < T.brackets.length; i++){
    if (base <= T.brackets[i][0]){ tax = base * T.brackets[i][1] - T.brackets[i][2]; break; }
  }
  tax = Math.max(0, tax);
  var R = T.reducer, reduction = 0;
  if (gross <= R.full) reduction = tax;
  else if (gross < R.end) reduction = Math.max(0, R.a - R.b * gross);
  return money(Math.max(0, tax - reduction));
}

// Valor da hora normal: o salário dividido pelo divisor da jornada (44h semanais = 220; 40h = 200; 36h = 180).
export function hourlyRate(salary, weeklyHours){
  var h = Number(weeklyHours) > 0 ? Number(weeklyHours) : 44;
  return (Number(salary) || 0) / (h * 5);
}
// Horas extras do mês → {hourly, pay50, pay100, dsr, total}. O descanso semanal (DSR) sobre elas é estimado com os dias
// de trabalho e os dias de repouso (domingos e feriados) do mês: (horas extras ÷ dias de trabalho) × dias de repouso.
// opts: {h50, h100, withDsr, workDays, restDays}.
export function overtimePay(salary, weeklyHours, h50, h100, withDsr, tables, days){
  var O = (tables || TABLES).overtime, hourly = hourlyRate(salary, weeklyHours);
  var pay50 = money(hourly * (1 + O.rate50) * pct(h50)), pay100 = money(hourly * (1 + O.rate100) * pct(h100));
  var work = days && Number(days.workDays) > 0 ? Number(days.workDays) : O.workDays, rest = days && Number(days.restDays) >= 0 && days.restDays !== '' && days.restDays !== undefined ? Number(days.restDays) : O.restDays;
  var dsr = withDsr ? money((pay50 + pay100) / work * rest) : 0;
  return {hourly: money(hourly), pay50: pay50, pay100: pay100, dsr: dsr, total: money(pay50 + pay100 + dsr)};
}

// Sobreaviso: 1/3 da hora normal por hora à disposição da empresa. Sem reflexo no repouso nesta estimativa.
export function onCallPay(salary, weeklyHours, hours, tables){
  var T = tables || TABLES;
  return money(hourlyRate(salary, weeklyHours) * T.onCall * pct(hours));
}

// Tipos de desconto do contracheque. mode: 'pct' (% do salário) ou 'fixed' (R$). varies: costuma mudar de um mês para o outro.
export var DISCOUNT_TYPES = [
  {id: 'vt', label: 'Vale-transporte', mode: 'fixed', benefit: true, hint: 'até 6% do salário, limitado ao valor do vale; muita empresa desconta bem menos'},
  {id: 'saude', label: 'Plano de saúde', mode: 'fixed'},
  {id: 'odonto', label: 'Plano odontológico', mode: 'fixed'},
  {id: 'refeicao', label: 'Vale-refeição ou alimentação (parte do empregado)', mode: 'fixed', benefit: true},
  {id: 'pensao', label: 'Pensão alimentícia', mode: 'fixed', hint: 'também reduz o imposto de renda'},
  {id: 'consignado', label: 'Empréstimo consignado', mode: 'fixed'},
  {id: 'sindical', label: 'Contribuição sindical', mode: 'fixed'},
  {id: 'adiantamento', label: 'Adiantamento ou vale', mode: 'fixed', varies: true},
  {id: 'outro', label: 'Outro desconto', mode: 'fixed'}
];
// Dias úteis (segunda a sexta) de um mês, sem descontar feriados: ponto de partida para os dias de vale-transporte.
// month: 0 a 11.
export function workdaysInMonth(year, month){
  var n = 0, last = new Date(year, month + 1, 0).getDate();
  for (var d = 1; d <= last; d++){ var w = new Date(year, month, d).getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
// Valor de um desconto. mode: 'fixed' (R$), 'pct' (% do salário), 'perday' (cobrado por dia de uso) ou 'benefit' (calculado pelo benefício recebido no mês):
// no vale-transporte desconta pct% do salário, mas nunca mais do que o próprio vale recebido; nos demais, pct% do benefício.
export function discountAmount(d, base){
  // 'perday': o que foi cobrado num mês (charged, em refDays dias de uso) vira um valor por dia e acompanha os dias do mês (days).
  if (d.mode === 'perday'){
    var ref = Number(d.refDays) || 0, used = d.days === undefined || d.days === '' ? ref : Math.max(0, Number(d.days) || 0);
    return ref > 0 ? money(Math.max(0, Number(d.charged) || 0) / ref * used) : 0;
  }
  if (d.mode === 'benefit'){
    var received = Math.max(0, Number(d.benefit) || 0), p = Math.max(0, Number(d.pct) || 0);
    return money(d.type === 'vt' ? Math.min(received, base * p / 100) : received * p / 100);
  }
  var v = Math.max(0, Number(d.value) || 0);
  return money(d.mode === 'pct' ? base * v / 100 : v);
}

// Ganhos extras do contracheque (além do salário). taxable: entra na base do INSS e do imposto de renda (bonificação,
// comissão, gratificação); os indenizatórios (ajuda de custo, auxílio home office, auxílio-alimentação) só somam ao
// líquido. varies: costuma mudar de um mês para o outro.
export var BONUS_TYPES = [
  {id: 'homeoffice', label: 'Auxílio home office', taxable: false, hint: 'ajuda para internet, energia e estrutura em casa'},
  {id: 'ajuda', label: 'Ajuda de custo', taxable: false},
  {id: 'alimentacao', label: 'Auxílio-alimentação ou refeição', taxable: false},
  {id: 'transporte', label: 'Auxílio-transporte ou combustível', taxable: false},
  {id: 'bonificacao', label: 'Bonificação (em dinheiro)', taxable: true, varies: true},
  {id: 'bonificacao-vale', label: 'Bonificação em vales ou cartão benefício', taxable: false, varies: true, hint: 'recebida em vale, sem desconto'},
  {id: 'comissao', label: 'Comissão', taxable: true, varies: true},
  {id: 'gratificacao', label: 'Gratificação', taxable: true},
  {id: 'plr', label: 'Participação nos lucros (PLR)', taxable: true, varies: true},
  {id: 'outro', label: 'Outro ganho', taxable: true}
];
export function bonusAmount(b, base){ return discountAmount(b, base); }

// Líquido estimado. opts: {regime, gross, weeklyHours, h50, h100, dsr, workDays, restDays, dependents, discounts, rpps,
// meiKind, inssKind, simplesRate, otherPct, bonuses, sobreaviso}. fgts: o que a empresa deposita (8%, só CLT), fora do líquido. discounts: [{type, label?, mode: 'pct'|'fixed', value, varies?}];
// bonuses: [{type, label?, mode, value, varies?, taxable?}] (ganhos extras: ver BONUS_TYPES).
// Só o salário (e os descontos que não variam) é fixo: horas extras e descontos “que variam” entram só no líquido
// DESTE MÊS (net); o líquido para registrar todo mês é fixedNet.
export function netSalary(opts, tables){
  var full = runNet(opts, tables, true);
  var hasVariable = full.extras > 0 || (opts.discounts || []).some(function(d){ return d.varies && discountAmount(d, full.gross) > 0; }) ||
    (opts.bonuses || []).some(function(b){ return b.varies && bonusAmount(b, full.gross) > 0; });
  var fixed = hasVariable ? runNet(opts, tables, false) : full;
  full.fixedNet = fixed.net; full.fixedFgts = fixed.fgts;
  full.hasVariable = hasVariable;
  return full;
}
function runNet(opts, tables, withVariable){
  var T = tables || TABLES, regime = opts.regime || 'clt', gross = money(Math.max(0, Number(opts.gross) || 0));
  var lines = [], ot = {pay50: 0, pay100: 0, dsr: 0, total: 0};
  var canOvertime = regime === 'clt' || regime === 'servidor';
  var onCall = canOvertime && withVariable ? onCallPay(gross, opts.weeklyHours, opts.sobreaviso, T) : 0;
  if (canOvertime && withVariable) ot = overtimePay(gross, opts.weeklyHours, opts.h50, opts.h100, opts.dsr !== false, T, {workDays: opts.workDays, restDays: opts.restDays});
  // Ganhos extras: os que variam só entram no mês. Os tributáveis somam à base do INSS e do imposto; os demais só ao líquido.
  var bonusLines = [], taxableBonus = 0, freeBonus = 0;
  (opts.bonuses || []).filter(function(b){ return withVariable || !b.varies; }).forEach(function(b){
    var meta = BONUS_TYPES.filter(function(t){ return t.id === b.type; })[0] || {}, v = bonusAmount(b, gross);
    if (!(v > 0)) return;
    var taxable = b.taxable === undefined ? meta.taxable !== false : !!b.taxable;
    bonusLines.push({id: 'b:' + (b.type || 'outro'), label: (b.label || meta.label || 'Ganho extra') + (b.mode === 'pct' ? ' (' + (Number(b.value) || 0) + '%)' : '') + (b.varies ? ' · varia' : '') + (taxable ? '' : ' · não tributa'), amount: v, kind: 'plus'});
    if (taxable) taxableBonus += v; else freeBonus += v;
  });
  var extras = money(ot.total + onCall), total = money(gross + extras + taxableBonus), disc = 0;
  lines.push({id: 'gross', label: 'Salário bruto', amount: gross, kind: 'base'});
  if (ot.pay50) lines.push({id: 'ot50', label: 'Horas extras 50% (' + Number(opts.h50) + ' h)', amount: ot.pay50, kind: 'plus'});
  if (ot.pay100) lines.push({id: 'ot100', label: 'Horas extras 100% (' + Number(opts.h100) + ' h)', amount: ot.pay100, kind: 'plus'});
  if (onCall) lines.push({id: 'sobreaviso', label: 'Sobreaviso (' + Number(opts.sobreaviso) + ' h)', amount: onCall, kind: 'plus'});
  if (ot.dsr) lines.push({id: 'dsr', label: 'Descanso semanal (DSR) sobre as horas extras', amount: ot.dsr, kind: 'plus'});
  bonusLines.forEach(function(l){ lines.push(l); });
  function minus(id, label, v){ v = money(v); if (v > 0){ lines.push({id: id, label: label, amount: v, kind: 'minus'}); disc += v; } return v; }
  // Descontos escolhidos (os que variam só entram no líquido do mês). Pensão alimentícia também abate no imposto.
  var chosen = (opts.discounts || []).filter(function(d){ return withVariable || !d.varies; });
  var alimony = 0;
  chosen.forEach(function(d){ if (d.type === 'pensao') alimony += discountAmount(d, gross); });

  if (regime === 'clt' || regime === 'servidor'){
    var prev = regime === 'clt' ? inssEmployee(total, T) : money(total * pct(opts.rpps === undefined ? 14 : opts.rpps) / 100);
    minus('inss', regime === 'clt' ? 'INSS' : 'Previdência do servidor (' + (opts.rpps === undefined ? 14 : pct(opts.rpps)) + '%)', prev);
    minus('irrf', 'Imposto de renda (IRRF)', irrfMonthly({gross: total, pension: prev, dependents: opts.dependents, alimony: alimony}, T));
  } else if (regime === 'autonomo'){
    var kind = opts.inssKind || 'normal', base = Math.min(total, T.inss.ceiling), inssA = kind === 'none' ? 0 : kind === 'simplificado' ? T.minWage * T.autonomo.simplifiedRate : base * T.autonomo.rate;
    minus('inss', 'INSS' + (kind === 'simplificado' ? ' (plano simplificado, 11% do salário mínimo)' : kind === 'normal' ? ' (20%, até o teto)' : ''), inssA);
    minus('irrf', 'Imposto de renda (carnê-leão)', irrfMonthly({gross: total, pension: money(inssA)}, T));
  } else if (regime === 'mei'){
    minus('das', 'DAS do MEI', T.mei[opts.meiKind === 'commerce' ? 'commerce' : opts.meiKind === 'both' ? 'both' : 'services']);
  } else if (regime === 'pj'){
    var rate = opts.simplesRate === undefined ? 6 : pct(opts.simplesRate);
    minus('simples', 'Impostos do Simples (' + rate + '%)', total * rate / 100);
  } else if (regime === 'outro'){
    minus('outros%', 'Descontos (' + pct(opts.otherPct) + '%)', total * pct(opts.otherPct) / 100);
  }
  // estágio e bolsa: sem descontos obrigatórios.
  chosen.forEach(function(d){
    var meta = DISCOUNT_TYPES.filter(function(t){ return t.id === d.type; })[0] || {};
    minus('d:' + (d.type || 'outro'), (d.label || meta.label || 'Desconto') + (d.mode === 'pct' ? ' (' + (Number(d.value) || 0) + '%)' : d.mode === 'perday' ? ' (' + (d.days === undefined ? d.refDays : d.days) + ' dias de uso)' : d.mode === 'benefit' ? ' (' + (Number(d.pct) || 0) + '%' + (d.type === 'vt' ? ' do salário, até o valor do vale' : ' do benefício') + ')' : '') + (d.varies ? ' · varia' : ''), discountAmount(d, gross));
  });
  var net = money(total + freeBonus - disc);
  return {lines: lines, gross: gross, extras: extras, onCall: onCall, fgts: regime === 'clt' ? money(total * T.fgts) : 0, bonuses: money(taxableBonus + freeBonus), total: total, discounts: money(disc), net: net, rate: total > 0 ? Math.round(1000 * disc / total) / 10 : 0};
}

// Previdência (INSS ou do servidor) sobre um valor avulso, como o 13º ou as férias.
function socialOn(opts, value, T){
  return (opts.regime || 'clt') === 'servidor' ? money(value * pct(opts.rpps === undefined ? 14 : opts.rpps) / 100) : inssEmployee(value, T);
}
function monthlyBase(opts){ return money(Math.max(0, Number(opts.gross) || 0) + pct(opts.varAvg)); }

// 13º salário (CLT e servidor): bruto = (salário + média mensal de extras) × meses trabalhados no ano ÷ 12. A 1ª parcela (até
// 30/11) é metade do bruto, sem descontos; o INSS e o imposto de renda saem só da 2ª (até 20/12), calculados sobre o 13º
// inteiro, à parte do salário (tributação exclusiva, com a redução da Lei 15.270/2025 sobre o próprio 13º).
// opts: {regime, gross, varAvg, thirdMonths, dependents, rpps}. Devolve null fora de CLT e servidor.
export function thirteenth(opts, tables){
  var T = tables || TABLES, regime = opts.regime || 'clt';
  if (regime !== 'clt' && regime !== 'servidor') return null;
  var months = Math.min(12, Math.max(0, Math.round(opts.thirdMonths === undefined || opts.thirdMonths === '' ? 12 : Number(opts.thirdMonths) || 0)));
  var total = money(monthlyBase(opts) * months / 12), first = money(total / 2);
  var inss = socialOn(opts, total, T), irrf = irrfMonthly({gross: total, pension: inss, dependents: opts.dependents}, T);
  var second = money(total - first - inss - irrf), net = money(total - inss - irrf);
  return {months: months, total: total, first: first, inss: inss, irrf: irrf, second: second, net: net, fgts: regime === 'clt' ? money(total * T.fgts) : 0,
    lines: [{id: 'total', label: '13º bruto (' + months + '/12)', amount: total, kind: 'base'},
      {id: 'inss', label: regime === 'clt' ? 'INSS (sobre o 13º inteiro)' : 'Previdência do servidor', amount: inss, kind: 'minus'},
      {id: 'irrf', label: 'Imposto de renda (sobre o 13º)', amount: irrf, kind: 'minus'}].filter(function(l){ return l.kind === 'base' || l.amount > 0; })};
}

// Férias (CLT e servidor): dias gozados × (salário + média de extras) ÷ 30, mais o terço constitucional; INSS e imposto de
// renda incidem sobre isso. Vender 10 dias (abono pecuniário) soma o valor desses dias + 1/3, sem desconto algum, e deixa no
// máximo 20 dias para gozar. Estimativa isolada do salário do mês: o imposto real pode mudar com o que se recebe junto.
// opts: {regime, gross, varAvg, vacDays, vacSell, dependents, rpps}.
export function vacation(opts, tables){
  var T = tables || TABLES, regime = opts.regime || 'clt';
  if (regime !== 'clt' && regime !== 'servidor') return null;
  var base = monthlyBase(opts), sell = !!opts.vacSell;
  var days = Math.min(sell ? 20 : 30, Math.max(0, Math.round(opts.vacDays === undefined || opts.vacDays === '' ? 30 : Number(opts.vacDays) || 0)));
  var pay = money(base / 30 * days), third = money(pay / 3), taxable = money(pay + third);
  var abono = sell ? money(base / 30 * 10) : 0, abonoThird = sell ? money(abono / 3) : 0;
  var inss = socialOn(opts, taxable, T), irrf = irrfMonthly({gross: taxable, pension: inss, dependents: opts.dependents}, T);
  var net = money(taxable - inss - irrf + abono + abonoThird);
  var lines = [{id: 'pay', label: 'Férias (' + days + ' dias)', amount: pay, kind: 'base'}, {id: 'third', label: '1/3 constitucional', amount: third, kind: 'plus'}];
  if (sell){ lines.push({id: 'abono', label: 'Abono pecuniário (10 dias vendidos)', amount: abono, kind: 'plus'}); lines.push({id: 'abono3', label: '1/3 do abono', amount: abonoThird, kind: 'plus'}); }
  if (inss > 0) lines.push({id: 'inss', label: regime === 'clt' ? 'INSS' : 'Previdência do servidor', amount: inss, kind: 'minus'});
  if (irrf > 0) lines.push({id: 'irrf', label: 'Imposto de renda', amount: irrf, kind: 'minus'});
  return {days: days, pay: pay, third: third, abono: abono + abonoThird, taxable: taxable, inss: inss, irrf: irrf, net: net, fgts: regime === 'clt' ? money(taxable * T.fgts) : 0, lines: lines};
}

export var REGIMES = [
  {id: 'clt', label: 'Empregado com carteira assinada (CLT)'},
  {id: 'servidor', label: 'Servidor público'},
  {id: 'mei', label: 'MEI'},
  {id: 'autonomo', label: 'Autônomo (pessoa física)'},
  {id: 'pj', label: 'PJ (empresa no Simples Nacional)'},
  {id: 'estagio', label: 'Estágio ou bolsa'},
  {id: 'outro', label: 'Outro (informo o desconto)'}
];
export function sumLines(lines, kind){ return sumMoney(lines.filter(function(l){ return l.kind === kind; }), function(l){ return l.amount; }); }
