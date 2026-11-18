/*
 * Início, gráficos: rosca/pizza/blocos de categorias, barras dos meses, faturas do cartão e crédito × débito.
 */
import {formatDateBr, monthBounds} from '../domain/dates.js';
import {money, fmtMoney} from '../domain/money.js';
import {sum} from '../domain/util.js';
import {setPref} from '../data/session.js';
import {inkOn, qs, qsa, escapeHtml, icon, resolveVar} from './dom.js';
import {wireTooltips} from './charts.js';
import {State, expenseCats, monthOthers} from './state.js';
import {compactMoney, creditDebitData, dashMonth, invoiceSplitData, monthName, monthProjection, pctOf, projectCats} from './dash-data.js';

export function setToggleLabel(which){
  var btn = qs('[data-view-toggle="' + which + '"]');
  var view = which === 'donut' ? State.donutView : which === 'bar' ? State.barView : ((State.dashViews || {})[which] || 'chart');
  btn.textContent = view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico';
}
export function toggleDashView(key){
  State.dashViews = State.dashViews || {};
  State.dashViews[key] = (State.dashViews[key] || 'chart') === 'chart' ? 'table' : 'chart';
  if (key === 'invsplit') renderInvoiceSplit(); else renderCreditDebit();
}

// Parte comum dos dois quadros: total em destaque, uma barra com as duas partes e a legenda com valores.
// a e b = {cls, label, value}. Os segmentos têm dica por mouse e teclado.
function splitSummary(totalLabel, total, a, b, openId){
  function seg(p){ return p.value > 0 ? '<span class="inv-seg ' + p.cls + '" style="width:' + (100 * p.value / total).toFixed(2) + '%" tabindex="0" data-tip="' + escapeHtml([totalLabel, a.label + ': ' + fmtMoney(a.value) + ' (' + pctOf(a.value, total) + '%)', b.label + ': ' + fmtMoney(b.value) + ' (' + pctOf(b.value, total) + '%)', 'Total: ' + fmtMoney(total)].join('||')) + '"></span>' : ''; }
  function key(p){ return '<span class="split-key"><i class="inv-key ' + p.cls + '" aria-hidden="true"></i><span>' + p.label + '</span><strong class="tabular">' + fmtMoney(p.value) + '</strong><small>' + pctOf(p.value, total) + '%</small></span>'; }
  var inner = '<div class="split-kpi"><span class="kpi-lbl">' + totalLabel + '</span><strong class="tabular">' + fmtMoney(total) + '</strong></div>' +
    '<div class="inv-track thick">' + seg(a) + seg(b) + '</div>' +
    '<div class="split-keys">' + key(a) + key(b) + '</div>';
  return openId ? '<div class=\"split-total clickable\" role=\"button\" tabindex=\"0\" data-open-detail=\"' + openId + '\" aria-label=\"Ver todos os itens: ' + totalLabel + '\">' + inner + '<span class=\"split-more\">Toque para ver tudo</span></div>' : inner;
}
// Uma linha por cartão/banco: nome, total e a barra das duas partes (largura relativa à maior).
// A dica (mouse, teclado ou toque) mostra o detalhe da linha inteira, não só do pedaço tocado.
function splitRows(rows, max, a, b, meta, tipFn, openFn){
  function tipOf(r){ return escapeHtml(tipFn(r).join('||')); }
  function seg(cls, v, r){
    if (!(v > 0) || !(max > 0)) return '';
    return '<span class="inv-seg ' + cls + '" style="width:' + (100 * v / max).toFixed(2) + '%" tabindex="0" data-tip="' + tipOf(r) + '"></span>';
  }
  return '<div class="inv-rows" role="img" aria-label="' + escapeHtml(rows.map(function(r){ return r.name + ': ' + a.label.toLowerCase() + ' ' + fmtMoney(r[a.field]) + ', ' + b.label.toLowerCase() + ' ' + fmtMoney(r[b.field]); }).join('; ')) + '">' +
    rows.map(function(r){
      return '<div class="inv-row' + (openFn ? ' clickable' : '') + '"' + (openFn ? ' role="button" tabindex="0" data-open-detail="' + escapeHtml(openFn(r)) + '" aria-label="Ver o que tem em ' + escapeHtml(r.name) + '"' : '') + ' data-tip="' + tipOf(r) + '"><div class="inv-row-head"><strong>' + escapeHtml(r.name) + '</strong>' + (meta ? '<span class="tx-meta">' + meta(r) + '</span>' : '') + '<strong class="tabular inv-row-total">' + fmtMoney(r.total) + '</strong></div>' +
        '<div class="inv-track">' + seg(a.cls, r[a.field], r) + seg(b.cls, r[b.field], r) + '</div></div>';
    }).join('') + '</div>';
}

