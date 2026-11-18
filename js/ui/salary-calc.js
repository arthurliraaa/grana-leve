/*
 * Calculadora de salário líquido (estimativa), de acordo com o jeito de trabalhar: CLT, servidor, MEI, autônomo, PJ, estágio.
 * Com horas extras (50% e 100%, com o reflexo no descanso semanal). Abre de “Previstas”, do simulador (ganho) e do
 * formulário de ganho; “Usar o líquido” preenche o campo de valor. As contas ficam em js/domain/salary.js.
 */
import {fmtMoney} from '../domain/money.js';
import {netSalary, REGIMES, TABLES} from '../domain/salary.js';
import {getPrefs, setPref} from '../data/session.js';
import {qs, qsa, escapeHtml, optionsHtml} from './dom.js';
import {openModal} from './modal.js';

var GROSS_LABEL = {clt: 'Salário bruto (o da carteira)', servidor: 'Salário bruto', mei: 'Quanto você fatura por mês', autonomo: 'Quanto você recebe por mês',
  pj: 'Quanto a empresa fatura por mês', estagio: 'Valor da bolsa', outro: 'Valor bruto por mês'};

function profile(){ return getPrefs().workProfile || {}; }
function bodyHtml(){
  var p = profile();
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
      '<div class="field"><label for="scHealth">Outros descontos fixos <span class="opt">(plano de saúde etc.)</span></label><span class="money-input"><span>R$</span><input id="scHealth" name="health" type="text" data-money autocomplete="off" inputmode="decimal" value="' + (p.health || '') + '"></span></div>' +
    '</div>' +
    '<label class="check" data-for="clt"><input type="checkbox" name="vt"' + (p.vt ? ' checked' : '') + '> Desconta vale-transporte (6% do salário)</label>' +
    '<fieldset class="sc-ot" data-for="clt,servidor"><legend>Horas extras no mês <span class="opt">(opcional)</span></legend>' +
      '<div class="sc-grid"><div class="field"><label for="scH50">Horas a 50% (dias úteis)</label><input id="scH50" name="h50" type="number" min="0" max="120" step="0.5" placeholder="0"></div>' +
      '<div class="field"><label for="scH100">Horas a 100% (domingos e feriados)</label><input id="scH100" name="h100" type="number" min="0" max="120" step="0.5" placeholder="0"></div></div>' +
      '<label class="check"><input type="checkbox" name="dsr" checked> Incluir o reflexo no descanso semanal (DSR), estimado</label></fieldset>' +
    '<div id="scResult" class="sc-result" aria-live="polite"></div>' +
    '<div class="sc-use"><button type="button" class="btn btn-ghost btn-sm" data-use="total" hidden>Usar o líquido com as horas extras</button></div>';
}
function readOpts(form){
  var v = function(n){ return form.elements[n] ? form.elements[n].value : ''; };
  return {regime: v('regime') || 'clt', gross: v('gross'), weeklyHours: Number(v('week')) || 44, dependents: Number(v('dep')) || 0, vt: !!(form.elements.vt && form.elements.vt.checked),
    rpps: v('rpps') === '' ? 14 : Number(v('rpps')), meiKind: v('mei'), inssKind: v('inss'), simplesRate: v('simples') === '' ? 6 : Number(v('simples')), otherPct: Number(v('otherpct')) || 0,
    health: v('health'), h50: Number(v('h50')) || 0, h100: Number(v('h100')) || 0, dsr: !!(form.elements.dsr && form.elements.dsr.checked)};
}
function resultHtml(r, regime){
  if (!(r.gross > 0)) return '<p class="tx-meta">Informe o valor para ver o líquido.</p>';
  return '<table class="data-table sc-table"><tbody>' + r.lines.map(function(l){
    return '<tr class="' + l.kind + '"><td>' + escapeHtml(l.label) + '</td><td class="tabular">' + (l.kind === 'minus' ? '− ' : l.kind === 'plus' ? '+ ' : '') + fmtMoney(l.amount) + '</td></tr>'; }).join('') +
    '<tr class="net"><td><strong>Líquido estimado' + (r.extras > 0 ? ' (com as horas extras)' : '') + '</strong></td><td class="tabular"><strong>' + fmtMoney(r.net) + '</strong></td></tr></tbody></table>' +
    '<p class="tx-meta">Os descontos somam ' + fmtMoney(r.discounts) + ' (' + String(r.rate).replace('.', ',') + '% do total bruto).' + (r.extras > 0 ? ' Sem as horas extras, o líquido fixo é de <strong>' + fmtMoney(r.fixedNet) + '</strong>.' : '') +
    (regime === 'clt' || regime === 'servidor' ? ' O FGTS é depositado pela empresa e não sai do seu salário.' : '') + '</p>';
}

// Abre a calculadora. Devolve {net, kind: 'fixed'|'total', regime} ou null se a pessoa fechar.
export async function openSalaryCalculator(){
  var r = await openModal({
    title: 'Calcular o salário líquido', wide: true, submitLabel: 'Usar o líquido fixo', cancelLabel: 'Fechar', body: '<div class="sc-body">' + bodyHtml() + '</div>',
    onOpen: function(modal, close){
      var form = qs('form', modal) || modal;
      function sync(){
        var o = readOpts(form);
        qsa('[data-for]', modal).forEach(function(el){ el.hidden = el.getAttribute('data-for').split(',').indexOf(o.regime) < 0; });
        qs('#scGrossLbl', modal).textContent = GROSS_LABEL[o.regime];
        var res = netSalary(o);
        qs('#scResult', modal).innerHTML = resultHtml(res, o.regime);
        qs('[data-use=total]', modal).hidden = !(res.extras > 0);
        form._res = res; form._opts = o;
      }
      modal.addEventListener('input', sync); modal.addEventListener('change', sync);
      qs('[data-use=total]', modal).addEventListener('click', function(){ if (form._res) close({net: form._res.net, kind: 'total', opts: form._opts}); });
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
  setPref('workProfile', {regime: o.regime, weeklyHours: o.weeklyHours, dependents: o.dependents, vt: o.vt, rpps: o.rpps, meiKind: o.meiKind, inssKind: o.inssKind, simplesRate: o.simplesRate, otherPct: o.otherPct, health: o.health});
  return {net: r.net, kind: r.kind, regime: o.regime};
}

// Botões data-salary-calc="idDoCampo": abre a calculadora e preenche o campo com o líquido escolhido.
export function wireSalaryCalc(){
  document.addEventListener('click', async function(e){
    var b = e.target.closest('[data-salary-calc]');
    if (!b) return;
    var field = document.getElementById(b.getAttribute('data-salary-calc'));
    var res = await openSalaryCalculator();
    if (res && field){
      field.value = res.net;
      field.dispatchEvent(new Event('input', {bubbles: true})); field.dispatchEvent(new Event('change', {bubbles: true}));
      field.focus();
    }
  });
}
