/*
 * Calculadora de salário líquido (estimativa), de acordo com o jeito de trabalhar: CLT, servidor, MEI, autônomo, PJ, estágio.
 * Descontos do contracheque por tipo (vale-transporte, plano de saúde, pensão…), horas extras de 50% e 100% com o descanso
 * semanal (DSR). Só o salário e os descontos fixos valem todo mês: horas extras e descontos que variam entram só no
 * líquido DESTE MÊS. Abre de “Previstas”, do simulador (ganho) e do formulário de ganho; “Usar” preenche o valor.
 * As contas ficam em js/domain/salary.js.
 */
import {fmtMoney, money} from '../domain/money.js';
import {migrateJobs, activeJob, addJob, removeJob, setActive, renameJob, setProfile, ensureJob, jobById, summarizeJobs, MAX_JOBS} from '../domain/jobs.js';
import {netSalary, thirteenth, vacation, discountAmount, workdaysInMonth, REGIMES, TABLES, DISCOUNT_TYPES, BONUS_TYPES} from '../domain/salary.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, optionsHtml, toast} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {renderSalaryNotice} from './home-tab.js';

var GROSS_LABEL = {clt: 'Salário bruto (o da carteira)', servidor: 'Salário bruto', mei: 'Quanto você fatura por mês', autonomo: 'Quanto você recebe por mês',
  pj: 'Quanto a empresa fatura por mês', estagio: 'Valor da bolsa', outro: 'Valor bruto por mês'};