export function renderInvoiceSplit(){
  var card = document.getElementById('invSplitCard'), wrap = document.getElementById('invSplitWrap');
  card.hidden = !State.cards.length;
  if (card.hidden) return;
  var off = State.dashOffset || 0, d = invoiceSplitData(off);
  var rows = d.rows.map(function(r){ return Object.assign({name: r.card.name}, r); });
  var tot = {mine: money(sum(rows, function(r){ return r.mine; })), others: money(sum(rows, function(r){ return r.others; }))};
  tot.total = money(tot.mine + tot.others);
  setToggleLabel('invsplit');
  document.getElementById('invSplitTitle').textContent = 'Faturas do cartão · ' + monthName(off);
  document.getElementById('invSplitSub').textContent = 'Faturas que vencem em ' + monthName(off) + ', separando o que é seu do que outras pessoas vão te devolver.';
  var lateHtml = off === 0 && d.late.count ? '<p class="inv-late" role="note">' + icon('clock') + '<span>Também há <strong>' + d.late.count + ' fatura(s) vencida(s)</strong> somando <strong class="tabular">' +
    fmtMoney(d.late.total) + '</strong>. Se já foram pagas, marque como pagas em “Contas e cartões”.</span> <a class="sum-link" href="#/contas" data-go="cartoes">Ver →</a></p>' : '';
  if (!rows.length){ wrap.innerHTML = '<p class="chart-empty">Nenhuma fatura vence em ' + monthName(off) + '.</p>' + lateHtml; return; }
  if (((State.dashViews || {}).invsplit || 'chart') === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Cartão</th><th>Fatura</th><th>Minha parte</th><th>Outras pessoas</th><th>Total</th></tr></thead><tbody>' +
      rows.map(function(r){ return '<tr class="clickable" tabindex="0" data-open-detail="inv:' + r.card.id + ':' + r.key + '"><td>' + escapeHtml(r.card.name) + '</td><td>' + escapeHtml(r.label) + ' · vence ' + formatDateBr(r.due) + '</td><td class="tabular">' + fmtMoney(r.mine) +
        '</td><td class="tabular">' + fmtMoney(r.others) + '</td><td class="tabular">' + fmtMoney(r.total) + '</td></tr>'; }).join('') +
      '<tr><td colspan="2"><strong>Total</strong></td><td class="tabular"><strong>' + fmtMoney(tot.mine) + '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.others) +
      '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.total) + '</strong></td></tr></tbody></table>' + lateHtml;
    return;
  }
  var A = {cls: 'mine', label: 'Minha parte', field: 'mine'}, B = {cls: 'others', label: 'Outras pessoas', field: 'others'};
  var max = Math.max.apply(null, rows.map(function(r){ return r.total; }).concat([0]));
  wrap.innerHTML = splitSummary('Total das faturas', tot.total, Object.assign({value: tot.mine}, A), Object.assign({value: tot.others}, B), 'inv-all') +
    splitRows(rows, max, A, B, function(r){ return 'vence ' + formatDateBr(r.due) + ' · ' + r.status; }, function(r){
      return [r.name + ' · fatura de ' + r.label, 'Vence ' + formatDateBr(r.due) + ' · ' + r.status, 'Minha parte: ' + fmtMoney(r.mine) + ' (' + pctOf(r.mine, r.total) + '%)', 'Outras pessoas: ' + fmtMoney(r.others) + ' (' + pctOf(r.others, r.total) + '%)', 'Total: ' + fmtMoney(r.total)];
    }, function(r){ return 'inv:' + r.card.id + ':' + r.key; }) + lateHtml + '<p class="chart-note">Toque num cartão para ver as compras da fatura.</p>';
  wireTooltips(wrap, '.inv-seg, .inv-row');
}
export function renderCreditDebit(){
  var card = document.getElementById('creditDebitCard'), wrap = document.getElementById('creditDebitWrap');
  card.hidden = !State.cards.length && !State.accounts.length;
  if (card.hidden) return;
  var off = State.dashOffset || 0, d = creditDebitData(off), rows = d.rows.filter(function(r){ return r.total > 0; });
  var tot = {credit: money(sum(d.rows, function(r){ return r.credit; })), debit: money(sum(d.rows, function(r){ return r.debit; }))};
  tot.total = money(tot.credit + tot.debit);
  setToggleLabel('creditdebit');
  document.getElementById('creditDebitTitle').textContent = 'Crédito × débito · ' + monthName(off);
  document.getElementById('creditDebitSub').textContent = (off === 0 ? 'Quanto saiu de cada banco até hoje' : off > 0 ? 'Quanto já está agendado para cada banco' : 'Quanto saiu de cada banco') +
    ': no cartão (pela data da compra) e da conta, por Pix ou débito. Inclui o que outras pessoas vão te devolver.';
  var outside = (d.cash || d.vale) ? '<p class="tx-meta cd-outside">Fora dos bancos: ' + [d.cash ? 'dinheiro ' + fmtMoney(d.cash) : '', d.vale ? 'vale ' + fmtMoney(d.vale) : ''].filter(Boolean).join(' · ') + '.</p>' : '';
  if (!tot.total){ wrap.innerHTML = '<p class="chart-empty">' + (off > 0 ? 'Nada agendado nos bancos para ' : 'Nenhum gasto nos bancos em ') + monthName(off) + '.</p>' + outside; return; }
  if (((State.dashViews || {}).creditdebit || 'chart') === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Banco</th><th>Crédito</th><th>Débito/Pix</th><th>Total</th></tr></thead><tbody>' +
      d.rows.map(function(r, i){ return '<tr class="clickable" tabindex="0" data-open-detail="bank:' + i + '"><td>' + escapeHtml(r.name) + '</td><td class="tabular">' + fmtMoney(r.credit) + '</td><td class="tabular">' + fmtMoney(r.debit) + '</td><td class="tabular">' + fmtMoney(r.total) + '</td></tr>'; }).join('') +
      '<tr><td><strong>Total</strong></td><td class="tabular"><strong>' + fmtMoney(tot.credit) + '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.debit) + '</strong></td><td class="tabular"><strong>' + fmtMoney(tot.total) + '</strong></td></tr></tbody></table>' + outside;
    return;
  }
  var A = {cls: 'credit', label: 'Crédito', field: 'credit'}, B = {cls: 'debit', label: 'Débito/Pix', field: 'debit'};
  var max = Math.max.apply(null, rows.map(function(r){ return r.total; }).concat([0]));
  wrap.innerHTML = splitSummary('Total nos bancos', tot.total, Object.assign({value: tot.credit}, A), Object.assign({value: tot.debit}, B), 'bank-all') + splitRows(rows, max, A, B, null, function(r){
    return [r.name + ' · ' + monthName(off), 'Crédito: ' + fmtMoney(r.credit) + ' (' + pctOf(r.credit, r.total) + '%)', 'Débito/Pix: ' + fmtMoney(r.debit) + ' (' + pctOf(r.debit, r.total) + '%)', 'Total: ' + fmtMoney(r.total)];
  }, function(r){ return 'bank:' + d.rows.indexOf(r); }) + outside + '<p class="chart-note">Toque num banco para ver o que foi gasto.</p>';
  wireTooltips(wrap, '.inv-seg, .inv-row');
}

