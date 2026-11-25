/*
 * Lembretes dos avisos no celular (Web Push): o que o app pede para o servidor avisar nos próximos dias.
 * Contas puras: recebe os dados e devolve a lista de lembretes {key, kind, date, hour, title, body, url}; quem converte a data e a hora
 * local em um instante (fire_at) e fala com o servidor é js/ui/push.js. Os textos são genéricos de propósito: nunca levam valores em reais.
 *   salário   → no dia em que deveria cair ("já caiu?")
 *   fatura    → um dia antes do vencimento, se ainda há o que pagar
 *   conta fixa → um dia antes do vencimento, se ainda não foi paga nem pulada
 *   vale       → no dia em que o vale cai (se a pessoa informou o dia no cadastro do vale)
 * A pessoa programa: quantos dias antes cada um avisa (lead), a hora (hour) e avisos próprios (custom): “lançar os gastos”, “importar o
 * extrato” ou um lembrete com o texto dela, repetindo todo mês (dia), toda semana (dia da semana) ou uma vez (data).
 */
import {forecastOccurrences} from './forecasts.js';
import {invoiceDates, invoiceLeft, invoiceStatus} from './cards.js';
import {billOccurrences} from './bills.js';
import {creditDate} from './vouchers.js';
import {shiftMonthKey, daysInMonth, pad2} from './dates.js';

export var REMINDER_KINDS = ['salary', 'invoice', 'bill', 'voucher'];
export var DEFAULT_HOUR = 9;
export var MAX_CUSTOM = 10;
export var CUSTOM_TYPES = ['expense', 'statement', 'custom'];
export var DEFAULT_LEAD = {salary: 0, invoice: 1, bill: 1, voucher: 0};
export var MAX_LEAD = 7;

function int(v, lo, hi, dflt){ var n = Math.round(Number(v)); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }
// Um aviso criado pela pessoa, limpo e dentro dos limites. Devolve null se não der para aproveitar.
export function cleanCustom(c){
  if (!c || typeof c !== 'object') return null;
  var type = CUSTOM_TYPES.indexOf(c.type) >= 0 ? c.type : 'custom', repeat = ['monthly', 'weekly', 'once'].indexOf(c.repeat) >= 0 ? c.repeat : 'monthly';
  var out = {id: String(c.id || '').slice(0, 40), type: type, title: clip(c.title, 60), repeat: repeat, hour: int(c.hour, 0, 23, DEFAULT_HOUR), enabled: c.enabled !== false};
  if (!out.id) return null;
  if (repeat === 'monthly') out.day = int(c.day, 1, 31, 1);
  else if (repeat === 'weekly') out.weekday = int(c.weekday, 0, 6, 1);
  else { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || ''))) return null; out.date = c.date; }
  if (type === 'custom' && !out.title) return null;   // o lembrete livre precisa do texto da pessoa
  return out;
}
// As regras dos avisos (guardadas e sincronizadas entre aparelhos): quais tipos, antecedência, hora e os avisos próprios.
// legacyKinds: o formato antigo (prefs.push.kinds), usado enquanto a pessoa ainda não mexeu nas regras novas.
export function normalizeRules(raw, legacyKinds){
  var r = raw && typeof raw === 'object' ? raw : {};
  var kinds = Object.assign({salary: true, invoice: true, bill: true, voucher: true}, legacyKinds || {}, r.kinds || {});
  var lead = {};
  REMINDER_KINDS.forEach(function(k){ lead[k] = int(r.lead && r.lead[k], 0, MAX_LEAD, DEFAULT_LEAD[k]); });
  var custom = (Array.isArray(r.custom) ? r.custom : []).map(cleanCustom).filter(Boolean).slice(0, MAX_CUSTOM);
  return {kinds: kinds, lead: lead, hour: int(r.hour, 0, 23, DEFAULT_HOUR), custom: custom};
}
export var WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
// “todo dia 5 às 9h”, “toda segunda-feira às 18h”, “em 20/12/2026 às 9h”
export function customWhen(c){
  var h = c.hour + 'h';
  if (c.repeat === 'weekly') return 'toda ' + WEEKDAYS[c.weekday] + ' às ' + h;
  if (c.repeat === 'once') return 'em ' + c.date.slice(8, 10) + '/' + c.date.slice(5, 7) + '/' + c.date.slice(0, 4) + ' às ' + h;
  return 'todo dia ' + c.day + ' às ' + h;
}
export var CUSTOM_DEFAULT_TITLE = {expense: 'Lançar os gastos', statement: 'Importar o extrato', custom: 'Lembrete'};

