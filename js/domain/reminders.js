/*
 * Lembretes dos avisos no celular (Web Push): o que o app pede para o servidor avisar nos próximos dias.
 * Contas puras: recebe os dados e devolve a lista de lembretes {key, kind, date, hour, title, body, url}; quem converte a data e a hora
 * local em um instante (fire_at) e fala com o servidor é js/ui/push.js. Os textos são genéricos de propósito: nunca levam valores em reais.
 *   salário   → no dia em que deveria cair ("já caiu?")
 *   fatura    → um dia antes do vencimento, se ainda há o que pagar
 *   conta fixa → um dia antes do vencimento, se ainda não foi paga nem pulada
 */
import {forecastOccurrences} from './forecasts.js';
import {invoiceDates, invoiceLeft, invoiceStatus} from './cards.js';
import {billOccurrences} from './bills.js';
import {shiftMonthKey} from './dates.js';

export var REMINDER_KINDS = ['salary', 'invoice', 'bill'];
export var DEFAULT_HOUR = 9;

// Soma dias a uma data 'AAAA-MM-DD' (sem fuso: é só o calendário).
export function addDaysKey(dateKey, n){
  var p = dateKey.split('-'), d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function clip(s, n){ s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ctx: {today: 'AAAA-MM-DD', horizon (dias, padrão 10), kinds: {salary, invoice, bill} (true liga), forecasts, cards, transactions, bills, paidOk}
export function buildReminders(ctx){
  var today = ctx.today, last = addDaysKey(today, ctx.horizon || 10), kinds = ctx.kinds || {}, out = [], curKey = today.slice(0, 7);
  var keys = [shiftMonthKey(curKey, -1), curKey, shiftMonthKey(curKey, 1)];
  function add(r){ if (r.date >= today && r.date <= last) out.push(Object.assign({hour: DEFAULT_HOUR, url: './#/inicio'}, r)); }

  if (kinds.salary){
    var plans = (ctx.forecasts || []).filter(function(f){ return f.salary && f.salary.rule; });
    plans.forEach(function(f){
      keys.forEach(function(key){
        forecastOccurrences([f], key).forEach(function(o){
          if (o.received !== undefined) return;
          var who = plans.length > 1 && f.salary.jobName ? ' (' + f.salary.jobName + ')' : '';
          add({key: 'salary:' + f.id + ':' + o.date, kind: 'salary', date: o.date, title: 'Seu salário', body: 'Hoje é o dia previsto para o salário' + who + ' cair. Já caiu? Toque para confirmar.', url: './#/inicio'});
        });
      });
    });
  }
  if (kinds.invoice){
    (ctx.cards || []).forEach(function(card){
      keys.forEach(function(key){
        var due = invoiceDates(key, card).due, status = invoiceStatus(card, key, today, ctx.transactions);
        if (status === 'paga' || !(invoiceLeft(ctx.transactions || [], card, key) > 0.004)) return;
        add({key: 'invoice:' + card.id + ':' + key, kind: 'invoice', date: addDaysKey(due, -1), title: 'Fatura do cartão', body: 'A fatura do ' + card.name + ' vence amanhã.', url: './#/contas'});
      });
    });
  }
  if (kinds.bill){
    keys.forEach(function(key){
      billOccurrences(ctx.bills || [], key, today, ctx.paidOk).forEach(function(o){
        var skipped = !!((o.b.paid || {})[key] || {}).skipped;
        if (o.paid || skipped) return;
        add({key: 'bill:' + o.b.id + ':' + key, kind: 'bill', date: addDaysKey(o.date, -1), title: 'Conta a vencer', body: 'A conta ' + o.b.name + ' vence amanhã.', url: './#/lancamentos'});
      });
    });
  }
  // Sem repetir a mesma chave (o mesmo vencimento pode aparecer em dois meses vizinhos), em ordem de data.
  var seen = {};
  return out.filter(function(r){ if (seen[r.key]) return false; seen[r.key] = true; return true; })
    .sort(function(a, b){ return a.date.localeCompare(b.date) || a.key.localeCompare(b.key); })
    .map(function(r){ r.title = clip(r.title, 80); r.body = clip(r.body, 160); r.key = r.key.slice(0, 120); return r; });
}

// A URL que o servidor aceita (e o aviso abre): só rotas do próprio app.
export function safeAppUrl(url){ return /^\.\/#\/[a-z-]{1,30}$/.test(String(url || '')) ? url : './#/inicio'; }