export function renderDonut(){
  var wrap = document.getElementById('donutWrap'), m = dashMonth(), key = m.key;
  setToggleLabel('donut');
  var scope = State.donutScope === 'mine' ? 'mine' : 'all';
  qsa('[data-donut-scope]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-donut-scope') === scope ? 'true' : 'false'); });
  var allCats = projectCats(key, true), mineCats = projectCats(key, false), byCat = scope === 'all' ? allCats : mineCats, proj = monthProjection(key);
  var entries = expenseCats().map(function(c){ return {id:c.id, label:c.label, emoji:c.emoji, color:c.color, value: byCat[c.id]||0, all: allCats[c.id]||0, mine: mineCats[c.id]||0}; })
    .filter(function(e){ return e.value>0; }).sort(function(a, b){ return b.value - a.value; });
  var total = sum(entries, function(e){ return e.value; });
  if (!total){
    wrap.innerHTML = '<p class="chart-empty">' + ((State.dashOffset || 0) > 0 ? 'Nada previsto para este mês ainda (parcelas, contas fixas ou gastos agendados).' : 'Sem gastos registrados neste mês.') + '</p>';
    return;
  }
  if (State.donutView === 'table'){
    var anyOthers = entries.some(function(e){ return e.all - e.mine > 0.004; });
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Categoria</th><th>' + (scope === 'all' ? 'Total' : 'Seus gastos') + '</th>' + (scope === 'all' && anyOthers ? '<th>Seus</th>' : '') + '<th>%</th></tr></thead><tbody>' +
      entries.map(function(e){ return '<tr class="cat-click" tabindex="0" data-cat-id="' + e.id + '"><td>'+escapeHtml(e.label)+'</td><td class="tabular">'+fmtMoney(e.value)+'</td>' + (scope === 'all' && anyOthers ? '<td class="tabular">' + fmtMoney(e.mine) + '</td>' : '') + '<td class="tabular">'+Math.round(100*e.value/total)+'%</td></tr>'; }).join('') +
      '<tr><td><strong>Total</strong></td><td class="tabular"><strong>'+fmtMoney(total)+'</strong></td>' + (scope === 'all' && anyOthers ? '<td class="tabular"><strong>' + fmtMoney(sum(entries, function(e){ return e.mine; })) + '</strong></td>' : '') + '<td>100%</td></tr></tbody></table>';
    return;
  }
  var style = DONUT_STYLES.indexOf(State.donutStyle) >= 0 ? State.donutStyle : 'rosca';
  qsa('[data-donut-style]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-donut-style') === style ? 'true' : 'false'); });
  entries.forEach(function(e){
    var lines = [e.emoji + ' ' + e.label, 'Total: ' + fmtMoney(e.all) + ' (' + Math.round(100 * e.value / total) + '% ' + (scope === 'all' ? 'do total' : 'dos seus gastos') + ')'];
    if (e.all - e.mine > 0.004) lines.push('Seus: ' + fmtMoney(e.mine), 'De outras pessoas: ' + fmtMoney(money(e.all - e.mine)));
    if (scope === 'mine') lines[1] = 'Seus: ' + fmtMoney(e.mine) + ' (' + Math.round(100 * e.value / total) + '% dos seus gastos)';
    e.tip = escapeHtml(lines.join('||'));
  });
  var figure = style === 'blocos' ? donutBlocks(entries, total, wrap) : donutSvg(entries, total, style, m.label, wrap);
  var rows = '<ol class="cat-rank">' + entries.slice(0, 7).map(function(e){
    var pct = Math.round(100 * e.value / total);
    return '<li class="cat-click" tabindex="0" data-cat-id="' + e.id + '"><span class="cat-rank-top"><span class="cat-rank-name"><span class="legend-swatch" style="background:' + resolveVar(e.color, wrap) + '"></span>' + escapeHtml(e.emoji + ' ' + e.label) + '</span>' +
      '<span class="tabular">' + fmtMoney(e.value) + ' <small>' + pct + '%</small></span></span>' +
      '<span class="cat-rank-bar"><span style="width:' + pct + '%; background:' + resolveVar(e.color, wrap) + '"></span></span></li>';
  }).join('') + (entries.length > 7 ? '<li class="tx-meta">+ ' + (entries.length - 7) + ' categorias menores (veja na tabela)</li>' : '') + '</ol>';
  wrap.innerHTML = '<div class="donut-layout is-' + style + '">' + figure + rows + '</div>' +
    '<p class="chart-note">Toque numa categoria para ver o que foi gasto nela. ' + (proj.expExtra > 0 ?
      'Inclui ' + fmtMoney(proj.expExtra) + ' de contas fixas que ainda vão cair neste mês (' + proj.bills.map(function(o){ return escapeHtml(o.b.name) + ' ' + fmtMoney(o.amount); }).join(', ') + '), mesmo sem estarem lançadas. ' : 'Contas fixas já lançadas estão incluídas; não há nenhuma pendente neste mês. ') +
      'Compras no cartão entram no mês em que a fatura vence.</p>';
  wireTooltips(wrap, '.donut-seg, .tm-block');
  if (wrap.closest('.card').offsetHeight) renderBarChart();
}
// Três jeitos de ver os gastos por categoria: rosca (com o total no meio), pizza e blocos (tamanho = valor).
var DONUT_STYLES = ['rosca', 'pizza', 'blocos'];
export function setDonutScope(scope){
  State.donutScope = scope === 'mine' ? 'mine' : 'all';
  setPref('donutScope', State.donutScope);
  renderDonut();
}
export function setDonutStyle(style){
  if (DONUT_STYLES.indexOf(style) < 0) return;
  State.donutStyle = style;
  setPref('donutStyle', style);
  renderDonut();
}
function donutSvg(entries, total, style, monthLabel, wrap){
  if (style === 'pizza') return pieSvg(entries, total, monthLabel, wrap);
  var size = 220, cx = size / 2, cy = size / 2;
  var r = 82, sw = 24, circumference = 2 * Math.PI * r, gap = entries.length > 1 ? 3 : 0;
  var cum = 0;
  var circles = entries.map(function(e, i){
    var frac = e.value / total, dash = Math.max(0, frac * circumference - gap), offset = -cum * circumference;
    cum += frac;
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + resolveVar(e.color, wrap) + '" stroke-width="' + sw + '" stroke-linecap="butt" style="--i:' + i + '" ' +
      'stroke-dasharray="' + dash.toFixed(2) + ' ' + (circumference - dash).toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '" ' +
      'transform="rotate(-90 ' + cx + ' ' + cy + ')" tabindex="0" data-cat-id="' + e.id + '" data-tip="' + e.tip + '" class="donut-seg"></circle>';
  }).join('');
  var center = '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-size="11" style="fill:var(--text-muted)">' + donutCaption() + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="17" font-weight="700" style="fill:var(--text-primary)">' + fmtMoney(total) + '</text>';
  return '<div class="donut-fig"><svg class="donut-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Gastos por categoria em ' + escapeHtml(monthLabel) + '">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--gridline)" stroke-width="' + sw + '" opacity=".6"></circle>' + circles + center + '</svg></div>';
}
function donutCaption(){ return (State.dashOffset || 0) > 0 ? 'Previsto' : (State.donutScope === 'mine' ? 'Seus gastos' : 'Total'); }
// Pizza: fatias desenhadas como setores, separadas por um traço fino da cor do fundo (igual da borda
// ao centro). Ao passar o mouse (ou focar), a fatia sai um pouco para fora.
function pieSvg(entries, total, monthLabel, wrap){
  var size = 220, cx = size / 2, cy = size / 2, R = 98, cum = 0;
  function pt(a, rad){ return (cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2); }
  var slices = entries.map(function(e, i){
    var frac = e.value / total, a0 = cum * 2 * Math.PI - Math.PI / 2, a1 = (cum + frac) * 2 * Math.PI - Math.PI / 2, mid = (a0 + a1) / 2;
    cum += frac;
    var color = resolveVar(e.color, wrap);
    var shape = frac >= 0.9999 ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + color + '"></circle>' :
      '<path d="M' + cx + ',' + cy + 'L' + pt(a0, R) + 'A' + R + ',' + R + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + pt(a1, R) + 'Z" fill="' + color + '"></path>';
    var label = frac >= 0.06 ? '<text class="pie-pct" style="fill:' + inkOn(color) + '" x="' + (cx + R * 0.62 * Math.cos(mid)).toFixed(1) + '" y="' + (cy + R * 0.62 * Math.sin(mid) + 4).toFixed(1) + '" text-anchor="middle">' + Math.round(100 * frac) + '%</text>' : '';
    return '<g class="donut-seg pie-slice" tabindex="0" data-cat-id="' + e.id + '" data-tip="' + e.tip + '" style="--i:' + i + ';--dx:' + (7 * Math.cos(mid)).toFixed(2) + 'px;--dy:' + (7 * Math.sin(mid)).toFixed(2) + 'px">' + shape + label + '</g>';
  }).join('');
  return '<div class="donut-fig"><svg class="donut-svg pie-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Gastos por categoria em ' + escapeHtml(monthLabel) + '">' + slices + '</svg>' +
    '<p class="donut-total">' + donutCaption() + ' <strong class="tabular">' + fmtMoney(total) + '</strong></p></div>';
}
// Treemap: retângulos com área proporcional ao valor (algoritmo "squarified" numa grade 100 × 62,5).
function squarify(areas, x, y, w, h){
  var out = [], rest = areas.map(function(a, i){ return {a: a, i: i}; });
  function worst(row, side){
    var s = 0, mx = 0, mn = Infinity;
    row.forEach(function(r){ s += r.a; mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); });
    return Math.max(side * side * mx / (s * s), s * s / (side * side * mn));
  }
  while (rest.length){
    var side = Math.min(w, h), row = [], best = Infinity;
    while (rest.length){
      var next = row.concat([rest[0]]), score = worst(next, side);
      if (row.length && score > best) break;
      row = next; best = score; rest.shift();
    }
    var tot = sum(row, function(r){ return r.a; }), pos;
    if (w >= h){
      var cw = tot / h; pos = y;
      row.forEach(function(r){ var rh = r.a / cw; out[r.i] = {x: x, y: pos, w: cw, h: rh}; pos += rh; });
      x += cw; w -= cw;
    } else {
      var rh2 = tot / w; pos = x;
      row.forEach(function(r){ var rw = r.a / rh2; out[r.i] = {x: pos, y: y, w: rw, h: rh2}; pos += rw; });
      y += rh2; h -= rh2;
    }
  }
  return out;
}
function donutBlocks(entries, total, wrap){
  var W = 100, H = 62.5, areas = entries.map(function(e){ return e.value / total * W * H; });
  var rects = squarify(areas, 0, 0, W, H);
  return '<div class="tm" role="img" aria-label="Gastos por categoria, blocos proporcionais ao valor">' + entries.map(function(e, i){
    var q = rects[i], pct = Math.round(100 * e.value / total), big = q.w > 22 && q.h > 22, mid = q.w > 13 && q.h > 13;
    return '<div class="tm-block' + (big ? ' big' : mid ? ' mid' : '') + '" tabindex="0" style="color:' + inkOn(resolveVar(e.color, wrap)) + ';left:' + q.x.toFixed(2) + '%;top:' + (q.y / H * 100).toFixed(2) + '%;width:' + q.w.toFixed(2) + '%;height:' + (q.h / H * 100).toFixed(2) +
      '%;background:' + resolveVar(e.color, wrap) + '" data-cat-id="' + e.id + '" data-tip="' + e.tip + '">' +
      '<span class="tm-emoji" aria-hidden="true">' + escapeHtml(e.emoji) + '</span>' + (big ? '<span class="tm-name">' + escapeHtml(e.label) + '</span>' : '') + (mid || big ? '<span class="tm-pct">' + pct + '%</span>' : '') + '</div>';
  }).join('') + '</div>';
}