// Soma dias a uma data 'AAAA-MM-DD' (sem fuso: é só o calendário).
export function addDaysKey(dateKey, n){
  var p = dateKey.split('-'), d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function dueIn(n){ n = Number(n) || 0; return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : 'em ' + n + ' dias'; }
function clip(s, n){ s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ctx: {today: 'AAAA-MM-DD', horizon (dias, padrão 10), kinds: {salary, invoice, bill, voucher} (true liga), lead: {salary, invoice, bill, voucher} (dias de antecedência), vouchers,
//       hour (hora dos avisos do app), custom: [avisos da pessoa], forecasts, cards, transactions, bills, paidOk}
export function buildReminders(ctx){
  var today = ctx.today, last = addDaysKey(today, ctx.horizon || 10), kinds = ctx.kinds || {}, out = [], curKey = today.slice(0, 7);
  var keys = [shiftMonthKey(curKey, -1), curKey, shiftMonthKey(curKey, 1)], lead = Object.assign({}, DEFAULT_LEAD, ctx.lead || {}), hour = ctx.hour === undefined ? DEFAULT_HOUR : ctx.hour;
  function add(r){ if (r.date >= today && r.date <= last) out.push(Object.assign({hour: hour, url: './#/inicio'}, r)); }

  if (kinds.salary){
    var plans = (ctx.forecasts || []).filter(function(f){ return f.salary && f.salary.rule; });
    plans.forEach(function(f){
      keys.forEach(function(key){
        forecastOccurrences([f], key).forEach(function(o){
          if (o.received !== undefined) return;
          var who = plans.length > 1 && f.salary.jobName ? ' (' + f.salary.jobName + ')' : '';
          var n = Number(lead.salary) || 0;
          add({key: 'salary:' + f.id + ':' + o.date, kind: 'salary', date: addDaysKey(o.date, -n), title: 'Seu salário',
            body: n > 0 ? 'O salário previsto' + who + ' cai ' + (n === 1 ? 'amanhã' : 'em ' + n + ' dias') + '. Toque para ver.' : 'Hoje é o dia previsto para o salário' + who + ' cair. Já caiu? Toque para confirmar.', url: './#/inicio'});
        });
      });
    });
  }
  if (kinds.invoice){
    (ctx.cards || []).forEach(function(card){
      keys.forEach(function(key){
        var due = invoiceDates(key, card).due, status = invoiceStatus(card, key, today, ctx.transactions);
        if (status === 'paga' || !(invoiceLeft(ctx.transactions || [], card, key) > 0.004)) return;
        add({key: 'invoice:' + card.id + ':' + key, kind: 'invoice', date: addDaysKey(due, -(Number(lead.invoice) || 0)), title: 'Fatura do cartão', body: 'A fatura do ' + card.name + ' vence ' + dueIn(lead.invoice) + '.', url: './#/contas'});
      });
    });
  }
  if (kinds.bill){
    keys.forEach(function(key){
      billOccurrences(ctx.bills || [], key, today, ctx.paidOk).forEach(function(o){
        var skipped = !!((o.b.paid || {})[key] || {}).skipped;
        if (o.paid || skipped) return;
        add({key: 'bill:' + o.b.id + ':' + key, kind: 'bill', date: addDaysKey(o.date, -(Number(lead.bill) || 0)), title: 'Conta a vencer', body: 'A conta ' + o.b.name + ' vence ' + dueIn(lead.bill) + '.', url: './#/lancamentos'});
      });
    });
  }
  if (kinds.voucher){
    (ctx.vouchers || []).forEach(function(v){
      keys.forEach(function(key){
        var d = creditDate(v, key);
        if (!d) return;
        var n = Number(lead.voucher) || 0;
        add({key: 'voucher:' + v.id + ':' + key, kind: 'voucher', date: addDaysKey(d, -n), title: 'Vale-alimentação',
          body: n > 0 ? 'O vale ' + v.name + ' cai ' + (n === 1 ? 'amanhã' : 'em ' + n + ' dias') + '.' : 'O vale ' + v.name + ' cai hoje.', url: './#/contas'});
      });
    });
  }
  // Avisos criados pela pessoa. Cada um tem a própria hora; só os ligados entram.
  (ctx.custom || []).map(cleanCustom).filter(function(c){ return c && c.enabled; }).slice(0, MAX_CUSTOM).forEach(function(c){
    var dates = [];
    if (c.repeat === 'once') dates = [c.date];
    else if (c.repeat === 'monthly') dates = keys.map(function(key){ return key + '-' + pad2(Math.min(c.day, daysInMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1))); });
    else for (var d = today; d <= last; d = addDaysKey(d, 1)){ var p = d.split('-'); if (new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay() === c.weekday) dates.push(d); }
    var title = c.title || CUSTOM_DEFAULT_TITLE[c.type];
    var body = c.type === 'expense' ? 'Hora de anotar os seus gastos. Toque para lançar.' : c.type === 'statement' ? 'Que tal importar o extrato do banco? Toque para abrir.' : 'Lembrete que você criou. Toque para abrir o app.';
    dates.forEach(function(date){ add({key: 'custom:' + c.id + ':' + date, kind: c.type === 'statement' ? 'statement' : 'custom', date: date, hour: c.hour, title: title, body: body, url: c.type === 'custom' ? './#/inicio' : './#/lancamentos'}); });
  });
  // Sem repetir a mesma chave (o mesmo vencimento pode aparecer em dois meses vizinhos), em ordem de data.
  var seen = {};
  return out.filter(function(r){ if (seen[r.key]) return false; seen[r.key] = true; return true; })
    .sort(function(a, b){ return a.date.localeCompare(b.date) || a.key.localeCompare(b.key); })
    .map(function(r){ r.title = clip(r.title, 80); r.body = clip(r.body, 160); r.key = r.key.slice(0, 120); return r; });
}

// A URL que o servidor aceita (e o aviso abre): só rotas do próprio app.
export function safeAppUrl(url){ return /^\.\/#\/[a-z-]{1,30}$/.test(String(url || '')) ? url : './#/inicio'; }

// ---- Central de avisos (o sininho): textos e contas puras ----
// “hoje às 9h”, “amanhã às 9h”, “dia 05/12 às 9h” (today: 'AAAA-MM-DD').
export function whenLabel(dateKey, hour, today){
  var h = ' às ' + (Number(hour) || 0) + 'h';
  if (dateKey === today) return 'hoje' + h;
  if (dateKey === addDaysKey(today, 1)) return 'amanhã' + h;
  if (dateKey === addDaysKey(today, -1)) return 'ontem' + h;
  return 'dia ' + dateKey.slice(8, 10) + '/' + dateKey.slice(5, 7) + h;
}
// Avisos que o servidor já enviou (linhas de push_reminders com sent_at), do mais novo ao mais antigo. Fora os que ele só deu por
// tratados sem enviar (vencidos há mais de 24 h) e os que não são de rota do app.
export function sentHistory(rows, limit){
  return (rows || []).filter(function(r){ return r && r.sent_at && r.fire_at && (new Date(r.sent_at).getTime() - new Date(r.fire_at).getTime()) <= 24 * 3600 * 1000; })
    .sort(function(a, b){ return String(b.sent_at).localeCompare(String(a.sent_at)); })
    .slice(0, limit || 30)
    .map(function(r){ return {title: r.title, body: r.body, url: safeAppUrl(r.url), kind: r.kind, sentAt: r.sent_at}; });
}
export function unseenCount(history, seenAt){ return history.filter(function(h){ return new Date(h.sentAt).getTime() > (Number(seenAt) || 0); }).length; }
