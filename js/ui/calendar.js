/*
 * Ganhos e gastos → Calendário (mês) e Ano. Mostra o realizado de cada dia e o que está previsto
 * (entradas previstas, contas fixas, vencimento de faturas e valores a receber).
 * O app entrega os dados já filtrados; aqui só desenha.
 */
import {fmtMoney} from '../domain/money.js';
import {todayKey, daysInMonth, pad2, formatDateFull, monthLabelOf} from '../domain/dates.js';
import {escapeHtml} from './dom.js';

var WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export var EVENT_KINDS = {
  previsto: {label: 'Entrada prevista', cls: 'ev-in'},
  fixa: {label: 'Conta fixa', cls: 'ev-out'},
  fatura: {label: 'Vencimento de fatura', cls: 'ev-card'},
  receber: {label: 'A receber', cls: 'ev-recv'},
  vale: {label: 'Vale cai', cls: 'ev-vale'}
};

// Valor curto para caber na célula do dia: 85, 1,2 mil.
export function compact(v){
  v = Math.abs(Number(v) || 0);
  return v < 1000 ? String(Math.round(v)) : (Math.round(v / 100) / 10).toString().replace('.', ',') + ' mil';
}

// days: {'AAAA-MM-DD': {income, expense, count, events: [{kind, label, amount}]}}
export function monthGridHtml(key, days, selected){
  var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1;
  var first = new Date(y, m, 1).getDay(), n = daysInMonth(y, m), today = todayKey();
  var cells = [];
  for (var i = 0; i < first; i++) cells.push('<span class="cal-cell cal-empty" aria-hidden="true"></span>');
  for (var d = 1; d <= n; d++){
    var date = key + '-' + pad2(d), info = days[date] || {income: 0, expense: 0, count: 0, events: []};
    var label = formatDateFull(date) + (info.count ? ': ' + info.count + ' lançamento(s)' : '') +
      (info.income ? ', ganhos ' + fmtMoney(info.income) : '') + (info.expense ? ', gastos ' + fmtMoney(info.expense) : '') +
      (info.events.length ? ', ' + info.events.map(function(e){ return EVENT_KINDS[e.kind].label.toLowerCase() + ' ' + e.label; }).join(', ') : '');
    cells.push('<button type="button" class="cal-cell' + (date === today ? ' cal-today' : '') + (date === selected ? ' cal-sel' : '') + (date > today ? ' cal-future' : '') +
      '" data-cal-day="' + date + '"' + (date === selected ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
      '<span class="cal-num" aria-hidden="true">' + d + '</span>' +
      (info.income ? '<span class="cal-in tabular" aria-hidden="true">+' + compact(info.income) + '</span>' : '') +
      (info.expense ? '<span class="cal-out tabular" aria-hidden="true">−' + compact(info.expense) + '</span>' : '') +
      '<span class="sr-only">' + escapeHtml(label) + '</span>' +
      (info.events.length ? '<span class="cal-dots" aria-hidden="true">' + info.events.slice(0, 4).map(function(e){ return '<i class="' + EVENT_KINDS[e.kind].cls + '"></i>'; }).join('') + '</span>' : '') +
      '</button>');
  }
  return '<div class="cal-grid" role="group" aria-label="Dias de ' + monthLabelOf(key) + '">' +
    WEEK.map(function(w){ return '<span class="cal-week" aria-hidden="true">' + w + '</span>'; }).join('') + cells.join('') + '</div>' +
    '<p class="cal-legend">' + Object.keys(EVENT_KINDS).map(function(k){ return '<span><i class="' + EVENT_KINDS[k].cls + '"></i>' + EVENT_KINDS[k].label + '</span>'; }).join('') + '</p>';
}

export function dayEventsHtml(events){
  if (!events.length) return '';
  return '<div class="cal-events"><p class="tiles-group">Previsto para o dia</p>' + events.map(function(e){
    return '<div class="list-row"><i class="cal-dot ' + EVENT_KINDS[e.kind].cls + '" aria-hidden="true"></i><div class="tx-main"><div class="tx-desc">' + escapeHtml(e.label) + '</div>' +
      '<div class="tx-meta">' + EVENT_KINDS[e.kind].label + '</div></div><span class="tabular">' + fmtMoney(e.amount) + '</span></div>';
  }).join('') + '</div>';
}

// months: [{key, income, expense}] (12 meses do ano)
export function yearHtml(year, months, curKey){
  return '<div class="year-grid">' + months.map(function(m){
    var bal = m.income - m.expense;
    return '<button type="button" class="year-cell' + (m.key === curKey ? ' cal-today' : '') + '" data-cal-month="' + m.key + '">' +
      '<strong>' + monthLabelOf(m.key).split(' de ')[0] + '</strong>' +
      '<span class="cal-in tabular">+ ' + fmtMoney(m.income) + '</span><span class="cal-out tabular">− ' + fmtMoney(m.expense) + '</span>' +
      '<span class="tabular ' + (bal < 0 ? 'neg-text' : '') + '">Saldo ' + fmtMoney(bal) + '</span></button>';
  }).join('') + '</div>';
}