// O gráfico de barras cresce para o cartão ficar da altura do vizinho (rosca), sem espaço vazio dentro.
export function renderBarChart(){
  drawBars(0);
  var wrap = document.getElementById('barWrap'), card = wrap.closest('.card'), sib = document.getElementById('donutWrap').closest('.card');
  var svg = wrap.querySelector('.bar-svg');
  if (!svg || !card.offsetHeight || !sib.offsetHeight) return;
  card.style.alignSelf = 'start';   // altura natural do cartão, sem o esticar da grade
  var a = card.getBoundingClientRect(), b = sib.getBoundingClientRect();
  card.style.alignSelf = '';
  if (Math.abs(a.top - b.top) > 6 || Math.abs(a.left - b.left) < 40) return;   // uma coluna só (celular)
  var extra = b.height - a.height;
  if (extra < 10) return;
  var scale = svg.getBoundingClientRect().width / 340;
  drawBars(Math.min(320, extra / scale));
}
function drawBars(extraH){
  var wrap = document.getElementById('barWrap');
  setToggleLabel('bar');
  var n = State.barMonths, off = State.dashOffset || 0;
  // A janela sempre inclui o mês escolhido: termina nele (se for futuro) ou no mês atual.
  var end = off >= 0 ? off : Math.min(0, off + Math.floor(n / 2));
  var data = [];
  for (var i = n - 1; i >= 0; i--){
    var mo = end - i, m = monthBounds(mo), p = monthProjection(m.key);
    data.push({off: mo, label: m.label.slice(0, 3), year: m.key.slice(2, 4), full: m.label, p: p, sel: mo === off, now: mo === 0});
  }
  if (State.barView === 'table'){
    wrap.innerHTML = '<table class="data-table"><thead><tr><th>Mês</th><th>Ganhos</th><th>Gastos</th><th>Saldo</th></tr></thead><tbody>' +
      data.map(function(d){ return '<tr><td>'+d.full+(d.p.forecast ? ' <small>(previsão)</small>' : '')+'</td><td class="tabular">'+fmtMoney(d.p.inc)+'</td><td class="tabular">'+fmtMoney(d.p.exp)+'</td><td class="tabular">'+fmtMoney(d.p.inc-d.p.exp)+'</td></tr>'; }).join('') +
      '</tbody></table>';
    return;
  }
  var max = Math.max(1, Math.max.apply(null, data.map(function(d){ return Math.max(d.p.inc, d.p.exp); })));
  var W = 340, H = 220 + (extraH || 0), padL = 40, padB = 34, padT = 16, padR = 6;
  var plotW = W - padL - padR, plotH = H - padT - padB, groupW = plotW / data.length, barW = Math.min(22, groupW / 2.7);
  var incColor = resolveVar('var(--cat-3)', wrap), expColor = resolveVar('var(--cat-8)', wrap), selColor = resolveVar('var(--brand)', wrap);
  var defs = '<defs>' +
    '<pattern id="hInc" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="' + incColor + '" opacity=".18"/><rect width="2" height="5" fill="' + incColor + '" opacity=".75"/></pattern>' +
    '<pattern id="hExp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="' + expColor + '" opacity=".18"/><rect width="2" height="5" fill="' + expColor + '" opacity=".75"/></pattern></defs>';
  var grid = [0, 0.5, 1].map(function(f){
    var y = padT + plotH * (1 - f);
    return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--gridline)" stroke-width="1"></line>' +
      '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" style="fill:var(--text-muted)">' + compactMoney(max * f) + '</text>';
  }).join('');
  // Coluna com a ponta de cima arredondada (4px) e a base reta, apoiada na linha de base.
  function colPath(x, y, w, h, roundTop){
    var r = roundTop ? Math.min(4, h, w / 2) : 0;
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + (r ? 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y : '') + 'H' + (x + w - r) + (r ? 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) : '') + 'V' + (y + h) + 'Z';
  }
  function bar(x, val, extra, label, hatch, idx, color, d){
    var hTot = (val / max) * plotH, hExtra = (extra / max) * plotH, hReg = Math.max(0, hTot - hExtra), y0 = padT + plotH;
    var out = '', valTxt = fmtMoney(val) + (extra > 0 ? ' (' + fmtMoney(extra) + ' previsto)' : '');
    if (hReg > 0.4) out += '<path class="bar-seg" style="--i:' + idx + '" data-label="' + escapeHtml(label + ' · ' + d.full) + '" data-value="' + valTxt + '" d="' + colPath(x, y0 - hReg, barW, hReg, hExtra <= 0.4) + '" fill="' + color + '"></path>';
    // O previsto fica em cima, com 2px de folga (a cor da superfície separa as partes).
    if (hExtra > 0.4) out += '<path class="bar-seg bar-forecast" style="--i:' + idx + '" data-label="' + escapeHtml(label + ' previsto · ' + d.full) + '" data-value="' + fmtMoney(extra) + '" d="' + colPath(x, y0 - hTot, barW, Math.max(0.5, hExtra - (hReg > 0.4 ? 2 : 0)), true) + '" fill="url(#' + hatch + ')"></path>';
    if (hTot <= 0.4) out += '<rect x="' + x + '" y="' + (y0 - 1.5) + '" width="' + barW + '" height="1.5" rx="1" fill="' + color + '" opacity=".4"></rect>';
    // Rótulo só no mês escolhido (o resto fica nos eixos e nas dicas).
    if (d.sel && val > 0) out += '<text class="bar-val" x="' + (x + barW / 2) + '" y="' + Math.max(padT + 8, y0 - hTot - 4) + '" text-anchor="middle" font-size="8.5" font-weight="600" style="fill:var(--text-secondary)">' + compactMoney(val) + '</text>';
    return out;
  }
  var groups = data.map(function(d, idx){
    var gx = padL + idx * groupW, cx = gx + groupW / 2, x1 = cx - barW - 1, x2 = cx + 1;
    var sub = d.now ? 'hoje' : d.p.forecast ? 'previsão' : "'" + d.year;
    return '<g class="bar-group' + (d.sel ? ' sel' : '') + '" data-off="' + d.off + '" >' +
      '<rect class="bar-hit" x="' + gx + '" y="' + padT + '" width="' + groupW + '" height="' + (plotH + padB - 2) + '" rx="8" fill="' + (d.sel ? selColor : 'transparent') + '" fill-opacity="' + (d.sel ? '.08' : '0') + '"></rect>' +
      bar(x1, d.p.inc, d.p.incExtra, 'Ganhos', 'hInc', idx, incColor, d) + bar(x2, d.p.exp, d.p.expExtra, 'Seus gastos', 'hExp', idx, expColor, d) +
      '<text x="' + cx + '" y="' + (H - 18) + '" text-anchor="middle" font-size="' + (n > 6 ? 8 : 10) + '" font-weight="' + (d.sel ? 700 : 500) + '" style="fill:' + (d.sel ? 'var(--text-primary)' : 'var(--text-secondary)') + '">' + d.label + '</text>' +
      '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="7.5" style="fill:var(--text-muted)">' + sub + '</text></g>';
  }).join('');
  var svg = '<svg class="bar-svg" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Ganhos e gastos por mês. Para trocar de mês, use os botões de mês anterior e próximo.">' + defs + grid +
    '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="var(--baseline)" stroke-width="1"></line>' + groups + '</svg>';
  var legend = '<div class="legend">' +
    '<span class="legend-item"><span class="legend-swatch" style="background:' + incColor + '"></span>Ganhos</span>' +
    '<span class="legend-item"><span class="legend-swatch" style="background:' + expColor + '"></span>Seus gastos</span>' +
    '<span class="legend-item"><span class="legend-swatch hatch"></span>Previsto (contas fixas e entradas esperadas)</span></div>';
  var sel = data.filter(function(d){ return d.sel; })[0];
  var cap = '';
  if (sel){
    var oth = monthOthers(sel.p.key), tot = money(sel.p.exp + oth), sMine = money(sel.p.inc - sel.p.exp), sAll = money(sel.p.inc - tot);
    function sv(v){ return '<strong class="' + (v < 0 ? 'neg-text' : 'pos-text') + '">' + fmtMoney(v) + '</strong>'; }
    cap = '<p class="chart-note"><strong>' + escapeHtml(sel.full) + '</strong>: ganhos ' + fmtMoney(sel.p.inc) + ' · gastos ' + fmtMoney(tot) + (oth > 0.004 ? ' (seus ' + fmtMoney(sel.p.exp) + ')' : '') +
      ' · saldo ' + sv(oth > 0.004 ? sAll : sMine) + (oth > 0.004 ? ' (se te devolverem: ' + sv(sMine) + ')' : '') + (sel.p.forecast ? ' · previsão' : '') + '</p>';
  }
  wrap.innerHTML = svg + legend + cap;
  wireTooltips(wrap, '.bar-seg');
}
