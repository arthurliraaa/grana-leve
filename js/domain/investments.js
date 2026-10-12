/*
 * Onde o dinheiro da meta está aplicado e quanto isso rende ao ano (taxa bruta, antes do IR).
 * investment = {type, pct? (% do CDI), spread? (IPCA + x%), rate? (taxa fixa), auto? (atualizar pelo
 * Banco Central)}. idx = {cdi, selic, ipca} em % ao ano (CDI e Selic anualizados; IPCA dos últimos 12 meses).
 */
export var INVESTMENT_TYPES = [
  {id: '', label: 'Não informar', hint: 'A previsão usa a taxa que você digitar (ou nenhuma).'},
  {id: 'nenhum', label: 'Não rende (conta corrente, dinheiro)', hint: 'Sem rendimento.'},
  {id: 'poupanca', label: 'Poupança', hint: 'Regra oficial: 0,5% ao mês (mais a TR) quando a Selic passa de 8,5%; senão, 70% da Selic.', index: true},
  {id: 'caixinha', label: 'Caixinha ou conta remunerada (% do CDI)', hint: 'Nubank, Inter, PicPay, Mercado Pago… costumam pagar 100% do CDI.', pct: 100, index: true},
  {id: 'cdb', label: 'CDB (% do CDI)', hint: 'Veja no app do banco quanto do CDI ele paga (ex.: 100%, 110%).', pct: 100, index: true},
  {id: 'lci', label: 'LCI ou LCA (% do CDI)', hint: 'Isentas de IR; costumam pagar 85% a 95% do CDI.', pct: 90, index: true},
  {id: 'selic', label: 'Tesouro Selic', hint: 'Rende perto da taxa Selic.', index: true},
  {id: 'ipca', label: 'Tesouro IPCA+ (IPCA + taxa)', hint: 'Rende a inflação (IPCA) mais uma taxa fixa, ex.: IPCA + 6%.', spread: 6, index: true},
  {id: 'fixa', label: 'Outra, com taxa fixa ao ano', hint: 'Ex.: CDB prefixado de 12% ao ano.'}
];
export function investmentType(id){ return INVESTMENT_TYPES.filter(function(t){ return t.id === (id || ''); })[0] || INVESTMENT_TYPES[0]; }
// Valores de referência (Banco Central, outubro de 2026) para quando não há internet.
export var REFERENCE_INDEXES = {cdi: 13.65, selic: 13.75, ipca: 4.58, date: '2026-10-08', reference: true};

function round2(n){ return Math.round(n * 100) / 100; }
// Taxa ao ano (%) do tipo escolhido, com os índices dados. null = não dá para calcular (sem tipo).
export function annualRate(inv, idx){
  if (!inv || !inv.type) return null;
  idx = idx || REFERENCE_INDEXES;
  switch (inv.type){
    case 'nenhum': return 0;
    case 'poupanca': return idx.selic > 8.5 ? round2((Math.pow(1.005, 12) - 1) * 100) : round2(idx.selic * 0.7);
    case 'caixinha': case 'cdb': case 'lci': return round2(idx.cdi * (Number(inv.pct) || 100) / 100);
    case 'selic': return round2(idx.selic);
    case 'ipca': return round2(((1 + idx.ipca / 100) * (1 + (Number(inv.spread) || 0) / 100) - 1) * 100);
    case 'fixa': return round2(Number(inv.rate) || 0);
  }
  return null;
}
// Texto curto: "CDB 110% do CDI", "Tesouro IPCA+ 6%".
export function investmentLabel(inv){
  if (!inv || !inv.type) return '';
  var t = investmentType(inv.type);
  if (inv.type === 'caixinha') return 'Caixinha ' + fmtPct(inv.pct || 100) + ' do CDI';
  if (inv.type === 'cdb') return 'CDB ' + fmtPct(inv.pct || 100) + ' do CDI';
  if (inv.type === 'lci') return 'LCI/LCA ' + fmtPct(inv.pct || 90) + ' do CDI';
  if (inv.type === 'ipca') return 'Tesouro IPCA+ ' + fmtPct(inv.spread || 0);
  if (inv.type === 'fixa') return 'Taxa fixa de ' + fmtPct(inv.rate || 0) + ' ao ano';
  return t.label;
}
export function fmtPct(n){ return String(round2(Number(n) || 0)).replace('.', ',') + '%'; }
// Resposta da API do Banco Central (SGS): [{data: 'dd/mm/aaaa', valor: '13.65'}] -> {valor, date}.
export function parseSgs(rows){
  var r = Array.isArray(rows) && rows[rows.length - 1];
  var v = r && Number(String(r.valor).replace(',', '.'));
  if (!r || !isFinite(v)) return null;
  var p = String(r.data).split('/');
  return {value: v, date: p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : ''};
}