/* ---------- Empregos: cada um com o seu perfil (domain/jobs.js); preferências guardam a lista ---------- */
function jobsState(){ return migrateJobs(getPrefs()); }
function saveJobs(s){ setPref('workJobs', s); setPref('workProfile', activeJob(s).profile); }   // workProfile: cópia do ativo, para quem ainda lê o formato antigo
function profile(){ return activeJob(jobsState()).profile || {}; }
// O perfil (salário, descontos, ganhos) também viaja dentro da previsão do salário, para aparecer em outro aparelho:
// quem sincroniza chama estas funções (ver salary-plan.js). jobId: de qual emprego (padrão: o ativo).
export function getWorkProfile(jobId){ var s = jobsState(), j = jobId ? jobById(s, jobId) : activeJob(s); return j ? j.profile || {} : {}; }
export function setWorkProfile(p, jobId, name){
  var s = jobsState();
  if (jobId) s = ensureJob(s, jobId, name);
  saveJobs(setProfile(s, jobId || s.active, p));
}
export function getJobs(){ return jobsState(); }
export function activeJobId(){ return jobsState().active; }
export function jobName(jobId){ var j = jobById(jobsState(), jobId); return j ? j.name : ''; }
export function useJob(id){ saveJobs(setActive(jobsState(), id)); }
export function createJob(name){ var s = addJob(jobsState(), name || ''); saveJobs(s); return s.active; }
function netOfProfile(p){ var r = netSalary(Object.assign({}, p, {h50: 0, h100: 0, sobreaviso: 0})); return {gross: r.gross, fixedNet: r.fixedNet}; }
// Todos os empregos: [{id, name, gross, fixedNet}] e os totais.
export function jobsSummary(){ return summarizeJobs(jobsState(), netOfProfile); }
function num(v){ var n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
function typesOf(kind){ return kind === 'bonus' ? BONUS_TYPES : DISCOUNT_TYPES; }
function metaOf(kind, id){ return typesOf(kind).filter(function(t){ return t.id === id; })[0] || {}; }
function typeOptions(kind, sel){ return typesOf(kind).map(function(t){ return '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>'; }).join(''); }
// Uma linha de desconto ou de ganho extra: tipo, valor (R$ ou %), “varia todo mês”, (ganhos: “paga imposto”) e remover.
// Painel “pelo benefício”: o vale-transporte vem da passagem por dia × dias do mês (limitado a % do salário); os demais, do
// valor recebido no mês × % que a empresa desconta dele.
function benefitPanelHtml(d){
  var now = new Date(), days = workdaysInMonth(now.getFullYear(), now.getMonth()), f = function(v){ return v === undefined || v === '' ? '' : String(v).replace('.', ','); };
  return '<div class="sc-d-ben">' +
    '<div class="sc-ben-vt field"><label>Passagem por dia (ida e volta)</label><span class="money-input"><span>R$</span><input class="sc-b-daily" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + f(d.daily) + '"></span></div>' +
    '<div class="sc-ben-vt field"><label>Dias de uso no mês</label><input class="sc-b-days" type="number" min="0" max="31" step="1" value="' + days + '"></div>' +
    '<div class="sc-ben-vt field"><label>Desconto de até (% do salário)</label><input class="sc-b-pct-vt" type="number" min="0" max="100" step="0.5" value="' + (d.type === 'vt' && d.pct !== undefined ? d.pct : 6) + '"></div>' +
    '<div class="sc-ben-other field"><label>Valor recebido no mês</label><span class="money-input"><span>R$</span><input class="sc-b-recv" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + f(d.type !== 'vt' ? d.benefit : '') + '"></span></div>' +
    '<div class="sc-ben-other field"><label>Desconto do benefício (%)</label><input class="sc-b-pct" type="number" min="0" max="100" step="0.5" value="' + (d.type !== 'vt' && d.pct !== undefined ? d.pct : 20) + '"></div>' +
    '<div class="sc-ben-day field"><label>Cobrado no mês (R$)</label><span class="money-input"><span>R$</span><input class="sc-p-charged" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + f(d.charged) + '"></span></div>' +
    '<div class="sc-ben-day field"><label>Em quantos dias de uso</label><input class="sc-p-ref" type="number" min="1" max="31" step="1" value="' + (d.refDays || days) + '"></div>' +
    '<div class="sc-ben-day field"><label>Dias de uso deste mês</label><input class="sc-p-days" type="number" min="0" max="31" step="1" value="' + days + '"></div>' +
    '<p class="sc-d-calc field-hint" aria-live="polite"></p></div>';
}
function rowHtml(kind, d){
  var bonus = kind === 'bonus';
  d = d || {type: bonus ? 'homeoffice' : 'vt', mode: 'fixed', value: '', varies: bonus ? !!metaOf(kind, 'homeoffice').varies : false};
  var meta = metaOf(kind, d.type), taxable = d.taxable === undefined ? meta.taxable !== false : !!d.taxable;
  return '<div class="sc-disc-row" data-kind="' + kind + '"><select class="sc-d-type" aria-label="' + (bonus ? 'Tipo de ganho extra' : 'Tipo de desconto') + '">' + typeOptions(kind, d.type) + '</select>' +
    '<span class="money-input sc-d-val"><input class="sc-d-value" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Valor" value="' + (d.value === '' || d.value === undefined ? '' : String(d.value).replace('.', ',')) + '">' +
    '<select class="sc-d-mode" aria-label="Em reais, porcentagem ou pelo benefício"><option value="fixed"' + (d.mode === 'fixed' || !d.mode ? ' selected' : '') + '>R$</option><option value="pct"' + (d.mode === 'pct' ? ' selected' : '') + '>%</option>' + (bonus ? '' : '<option value="perday"' + (d.mode === 'perday' ? ' selected' : '') + '>por dias do mês</option><option value="benefit"' + (d.mode === 'benefit' ? ' selected' : '') + '>pelo benefício</option>') + '</select></span>' +
    (bonus ? '' : benefitPanelHtml(d)) +
    '<p class="sc-d-eq" aria-live="polite"></p>' +
    '<div class="sc-d-foot"><label class="check sc-d-varies"><input class="sc-d-var" type="checkbox"' + ((d.varies || meta.varies) ? ' checked' : '') + '> Varia todo mês</label>' +
    (bonus ? '<label class="check sc-d-taxl"><input class="sc-d-tax" type="checkbox"' + (taxable ? ' checked' : '') + '> Paga imposto</label>' : '') +
    '<button type="button" class="linklike sc-d-del" aria-label="Remover">Remover</button></div></div>';
}
// Barra de empregos: com um só, um link para adicionar outro; com mais, o seletor, o nome e remover. (Na confirmação mensal não aparece.)
function jobBarHtml(){
  var st = jobsState(), multi = st.list.length > 1;
  if (!multi) return '<div class="sc-jobbar"><button type="button" class="linklike sc-job-add" data-job-add>+ Tenho mais de um emprego</button></div>';
  var opts = st.list.map(function(j){ return '<option value="' + escapeHtml(j.id) + '"' + (j.id === st.active ? ' selected' : '') + '>' + escapeHtml(j.name) + '</option>'; }).join('') +
    (st.list.length < MAX_JOBS ? '<option value="__new">＋ Adicionar outro emprego</option>' : '');
  return '<div class="sc-jobbar"><div class="sc-grid"><div class="field"><label for="scJob">Emprego</label><select id="scJob">' + opts + '</select></div>' +
    '<div class="field"><label for="scJobName">Nome deste emprego</label><input id="scJobName" type="text" maxlength="40" autocomplete="off" value="' + escapeHtml(activeJob(st).name) + '"></div></div>' +
    '<button type="button" class="linklike sc-job-del" data-job-del>Remover este emprego</button></div>';
}
function bodyHtml(config){
  var p = profile(), discs = (p.discounts && p.discounts.length ? p.discounts : []), bonuses = (p.bonuses && p.bonuses.length ? p.bonuses : []);
  return '<p class="field-hint">Estimativa com as tabelas de ' + TABLES.year + '. Confira no seu holerite: pode ter adicionais, convenção coletiva e outros descontos.</p>' +
    (config && config.confirm ? '' : jobBarHtml()) +
    '<div class="field"><label for="scRegime">Como você trabalha</label><select id="scRegime" name="regime">' + optionsHtml(REGIMES, p.regime || 'clt') + '</select></div>' +
    '<div class="sc-grid">' +
      '<div class="field"><label for="scGross" id="scGrossLbl">Salário bruto</label><span class="money-input"><span>R$</span><input id="scGross" name="gross" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field" data-for="servidor"><label for="scRpps">Previdência do servidor (%)</label><input id="scRpps" name="rpps" type="number" min="0" max="25" step="0.5" value="' + (p.rpps === undefined ? 14 : p.rpps) + '"></div>' +
      '<div class="field" data-for="mei"><label for="scMei">Sua atividade</label><select id="scMei" name="mei">' + optionsHtml([{id: 'services', label: 'Serviços'}, {id: 'commerce', label: 'Comércio ou indústria'}, {id: 'both', label: 'Comércio e serviços'}], p.meiKind || 'services') + '</select></div>' +
      '<div class="field" data-for="autonomo"><label for="scInss">INSS</label><select id="scInss" name="inss">' + optionsHtml([{id: 'normal', label: 'Contribuo (20%, até o teto)'}, {id: 'simplificado', label: 'Plano simplificado (11% do salário mínimo)'}, {id: 'none', label: 'Não contribuo'}], p.inssKind || 'normal') + '</select></div>' +
      '<div class="field" data-for="pj"><label for="scSimples">Imposto do Simples (%)</label><input id="scSimples" name="simples" type="number" min="0" max="35" step="0.5" value="' + (p.simplesRate === undefined ? 6 : p.simplesRate) + '"></div>' +
      '<div class="field" data-for="outro"><label for="scOther">Desconto (%)</label><input id="scOther" name="otherpct" type="number" min="0" max="60" step="0.5" value="' + (p.otherPct || 0) + '"></div>' +
    '</div>' +
    '<p class="sc-headline" id="scHeadline" aria-live="polite"></p>' +
    '<div class="sc-jobs-sum" id="scJobsSum" hidden></div>' +
    '<details class="sc-sec" data-sec="work" data-for="clt,servidor"><summary>Jornada e dependentes <span class="opt" data-sum="work"></span></summary><div class="sc-sec-body"><div class="sc-grid">' +
      '<div class="field" data-for="clt,servidor"><label for="scWeek">Jornada por semana</label><select id="scWeek" name="week">' + optionsHtml([{id: '44', label: '44 horas'}, {id: '40', label: '40 horas'}, {id: '36', label: '36 horas'}, {id: '30', label: '30 horas'}], String(p.weeklyHours || 44)) + '</select></div>' +
      '<div class="field" data-for="clt,servidor"><label for="scDep">Dependentes (imposto de renda)</label><input id="scDep" name="dep" type="number" min="0" max="10" step="1" placeholder="0" value="' + (p.dependents || '') + '"></div>' +
    '</div></div></details>' +
    '<details class="sc-sec" data-sec="bonus"><summary>Ganhos além do salário <span class="opt" data-sum="bonus"></span></summary><div class="sc-sec-body"><div id="scBonusList" class="sc-list">' + bonuses.map(function(b){ return rowHtml('bonus', b); }).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-add-bonus>+ Adicionar ganho</button>' +
      '<p class="field-hint">Auxílio home office, ajuda de custo, bonificação, comissão… Ajuda de custo e auxílios não pagam INSS nem imposto de renda; bonificação e comissão em dinheiro pagam; a bonificação recebida em vales ou cartão benefício não tem desconto. Ajuste em “Paga imposto” se na sua empresa for diferente.</p></div></details>' +
    '<details class="sc-sec" data-sec="disc"><summary>Descontos do contracheque <span class="opt" data-sum="disc"></span></summary><div class="sc-sec-body"><div id="scDiscList" class="sc-list">' + discs.map(function(d){ return rowHtml('disc', d); }).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-add-disc>+ Adicionar desconto</button>' +
      '<p class="field-hint">Cada empresa desconta de um jeito (o vale-transporte, por exemplo, costuma ser bem menos que 6%): informe o valor em R$ ou em %. No vale-transporte e no vale-refeição há duas formas de acompanhar o mês: “por dias do mês” (você informa quanto foi cobrado e em quantos dias de uso; nos meses seguintes o valor se ajusta aos dias úteis, que você pode corrigir por causa de feriados) ou “pelo benefício” (passagem por dia × dias de uso, ou o valor do vale). O que muda de mês para mês, marque “varia todo mês”: só entra no líquido do mês, não no fixo. Tudo o que você informar fica guardado e já vem preenchido nos próximos meses: é só ajustar o que mudou.</p></div></details>' +
    '<details class="sc-sec" data-sec="ot" data-for="clt,servidor"><summary>Horas extras, sobreaviso e repouso <span class="opt" data-sum="ot"></span></summary><div class="sc-sec-body"><p class="field-hint">Variam todo mês: entram só no líquido do mês, não no fixo.</p>' +
      '<div class="sc-grid"><div class="field"><label for="scH50">Horas a 50% (dias úteis)</label><input id="scH50" name="h50" type="number" min="0" max="120" step="0.5" placeholder="0"></div>' +
      '<div class="field"><label for="scH100">Horas a 100% (domingos e feriados)</label><input id="scH100" name="h100" type="number" min="0" max="120" step="0.5" placeholder="0"></div>' +
      '<div class="field"><label for="scSa">Horas de sobreaviso (1/3 da hora normal)</label><input id="scSa" name="sa" type="number" min="0" max="400" step="1" placeholder="0"></div>' +
      '<div class="field"><label for="scWork">Dias de trabalho no mês</label><input id="scWork" name="work" type="number" min="1" max="31" step="1" placeholder="25"></div>' +
      '<div class="field"><label for="scRest">Domingos e feriados (repouso)</label><input id="scRest" name="rest" type="number" min="0" max="12" step="1" placeholder="5"></div></div>' +
      '<label class="check"><input type="checkbox" name="dsr" checked> Incluir o repouso semanal remunerado (DSR) sobre as horas extras</label></div></details>' +
    '<details class="sc-extra" data-for="clt,servidor"><summary>13º salário e férias <span class="opt" id="scExtraSum"></span></summary><div class="sc-extra-body">' +
      '<div class="sc-grid"><div class="field"><label for="scTM">Meses trabalhados no ano (13º)</label><input id="scTM" name="tm" type="number" min="0" max="12" step="1" placeholder="12"></div>' +
      '<div class="field"><label for="scVA">Média mensal de extras e adicionais</label><span class="money-input"><span>R$</span><input id="scVA" name="va" type="text" data-money autocomplete="off" inputmode="decimal" placeholder="0,00"></span></div>' +
      '<div class="field"><label for="scVD">Dias de férias</label><input id="scVD" name="vd" type="number" min="1" max="30" step="1" placeholder="30"></div>' +
      '<label class="check sc-vs"><input type="checkbox" name="vs"> Vender 10 dias (abono pecuniário)</label></div>' +
      '<p class="field-hint">Horas extras, adicionais e comissões entram no 13º e nas férias pela média do ano: informe a média mensal.</p>' +
      '<div id="scExtraRes"></div></div></details>' +
    '<div id="scResult" class="sc-result" aria-live="polite"></div>' +
    '<div class="sc-use"><button type="button" class="btn btn-ghost btn-sm" data-use="jobs" hidden>Usar o total dos empregos</button><button type="button" class="btn btn-ghost btn-sm" data-use="month" hidden>Usar o líquido deste mês (só uma vez)</button></div>';
}
function readRows(form, kind){
  return qsa('.sc-disc-row[data-kind="' + kind + '"]', form).map(function(row){
    var o = {type: qs('.sc-d-type', row).value, mode: qs('.sc-d-mode', row).value, value: num(qs('.sc-d-value', row).value), varies: qs('.sc-d-var', row).checked};
    if (kind === 'bonus') o.taxable = qs('.sc-d-tax', row).checked;
    else if (o.mode === 'perday'){ o.charged = num(qs('.sc-p-charged', row).value); o.refDays = Number(qs('.sc-p-ref', row).value) || 0; o.days = Number(qs('.sc-p-days', row).value) || 0; }
    else if (o.mode === 'benefit'){
      if (o.type === 'vt'){ o.daily = num(qs('.sc-b-daily', row).value); o.days = Number(qs('.sc-b-days', row).value) || 0; o.benefit = Math.round(o.daily * o.days * 100) / 100; o.pct = Number(qs('.sc-b-pct-vt', row).value) || 0; }
      else { o.benefit = num(qs('.sc-b-recv', row).value); o.pct = Number(qs('.sc-b-pct', row).value) || 0; }
    }
    return o;
  }).filter(function(d){ return d.mode === 'perday' ? d.charged > 0 && d.refDays > 0 : d.mode === 'benefit' ? d.benefit > 0 : d.value > 0; });
}
// Mostra/esconde o que depende do tipo e do modo da linha (o modo “pelo benefício” só existe para vale-transporte e vale-refeição).
function applyRow(row, gross){
  // Quanto o valor informado representa do salário (em %) ou em reais, para entender o desconto ou o ganho do mês.
  var mode0 = qs('.sc-d-mode', row).value, v0 = num(qs('.sc-d-value', row).value), eq = qs('.sc-d-eq', row);
  if (mode0 === 'benefit' || mode0 === 'perday' || !(v0 > 0) || !(gross > 0)) eq.textContent = '';
  else eq.textContent = mode0 === 'pct' ? 'Equivale a ' + fmtMoney(gross * v0 / 100) + ' neste salário.' : 'Equivale a ' + String(Math.round(v0 / gross * 10000) / 100).replace('.', ',') + '% do salário.';
  if (row.getAttribute('data-kind') !== 'disc') return;
  var type = qs('.sc-d-type', row).value, meta = metaOf('disc', type), mode = qs('.sc-d-mode', row);
  qsa('option[value=benefit], option[value=perday]', mode).forEach(function(opt){ opt.hidden = opt.disabled = !meta.benefit; });
  if (!meta.benefit && (mode.value === 'benefit' || mode.value === 'perday')) mode.value = 'fixed';
  var perday = mode.value === 'perday', ben = mode.value === 'benefit' || perday;
  row.classList.toggle('is-benefit', ben);
  qsa('.sc-ben-vt', row).forEach(function(el){ el.hidden = perday || type !== 'vt'; });
  qsa('.sc-ben-other', row).forEach(function(el){ el.hidden = perday || type === 'vt'; });
  qsa('.sc-ben-day', row).forEach(function(el){ el.hidden = !perday; });
  if (!ben) return;
  if (perday){
    var ch = num(qs('.sc-p-charged', row).value), ref = Number(qs('.sc-p-ref', row).value) || 0, used = Number(qs('.sc-p-days', row).value) || 0, o2 = qs('.sc-d-calc', row);
    o2.textContent = !(ch > 0 && ref > 0) ? 'Informe quanto foi cobrado num mês e em quantos dias de uso. Nos próximos meses o valor acompanha os dias do mês.'
      : 'Cobrado ' + fmtMoney(ch) + ' em ' + ref + ' dias = ' + fmtMoney(ch / ref) + ' por dia. Este mês, com ' + used + ' dias: ' + fmtMoney(discountAmount({mode: 'perday', charged: ch, refDays: ref, days: used}, gross)) + '.';
    return;
  }
  var out = qs('.sc-d-calc', row);
  var cur = {type: type, mode: 'benefit', benefit: 0, pct: 0};
  if (type === 'vt'){ cur.benefit = Math.round(num(qs('.sc-b-daily', row).value) * (Number(qs('.sc-b-days', row).value) || 0) * 100) / 100; cur.pct = Number(qs('.sc-b-pct-vt', row).value) || 0; }
  else { cur.benefit = num(qs('.sc-b-recv', row).value); cur.pct = Number(qs('.sc-b-pct', row).value) || 0; }
  if (!(cur.benefit > 0)){ out.textContent = type === 'vt' ? 'Informe a passagem por dia e os dias de uso para calcular o vale e o desconto.' : 'Informe quanto recebeu no mês para calcular o desconto.'; return; }
  var disc = discountAmount(cur, gross);
  out.textContent = type === 'vt'
    ? 'Vale do mês: ' + fmtMoney(cur.benefit) + '. Desconto: ' + fmtMoney(disc) + (gross > 0 ? ' (' + cur.pct + '% do salário seria ' + fmtMoney(gross * cur.pct / 100) + '; o desconto nunca passa do valor do vale).' : '.')
    : 'Recebeu ' + fmtMoney(cur.benefit) + ' no mês. Desconto: ' + fmtMoney(disc) + ' (' + cur.pct + '% do benefício).';
}
function readOpts(form){
  var v = function(n){ return form.elements[n] ? form.elements[n].value : ''; };
  return {regime: v('regime') || 'clt', gross: v('gross'), weeklyHours: Number(v('week')) || 44, dependents: Number(v('dep')) || 0,
    rpps: v('rpps') === '' ? 14 : Number(v('rpps')), meiKind: v('mei'), inssKind: v('inss'), simplesRate: v('simples') === '' ? 6 : Number(v('simples')), otherPct: Number(v('otherpct')) || 0,
    discounts: readRows(form, 'disc'), bonuses: readRows(form, 'bonus'), h50: Number(v('h50')) || 0, h100: Number(v('h100')) || 0, sobreaviso: Number(v('sa')) || 0, varAvg: Number(v('va')) || 0, thirdMonths: v('tm') === '' ? undefined : Number(v('tm')), vacDays: v('vd') === '' ? undefined : Number(v('vd')), vacSell: !!(form.elements.vs && form.elements.vs.checked), workDays: Number(v('work')) || 0, restDays: v('rest') === '' ? undefined : Number(v('rest')),
    dsr: !!(form.elements.dsr && form.elements.dsr.checked)};
}
function resultHtml(r, regime){
  if (!(r.gross > 0)) return '<p class="tx-meta">Informe o valor para ver o líquido.</p>';
  return '<table class="data-table sc-table"><tbody>' + r.lines.map(function(l){
    return '<tr class="' + l.kind + '"><td>' + escapeHtml(l.label) + '</td><td class="tabular">' + (l.kind === 'minus' ? '− ' : l.kind === 'plus' ? '+ ' : '') + fmtMoney(l.amount) + '</td></tr>'; }).join('') +
    '<tr class="net"><td><strong>' + (r.hasVariable ? 'Líquido deste mês' : 'Líquido estimado') + '</strong></td><td class="tabular"><strong>' + fmtMoney(r.net) + '</strong></td></tr>' +
    (r.hasVariable ? '<tr class="net fixed"><td><strong>Líquido fixo (todo mês)</strong><br><small class="tx-meta">só o salário e os descontos que não variam</small></td><td class="tabular"><strong>' + fmtMoney(r.fixedNet) + '</strong></td></tr>' : '') +
    (r.fgts > 0 ? '<tr class="info"><td>FGTS que a empresa deposita (8%)<br><small class="tx-meta">não sai do seu salário: vai para a sua conta do FGTS' + (r.hasVariable ? '; no fixo seria ' + fmtMoney(r.fixedFgts) : '') + '</small></td><td class="tabular">' + fmtMoney(r.fgts) + '</td></tr>' : '') +
    '</tbody></table>' +
    '<p class="tx-meta">Os descontos somam ' + fmtMoney(r.discounts) + ' (' + String(r.rate).replace('.', ',') + '% do total bruto).' +
    (r.hasVariable ? ' Horas extras, sobreaviso, ganhos e descontos que variam mudam a cada mês: registre o fixo todo mês e lance o que variar no mês em que acontecer.' : '') +
    (regime === 'servidor' ? ' Servidor estatutário não tem FGTS.' : '') + '</p>';
}

// 13º e férias (estimativas à parte do salário do mês): tabelas e os botões para usar cada valor.
function extraTable(title, r, rows){
  return '<h5>' + title + '</h5><table class="data-table sc-table"><tbody>' + r.lines.map(function(l){
    return '<tr class="' + l.kind + '"><td>' + escapeHtml(l.label) + '</td><td class="tabular">' + (l.kind === 'minus' ? '− ' : l.kind === 'plus' ? '+ ' : '') + fmtMoney(l.amount) + '</td></tr>'; }).join('') + rows +
    (r.fgts > 0 ? '<tr class="info"><td>FGTS que a empresa deposita (8%)<br><small class="tx-meta">não sai de você</small></td><td class="tabular">' + fmtMoney(r.fgts) + '</td></tr>' : '') + '</tbody></table>';
}
function extraHtml(t, v){
  if (!t || !v) return '';
  return extraTable('13º salário', t,
    '<tr class="info"><td>1ª parcela (até 30/11): metade, sem descontos</td><td class="tabular">' + fmtMoney(t.first) + '</td></tr>' +
    '<tr class="info"><td>2ª parcela (até 20/12): com INSS e imposto</td><td class="tabular">' + fmtMoney(t.second) + '</td></tr>' +
    '<tr class="net"><td><strong>Líquido do 13º</strong></td><td class="tabular"><strong>' + fmtMoney(t.net) + '</strong></td></tr>') +
    '<div class="sc-use"><button type="button" class="btn btn-ghost btn-sm" data-use="third1">Usar a 1ª parcela</button><button type="button" class="btn btn-ghost btn-sm" data-use="third2">Usar a 2ª parcela</button></div>' +
    extraTable('Férias', v, '<tr class="net"><td><strong>Líquido das férias</strong></td><td class="tabular"><strong>' + fmtMoney(v.net) + '</strong></td></tr>') +
    '<div class="sc-use"><button type="button" class="btn btn-ghost btn-sm" data-use="vacation">Usar o líquido das férias</button></div>' +
    '<p class="tx-meta">Estimativas à parte do salário do mês: o 13º é tributado sozinho (INSS e imposto só na 2ª parcela) e as férias têm o terço constitucional; o imposto real das férias pode mudar com o que se recebe no mesmo mês.</p>';
}

// Resumo de cada parte recolhida (o título mostra o que há dentro) e a manchete com o líquido, sempre à vista.
function sectionSummaries(o, res){
  var discTotal = money(res.lines.filter(function(l){ return l.id.indexOf('d:') === 0; }).reduce(function(t, l){ return t + l.amount; }, 0));
  var ot = [];
  if (o.h50 || o.h100) ot.push((o.h50 + o.h100) + ' h extras');
  if (o.sobreaviso) ot.push(o.sobreaviso + ' h de sobreaviso');
  return {
    work: '(' + o.weeklyHours + ' h por semana · ' + (o.dependents || 'sem') + (o.dependents === 1 ? ' dependente)' : o.dependents ? ' dependentes)' : ' dependentes)'),
    bonus: o.bonuses.length ? '(' + o.bonuses.length + ' · ' + fmtMoney(res.bonuses) + ')' : '(nenhum)',
    disc: o.discounts.length ? '(' + o.discounts.length + ' · ' + fmtMoney(discTotal) + ')' : '(nenhum)',
    ot: ot.length ? '(' + ot.join(' · ') + ')' : '(nenhuma)'
  };
}
function headlineHtml(res){
  if (!(res.gross > 0)) return 'Informe o salário bruto para ver o líquido.';
  return (res.hasVariable ? 'Líquido deste mês: ' : 'Líquido estimado: ') + '<strong>' + fmtMoney(res.net) + '</strong>' + (res.hasVariable ? ' · fixo todo mês: <strong>' + fmtMoney(res.fixedNet) + '</strong>' : '');
}

// O que a pessoa já informou fica guardado (salário, descontos e ganhos): nos meses seguintes já vem preenchido, mesmo se ela
// só fechar a calculadora. Os dias de uso do vale-transporte não ficam: mudam todo mês.
function saveProfile(o){
  var st = jobsState();
  saveJobs(setProfile(st, st.active, {updatedAt: Date.now(), regime: o.regime, gross: Number(o.gross) || 0, weeklyHours: o.weeklyHours, dependents: o.dependents, rpps: o.rpps, meiKind: o.meiKind, inssKind: o.inssKind, simplesRate: o.simplesRate, otherPct: o.otherPct,
    discounts: o.discounts.map(function(d){ var c = Object.assign({}, d); delete c.days; return c; }), bonuses: o.bonuses}));
}

// O que foi guardado da calculadora (salário, descontos, ganhos): {gross, fixedNet} ou null se ainda não calculou.
// O que a pessoa calculou: o total de todos os empregos (o simulador e o convite do Início usam este) ou null se ainda não calculou.
export function savedSalary(){
  var sum = jobsSummary();
  if (!(sum.fixedNet > 0)) return null;
  return {gross: sum.gross, fixedNet: sum.fixedNet, regime: profile().regime || 'clt', jobs: sum.rows, count: sum.count};
}
// O emprego ativo (o que está na calculadora): para criar a previsão do salário dele.
export function activeSalary(){
  var p = profile();
  if (!(Number(p.gross) > 0)) return null;
  var r = netOfProfile(p);
  return {gross: r.gross, fixedNet: r.fixedNet, regime: p.regime || 'clt'};
}

// Abre a calculadora. Devolve {net, kind: 'fixed'|'month', regime, res, opts} ou null se a pessoa fechar.
// opts.confirm: modo “o salário caiu?”: o botão principal registra o líquido DESTE MÊS (com o que variou) e opts.extraHtml
// (conta, data) entra depois do resultado; o retorno traz accountId e date.
// Abre a calculadora. Trocar, adicionar ou remover emprego fecha e reabre com o emprego certo (o que foi digitado já está guardado).
export async function openSalaryCalculator(config){
  var res = null;
  for (var guard = 0; guard < 25; guard++){
    res = await openCalculatorOnce(config || {});
    if (!res || !res.jobAction) break;
    var a = res.jobAction;
    if (a.type === 'switch') useJob(a.id);
    else if (a.type === 'new') createJob('');
    else if (a.type === 'del'){
      var st = jobsState();
      if (await confirmAction({title: 'Remover este emprego?', message: 'Remove “' + activeJob(st).name + '” da calculadora (salário, descontos e ganhos dele). Se ele tem previsão de salário, a previsão continua em Meu salário e pode ser parada lá.', confirmLabel: 'Remover'})) saveJobs(removeJob(st, st.active));
    }
  }
  renderSalaryNotice();
  return res && res.jobAction ? null : res;
}
async function openCalculatorOnce(config){
  config = config || {};
  var r = await openModal({
    title: config.title || 'Calcular o salário líquido', wide: true, submitLabel: config.submitLabel || 'Usar o líquido fixo (todo mês)', cancelLabel: config.cancelLabel || 'Fechar',
    body: (config.introHtml || '') + '<div class="sc-body">' + bodyHtml(config) + '</div>' + (config.extraHtml || ''),
    onOpen: function(modal, close){
      var form = qs('form', modal) || modal, saved = profile();
      if (saved.gross > 0) qs('#scGross', modal).value = saved.gross;
      // Só o essencial aparece de início (regime e salário bruto, com o líquido logo abaixo). As partes recolhidas abrem sozinhas
      // quando já têm conteúdo guardado, e na confirmação mensal abrem as que mudam de mês para mês.
      qsa('.sc-sec', modal).forEach(function(sec){
        var name = sec.getAttribute('data-sec');
        sec.open = (name === 'disc' && (saved.discounts || []).length > 0) || (name === 'bonus' && (saved.bonuses || []).length > 0) || (!!config.confirm && (name === 'disc' || name === 'bonus' || name === 'ot'));
      });
      function sync(){
        var o = readOpts(form);
        qsa('[data-for]', modal).forEach(function(el){ el.hidden = el.getAttribute('data-for').split(',').indexOf(o.regime) < 0; });
        qs('#scGrossLbl', modal).textContent = GROSS_LABEL[o.regime];
        var gross = Number(o.gross) || 0;
        qsa('.sc-disc-row', modal).forEach(function(row){ applyRow(row, gross); });
        var res = netSalary(o);
        qs('#scResult', modal).innerHTML = resultHtml(res, o.regime);
        qs('[data-use=month]', modal).hidden = config.confirm || !res.hasVariable;
        form._res = res; form._opts = o;
        var t13 = gross > 0 ? thirteenth(o) : null, vac = gross > 0 ? vacation(o) : null;
        form._extra = {third: t13, vac: vac};
        qs('#scExtraRes', modal).innerHTML = extraHtml(t13, vac);
        qs('#scExtraSum', modal).textContent = t13 && vac ? '(13º ' + fmtMoney(t13.net) + ' · férias ' + fmtMoney(vac.net) + ')' : '';
        var sums = sectionSummaries(o, res);
        qsa('[data-sum]', modal).forEach(function(el){ el.textContent = sums[el.getAttribute('data-sum')] || ''; });
        qs('#scHeadline', modal).innerHTML = headlineHtml(res);
        saveProfile(o);
        // Com mais de um emprego: o líquido fixo de cada um e o total (calculados à parte, como cada empresa desconta).
        var st = jobsState(), box = qs('#scJobsSum', modal), sum = jobsSummary();
        box.hidden = config.confirm || st.list.length < 2 || sum.count < 1;
        if (!box.hidden) box.innerHTML = '<strong>Todos os empregos</strong><ul>' + sum.rows.map(function(r){ return '<li><span>' + escapeHtml(r.name) + '</span><b class="tabular">' + (r.fixedNet > 0 ? fmtMoney(r.fixedNet) : 'ainda não calculado') + '</b></li>'; }).join('') +
          '</ul><div class="sc-jobs-total"><span>Líquido fixo somado</span><b class="tabular">' + fmtMoney(sum.fixedNet) + '</b></div>' +
          '<p class="tx-meta">Cada emprego é calculado à parte, como cada empresa desconta. O INSS tem teto somando todos os empregos e o imposto de renda final se acerta na declaração: é uma estimativa.</p>';
        qs('[data-use=jobs]', modal).hidden = config.confirm || st.list.length < 2 || sum.count < 2;
      }
      modal.addEventListener('input', function(e){
        if (e.target.id === 'scJobName'){
          var st0 = jobsState(); saveJobs(renameJob(st0, st0.active, e.target.value));
          var opt = qs('#scJob option:checked', modal); if (opt) opt.textContent = activeJob(jobsState()).name;   // o nome no seletor acompanha
          sync(); return;
        }
        sync();
      });
      modal.addEventListener('change', function(e){
        // Trocar de emprego (ou adicionar outro) fecha e reabre a calculadora com o emprego escolhido; o que foi digitado já está guardado.
        if (e.target.id === 'scJob'){ close({jobAction: e.target.value === '__new' ? {type: 'new'} : {type: 'switch', id: e.target.value}}); return; }
        // Ao trocar o tipo do desconto, “varia todo mês” acompanha o costume daquele tipo (adiantamento varia; plano de saúde não).
        if (e.target.classList.contains('sc-d-type')){
          var row = e.target.closest('.sc-disc-row'), meta = metaOf(row.getAttribute('data-kind'), e.target.value);
          qs('.sc-d-var', row).checked = !!meta.varies;
          if (qs('.sc-d-tax', row)) qs('.sc-d-tax', row).checked = meta.taxable !== false;
          if (row.getAttribute('data-kind') === 'disc' && (qs('.sc-d-mode', row).value === 'benefit' || qs('.sc-d-mode', row).value === 'perday') && !meta.benefit) qs('.sc-d-mode', row).value = 'fixed';
        }
        sync();
      });
      modal.addEventListener('click', function(e){
        if (e.target.closest('[data-add-disc]')){ qs('#scDiscList', modal).insertAdjacentHTML('beforeend', rowHtml('disc')); sync(); }
        if (e.target.closest('[data-job-add]')){ close({jobAction: {type: 'new'}}); return; }
        if (e.target.closest('[data-job-del]')){ close({jobAction: {type: 'del'}}); return; }
        if (e.target.closest('[data-add-bonus]')){ qs('#scBonusList', modal).insertAdjacentHTML('beforeend', rowHtml('bonus')); sync(); }
        var del = e.target.closest('.sc-d-del');
        if (del){ del.closest('.sc-disc-row').remove(); sync(); }
      });
      qs('[data-use=jobs]', modal).addEventListener('click', function(){ if (form._res) close({net: jobsSummary().fixedNet, kind: 'fixed', res: form._res, opts: form._opts}); });
      qs('[data-use=month]', modal).addEventListener('click', function(){ if (form._res) close({net: form._res.net, kind: 'month', res: form._res, opts: form._opts}); });
      // Usar o valor de uma parcela do 13º ou das férias (cada um vale uma vez só).
      modal.addEventListener('click', function(e){
        var u = e.target.closest('[data-use]'), kind = u && u.getAttribute('data-use'), x = form._extra;
        if (!x || !x.third || !(kind === 'third1' || kind === 'third2' || kind === 'vacation')) return;
        close({net: kind === 'third1' ? x.third.first : kind === 'third2' ? x.third.second : x.vac.net, kind: kind, res: form._res, opts: form._opts});
      });
      sync();
    },
    onSubmit: function(form){
      var res = form._res || netSalary(readOpts(form));
      if (!(res.gross > 0)) return {error: 'Informe o salário bruto.'};
      if (config.confirm) return {net: res.net, kind: 'month', res: res, opts: form._opts || readOpts(form), accountId: form.acc ? (form.acc.value || null) : null, date: form.caiuDate ? form.caiuDate.value : ''};
      return {net: res.fixedNet, kind: 'fixed', res: res, opts: form._opts || readOpts(form)};
    }
  });
  if (r && r.jobAction) return {jobAction: r.jobAction};
  if (!r || r === true) return null;
  var o = r.opts;
  saveProfile(o);
  return {net: r.net, kind: r.kind, regime: o.regime, res: r.res, opts: o, accountId: r.accountId, date: r.date};
}

// Botão data-salary-calc="idDoCampo" (chamado por js/ui/shell.js quando alguém toca nele): abre a calculadora e preenche o campo
// com o líquido escolhido.
export async function runSalaryCalcButton(b){
  var id = b.getAttribute('data-salary-calc'), field = document.getElementById(id);
  var res = await openSalaryCalculator();
  if (res && field){
    field.value = res.net;
    field.dispatchEvent(new Event('input', {bubbles: true})); field.dispatchEvent(new Event('change', {bubbles: true}));
    field.focus();
    // Valor do mês (com extras): vale só uma vez; em “Previstas” o “Repete todo mês” sai marcado para não repetir o que varia.
    if (res.kind !== 'fixed'){
      var rec = id === 'fcAmount' ? document.getElementById('fcRecurring') : null;
      if (rec && rec.checked){ rec.checked = false; toast('Esse valor vale só para um mês (extras, ganhos, descontos que variam, 13º ou férias), então deixei “Repete todo mês” desmarcado.'); }
    }
  }
}
