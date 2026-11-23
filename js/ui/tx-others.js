/*
 * “Pagou por alguém ou vai dividir?” dentro do popup de lançamento (o do botão +, que é o único formulário no celular).
 * Mesma lógica do formulário da aba Ganhos e gastos, com ids próprios (prefixo "m") para os dois não se misturarem.
 * A gravação (os “A receber” ligados ao gasto) é a mesma: attachOthers, em tx-list.js.
 */
import {money, fmtMoney} from '../domain/money.js';
import {qs, qsa, autoFocus} from './dom.js';
import {splitRowHtml, splitSummaryText} from './tx-list.js';

export function othersHtml(){
  return '<details class="more-options" id="mOthers" hidden>' +
    '<summary><span>Pagou por alguém ou vai dividir com outras pessoas?</span><span class="opt">opcional</span></summary>' +
    '<div class="option-cards">' +
      '<label class="option-card"><input type="checkbox" id="mForOther" name="forOther"><span><strong>Paguei por outra pessoa</strong><small>Ela vai te devolver tudo. Não conta como gasto seu e vai para “Me devem”.</small></span></label>' +
      '<label class="option-card"><input type="checkbox" id="mSplit" name="split"><span><strong>Dividir com outras pessoas</strong><small>Cada um paga uma parte (ex.: família). Só a sua parte conta como gasto; a dos outros vai para “Me devem”.</small></span></label>' +
    '</div>' +
    '<fieldset class="prior-box" id="mPriorBox" hidden><legend id="mPriorText">As primeiras parcelas já venceram antes deste cadastro.</legend>' +
      '<label class="check"><input type="radio" name="mPrior" value="paid" checked> já me devolveu essas parcelas</label>' +
      '<label class="check"><input type="radio" name="mPrior" value="owed"> ainda me deve essas parcelas</label></fieldset>' +
    '<div class="field other-name"><label for="mOtherName" id="mOtherHint" hidden>Quem vai te devolver?</label>' +
      '<input id="mOtherName" name="otherName" type="text" list="peopleList" autocomplete="off" maxlength="60" placeholder="Nome da pessoa" hidden></div>' +
    '<div class="split-box" id="mSplitBox" hidden>' +
      '<fieldset class="radio-group split-head"><legend>Dividir por</legend>' +
        '<label class="check"><input type="radio" name="mSplitMode" value="valor" checked> valor (R$)</label>' +
        '<label class="check"><input type="radio" name="mSplitMode" value="pct"> porcentagem (%)</label>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="mSplitEqual">Dividir igualmente</button></fieldset>' +
      '<div id="mSplitRows"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="mSplitAdd" style="justify-self:start">+ Adicionar pessoa</button>' +
      '<p class="field-hint tabular" id="mSplitSummary" aria-live="polite"></p>' +
    '</div>' +
  '</details>';
}

