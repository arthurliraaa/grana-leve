/*
 * Calculadora de salário líquido (estimativa), de acordo com o jeito de trabalhar: CLT, servidor, MEI, autônomo, PJ, estágio.
 * Descontos do contracheque por tipo (vale-transporte, plano de saúde, pensão…), horas extras de 50% e 100% com o descanso
 * semanal (DSR). Só o salário e os descontos fixos valem todo mês: horas extras e descontos que variam entram só no
 * líquido DESTE MÊS. Abre de “Previstas”, do simulador (ganho) e do formulário de ganho; “Usar” preenche o valor.
 * As contas ficam em js/domain/salary.js.
 */
import {fmtMoney} from '../domain/money.js';
import {netSalary, REGIMES, TABLES, DISCOUNT_TYPES, BONUS_TYPES} from '../domain/salary.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, optionsHtml, toast} from './dom.js';
import {openModal} from './modal.js';

var GROSS_LABEL = {clt: 'Salário bruto (o da carteira)', servidor: 'Salário bruto', mei: 'Quanto você fatura por mês', autonomo: 'Quanto você recebe por mês',
  pj: 'Quanto a empresa fatura por mês', estagio: 'Valor da bolsa', outro: 'Valor bruto por mês'};

function profile(){ return getPrefs().workProfile || {}; }
function num(v){ var n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
function typesOf(kind){ return kind === 'bonus' ? BONUS_TYPES : DISCOUNT_TYPES; }
function metaOf(kind, id){ return typesOf(kind).filter(function(t){ return t.id === id; })[0] || {}; }
function typeOptions(kind, sel){ return typesOf(kind).map(function(t){ return '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>'; }).join(''); }
// Uma linha de desconto ou de ganho extra: tipo, valor (R$ ou %), “varia todo mês”, (ganhos: “paga imposto”) e remover.
function rowHtml(kind, d){
  var bonus = kind === 'bonus';
  d = d || {type: bonus ? 'homeoffice' : 'vt', mode: 'fixed', value: '', varies: bonus ? !!metaOf(kind, 'homeoffice').varies : false};
  var meta = metaOf(kind, d.type), taxable = d.taxable === undefined ? meta.taxable !== false : !!d.taxable;
  return '<div class="sc-disc-row" data-kind="' + kind + '"><select class="sc-d-type" aria-label="' + (bonus ? 'Tipo de ganho extra' : 'Tipo de desconto') + '">' + typeOptions(kind, d.type) + '</select>' +
    '<span class="money-input sc-d-val"><input class="sc-d-value" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Valor" value="' + (d.value === '' || d.value === undefined ? '' : String(d.value).replace('.', ',')) + '">' +
    '<select class="sc-d-mode" aria-label="Em reais ou porcentagem"><option value="fixed"' + (d.mode !== 'pct' ? ' selected' : '') + '>R$</option><option value="pct"' + (d.mode === 'pct' ? ' selected' : '') + '>%</option></select></span>' +
    '<div class="sc-d-foot"><label class="check sc-d-varies"><input class="sc-d-var" type="checkbox"' + ((d.varies || meta.varies) ? ' checked' : '') + '> Varia todo mês</label>' +
    (bonus ? '<label class="check sc-d-taxl"><input class="sc-d-tax" type="checkbox"' + (taxable ? ' checked' : '') + '> Paga imposto</label>' : '') +
    '<button type="button" class="linklike sc-d-del" aria-label="Remover">Remover</button></div></div>';
}
function bodyHtml(){
  var p = profile(), discs = (p.discounts && p.discounts.length ? p.discounts : []), bonuses = (p.bonuses && p.bonuses.length ? p.bonuses : []);
  return '<p class="field-hint">Estimativa com as tabelas de ' + TABLES.year + '. Confira no seu holerite: pode ter adicionais, convenção coletiva e outros descontos.</p>' +
    '<div class="field"><label for="scRegime">Como você trabalha</label><select id="scRegime" name="regime">' + optionsHtml(REGIMES, p.regime || 'clt') + '</select></div>' +
    '<div class="sc-grid">' +
      '<div class="field"><label for="scGross" id="scGrossLbl">Salário bruto</label><span class="money-input"><span>R$</span><input id="scGross" name="gross" type="text" data-money autocomplete="off" inputmode="decimal"></span></div>' +
      '<div class="field" data-for="clt,servidor"><label for="scWeek">Jornada por semana</label><select id="scWeek" name="week">' + optionsHtml([{id: '44', label: '44 horas'}, {id: '40', label: '40 horas'}, {id: '36', label: '36 horas'}, {id: '30', label: '30 horas'}], String(p.weeklyHours || 44)) + '</select></div>' +
      '<div class="field" data-for="clt,servidor"><label for="scDep">Dependentes (imposto de renda)</label><input id="scDep" name="dep" type="number" min="0" max="10" step="1" placeholder="0" value="' + (p.dependents || '') + '"></div>' +
      '<div class="field" data-for="servidor"><label for="scRpps">Previdência do servidor (%)</label><input id="scRpps" name="rpps" type="number" min="0" max="25" step="0.5" value="' + (p.rpps === undefined ? 14 : p.rpps) + '"></div>' +
      '<div class="field" data-for="mei"><label for="scMei">Sua atividade</label><select id="scMei" name="mei">' + optionsHtml([{id: 'services', label: 'Serviços'}, {id: 'commerce', label: 'Comércio ou indústria'}, {id: 'both', label: 'Comércio e serviços'}], p.meiKind || 'services') + '</select></div>' +
      '<div class="field" data-for="autonomo"><label for="scInss">INSS</label><select id="scInss" name="inss">' + optionsHtml([{id: 'normal', label: 'Contribuo (20%, até o teto)'}, {id: 'simplificado', label: 'Plano simplificado (11% do salário mínimo)'}, {id: 'none', label: 'Não contribuo'}], p.inssKind || 'normal') + '</select></div>' +
      '<div class="field" data-for="pj"><label for="scSimples">Imposto do Simples (%)</label><input id="scSimples" name="simples" type="number" min="0" max="35" step="0.5" value="' + (p.simplesRate === undefined ? 6 : p.simplesRate) + '"></div>' +
      '<div class="field" data-for="outro"><label for="scOther">Desconto (%)</label><input id="scOther" name="otherpct" type="number" min="0" max="60" step="0.5" value="' + (p.otherPct || 0) + '"></div>' +
    '</div>' +
    '<fieldset class="sc-disc"><legend>Ganhos além do salário <span class="opt">(opcional)</span></legend><div id="scBonusList" class="sc-list">' + bonuses.map(function(b){ return rowHtml('bonus', b); }).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-add-bonus>+ Adicionar ganho</button>' +
      '<p class="field-hint">Auxílio home office, ajuda de custo, bonificação, comissão… Ajuda de custo e auxílios não pagam INSS nem imposto de renda; bonificação e comissão em dinheiro pagam; a bonificação recebida em vales ou cartão benefício não tem desconto. Ajuste em “Paga imposto” se na sua empresa for diferente.</p></fieldset>' +
    '<fieldset class="sc-disc"><legend>Descontos do contracheque <span class="opt">(opcional)</span></legend><div id="scDiscList" class="sc-list">' + discs.map(function(d){ return rowHtml('disc', d); }).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-add-disc>+ Adicionar desconto</button>' +
      '<p class="field-hint">Cada empresa desconta de um jeito (o vale-transporte, por exemplo, costuma ser bem menos que 6%): informe o valor em R$ ou em %. O que muda de mês para mês, marque “varia todo mês”: só entra no líquido do mês, não no fixo.</p></fieldset>' +
    '<fieldset class="sc-ot" data-for="clt,servidor"><legend>Horas extras e repouso <span class="opt">(variam todo mês, não entram no fixo)</span></legend>' +
      '<div class="sc-grid"><div class="field"><label for="scH50">Horas a 50% (dias úteis)</label><input id="scH50" name="h50" type="number" min="0" max="120" step="0.5" placeholder="0"></div>' +
      '<div class="field"><label for="scH100">Horas a 100% (domingos e feriados)</label><input id="scH100" name="h100" type="number" min="0" max="120" step="0.5" placeholder="0"></div>' +
      '<div class="field"><label for="scWork">Dias de trabalho no mês</label><input id="scWork" name="work" type="number" min="1" max="31" step="1" placeholder="25"></div>' +
      '<div class="field"><label for="scRest">Domingos e feriados (repouso)</label><input id="scRest" name="rest" type="number" min="0" max="12" step="1" placeholder="5"></div></div>' +
      '<label class="check"><input type="checkbox" name="dsr" checked> Incluir o repouso semanal remunerado (DSR) sobre as horas extras</label></fieldset>' +
    '<div id="scResult" class="sc-result" aria-live="polite"></div>' +
    '<div class="sc-use"><button type="button" class="btn btn-ghost btn-sm" data-use="month" hidden>Usar o líquido deste mês (só uma vez)</button></div>';
}
function readRows(form, kind){
  return qsa('.sc-disc-row[data-kind="' + kind + '"]', form).map(function(row){
    var o = {type: qs('.sc-d-type', row).value, mode: qs('.sc-d-mode', row).value, value: num(qs('.sc-d-value', row).value), varies: qs('.sc-d-var', row).checked};
    if (kind === 'bonus') o.taxable = qs('.sc-d-tax', row).checked;
    return o;
  }).filter(function(d){ return d.value > 0; });
}
function readOpts(form){
  var v = function(n){ return form.elements[n] ? form.elements[n].value : ''; };
  return {regime: v('regime') || 'clt', gross: v('gross'), weeklyHours: Number(v('week')) || 44, dependents: Number(v('dep')) || 0,
    rpps: v('rpps') === '' ? 14 : Number(v('rpps')), meiKind: v('mei'), inssKind: v('inss'), simplesRate: v('simples') === '' ? 6 : Number(v('simples')), otherPct: Number(v('otherpct')) || 0,
    discounts: readRows(form, 'disc'), bonuses: readRows(form, 'bonus'), h50: Number(v('h50')) || 0, h100: Number(v('h100')) || 0, workDays: Number(v('work')) || 0, restDays: v('rest') === '' ? undefined : Number(v('rest')),
    dsr: !!(form.elements.dsr && form.elements.dsr.checked)};
}
function resultHtml(r, regime){
  if (!(r.gross > 0)) return '<p class="tx-meta">Informe o valor para ver o líquido.</p>';
  return '<table class="data-table sc-table"><tbody>' + r.lines.map(function(l){
    return '<tr class="' + l.kind + '"><td>' + escapeHtml(l.label) + '</td><td class="tabular">' + (l.kind === 'minus' ? '− ' : l.kind === 'plus' ? '+ ' : '') + fmtMoney(l.amount) + '</td></tr>'; }).join('') +
    '<tr class="net"><td><strong>' + (r.hasVariable ? 'Líquido deste mês' : 'Líquido estimado') + '</strong></td><td class="tabular"><strong>' + fmtMoney(r.net) + '</strong></td></tr>' +
    (r.hasVariable ? '<tr class="net fixed"><td><strong>Líquido fixo (todo mês)</strong><br><small class="tx-meta">só o salário e os descontos que não variam</small></td><td class="tabular"><strong>' + fmtMoney(r.fixedNet) + '</strong></td></tr>' : '') +
    '</tbody></table>' +
    '<p class="tx-meta">Os descontos somam ' + fmtMoney(r.discounts) + ' (' + String(r.rate).replace('.', ',') + '% do total bruto).' +
    (r.hasVariable ? ' Horas extras, ganhos e descontos que variam mudam a cada mês: registre o fixo todo mês e lance o que variar no mês em que acontecer.' : '') +
    (regime === 'clt' || regime === 'servidor' ? ' O FGTS é depositado pela empresa e não sai do seu salário.' : '') + '</p>';
}

// Abre a calculadora. Devolve {net, kind: 'fixed'|'month', regime} ou null se a pessoa fechar.
export async function openSalaryCalculator(){
  var r = await openModal({
    title: 'Calcular o salário líquido', wide: true, submitLabel: 'Usar o líquido fixo (todo mês)', cancelLabel: 'Fechar', body: '<div class="sc-body">' + bodyHtml() + '</div>',
    onOpen: function(modal, close){
      var form = qs('form', modal) || modal;
      function sync(){
        var o = readOpts(form);
        qsa('[data-for]', modal).forEach(function(el){ el.hidden = el.getAttribute('data-for').split(',').indexOf(o.regime) < 0; });
        qs('#scGrossLbl', modal).textContent = GROSS_LABEL[o.regime];
        var res = netSalary(o);
        qs('#scResult', modal).innerHTML = resultHtml(res, o.regime);
        qs('[data-use=month]', modal).hidden = !res.hasVariable;
        form._res = res; form._opts = o;
      }
      modal.addEventListener('input', sync);
      modal.addEventListener('change', function(e){
        // Ao trocar o tipo do desconto, “varia todo mês” acompanha o costume daquele tipo (adiantamento varia; plano de saúde não).
        if (e.target.classList.contains('sc-d-type')){
          var row = e.target.closest('.sc-disc-row'), meta = metaOf(row.getAttribute('data-kind'), e.target.value);
          qs('.sc-d-var', row).checked = !!meta.varies;
          if (qs('.sc-d-tax', row)) qs('.sc-d-tax', row).checked = meta.taxable !== false;
        }
        sync();
      });
      modal.addEventListener('click', function(e){
        if (e.target.closest('[data-add-disc]')){ qs('#scDiscList', modal).insertAdjacentHTML('beforeend', rowHtml('disc')); sync(); }
        if (e.target.closest('[data-add-bonus]')){ qs('#scBonusList', modal).insertAdjacentHTML('beforeend', rowHtml('bonus')); sync(); }
        var del = e.target.closest('.sc-d-del');
        if (del){ del.closest('.sc-disc-row').remove(); sync(); }
      });
      qs('[data-use=month]', modal).addEventListener('click', function(){ if (form._res) close({net: form._res.net, kind: 'month', opts: form._opts}); });
      sync();
    },
    onSubmit: function(form){
      var res = form._res || netSalary(readOpts(form));
      if (!(res.gross > 0)) return {error: 'Informe o salário bruto.'};
      return {net: res.fixedNet, kind: 'fixed', opts: form._opts || readOpts(form)};
    }
  });
  if (!r || r === true) return null;
  var o = r.opts;
  setPref('workProfile', {regime: o.regime, weeklyHours: o.weeklyHours, dependents: o.dependents, rpps: o.rpps, meiKind: o.meiKind, inssKind: o.inssKind, simplesRate: o.simplesRate, otherPct: o.otherPct, discounts: o.discounts, bonuses: o.bonuses});
  return {net: r.net, kind: r.kind, regime: o.regime};
}

// Botões data-salary-calc="idDoCampo": abre a calculadora e preenche o campo com o líquido escolhido.
export function wireSalaryCalc(){
  document.addEventListener('click', async function(e){
    var b = e.target.closest('[data-salary-calc]');
    if (!b) return;
    var id = b.getAttribute('data-salary-calc'), field = document.getElementById(id);
    var res = await openSalaryCalculator();
    if (res && field){
      field.value = res.net;
      field.dispatchEvent(new Event('input', {bubbles: true})); field.dispatchEvent(new Event('change', {bubbles: true}));
      field.focus();
      // Valor do mês (com extras): vale só uma vez; em “Previstas” o “Repete todo mês” sai marcado para não repetir o que varia.
      if (res.kind === 'month'){
        var rec = id === 'fcAmount' ? document.getElementById('fcRecurring') : null;
        if (rec && rec.checked){ rec.checked = false; toast('Esse valor tem horas extras, ganhos ou descontos que variam, então deixei “Repete todo mês” desmarcado.'); }
      }
    }
  });
}