// ctx: {isExpense(), info() -> {n, start, total, perPurchase, onCard}} (parcelas, 1ª ainda não vencida e total da compra)
export function wireOthers(modal, ctx){
  var box = qs('#mOthers', modal), forOther = qs('#mForOther', modal), split = qs('#mSplit', modal);
  var rows = qs('#mSplitRows', modal);
  function pct(){ return qs('input[name=mSplitMode]:checked', modal).value === 'pct'; }
  function units(){ qsa('.sp-unit', rows).forEach(function(u){ u.textContent = pct() ? '%' : 'R$'; }); }
  function addRow(){
    var row = document.createElement('div');
    row.className = 'split-row';
    row.innerHTML = splitRowHtml(rows.children.length + 1);
    rows.appendChild(row);
    units();
    return row;
  }
  function list(){
    return qsa('.split-row', rows).map(function(r){ return {person: qs('.sp-name', r).value.trim(), value: money(qs('.sp-val', r).value)}; })
      .filter(function(e){ return e.person || e.value; });
  }
  function summary(){
    if (qs('#mSplitBox', modal).hidden) return;
    var r = splitSummaryText(ctx.info().total, list(), pct()), el = qs('#mSplitSummary', modal);
    el.classList.toggle('neg-text', r.neg);
    el.textContent = r.text;
  }
  function prior(){
    var fs = qs('#mPriorBox', modal), i = ctx.info(), k2 = Math.min(i.n, i.start - 1);
    fs.hidden = !(ctx.isExpense() && (forOther.checked || split.checked) && k2 > 0);
    if (fs.hidden) return;
    var per = i.total / i.n;
    qs('#mPriorText', modal).textContent = (k2 === 1 ? 'A 1ª parcela já venceu' : 'As ' + k2 + ' primeiras parcelas já venceram') +
      ' antes deste cadastro' + (per > 0 ? ' (' + fmtMoney(per * k2) + ')' : '') + '. Elas aparecem como pagas na fatura. E a pessoa:';
  }
  function sync(){
    var exp = ctx.isExpense();
    box.hidden = !exp;
    if (!exp){ forOther.checked = false; split.checked = false; }
    qs('#mOtherName', modal).hidden = !forOther.checked;
    qs('#mOtherHint', modal).hidden = !forOther.checked;
    qs('#mSplitBox', modal).hidden = !(exp && split.checked);
    if (exp && split.checked && !rows.children.length) addRow();
    if (forOther.checked || split.checked) box.open = true;
    prior(); summary();
  }
  forOther.addEventListener('change', function(){
    if (forOther.checked){ split.checked = false; rows.innerHTML = ''; }
    sync();
    if (forOther.checked) autoFocus(qs('#mOtherName', modal));
  });
  split.addEventListener('change', function(){ if (split.checked) forOther.checked = false; sync(); });
  qs('#mSplitAdd', modal).addEventListener('click', function(){ autoFocus(qs('.sp-name', addRow())); summary(); });
  qs('#mSplitEqual', modal).addEventListener('click', function(){
    var rs = qsa('.split-row', rows);
    if (!rs.length) return;
    var each = pct() ? Math.floor(10000 / (rs.length + 1)) / 100 : Math.floor(ctx.info().total * 100 / (rs.length + 1)) / 100;
    rs.forEach(function(r){ qs('.sp-val', r).value = each; });
    summary();
  });
  rows.addEventListener('click', function(e){
    var b = e.target.closest('[data-sp-del]');
    if (!b) return;
    b.closest('.split-row').remove();
    if (!rows.children.length){ split.checked = false; sync(); }
    summary();
  });
  qs('#mSplitBox', modal).addEventListener('input', summary);
  qs('#mSplitBox', modal).addEventListener('change', function(){ units(); summary(); });
  return {sync: sync};
}

// Lê e confere o que a pessoa marcou. Retorna {forOther, splitList, pct, priorPaid} ou {error}.
export function readOthers(form){
  var forOther = qs('#mForOther', form), split = qs('#mSplit', form);
  var out = {forOther: null, splitList: null, pct: false, priorPaid: true};
  if (!forOther || qs('#mOthers', form).hidden) return out;
  var pr = qs('input[name=mPrior]:checked', form);
  out.priorPaid = pr ? pr.value === 'paid' : true;
  if (forOther.checked){
    out.forOther = qs('#mOtherName', form).value.trim();
    if (!out.forOther) return {error: 'Informe quem vai te devolver o valor.'};
  } else if (split.checked){
    out.pct = qs('input[name=mSplitMode]:checked', form).value === 'pct';
    out.splitList = qsa('#mSplitRows .split-row', form).map(function(r){ return {person: qs('.sp-name', r).value.trim(), value: money(qs('.sp-val', r).value)}; })
      .filter(function(e){ return e.person || e.value; });
    if (!out.splitList.length) return {error: 'Adicione quem vai dividir a compra com você.'};
    if (out.splitList.some(function(e){ return !e.person || !(e.value > 0); })) return {error: 'Informe o nome e a parte de cada pessoa.'};
  }
  return out;
}
