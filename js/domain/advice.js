/*
 * Conselhos do mês: regras simples sobre os gastos de quem usa (sem IA, tudo no aparelho).
 * Cada conselho diz o que foi visto, em tom gentil, e o que dá para fazer, com números.
 * Só organização do orçamento: nada aqui recomenda investimentos.
 *
 * buildAdvice(ctx) -> [{id, kind, tone, title, text, saving?, action?, impact}], do que mais pesa para o que menos.
 *   ctx: {today, transactions, plan {categoria: limite}, catName(id), receivables, goals, nextCommitted}
 *   kind: 'over' | 'near' | 'spike' | 'nolimit' | 'savings' | 'commit' | 'small' | 'receive' | 'goal' | 'good'
 *   tone: 'warn' (merece atenção) | 'tip' (ideia) | 'good' (elogio)
 *   action: {type: 'limit', cat, amount} | {type: 'go', tab, label}
 */
import {money, fmtMoney} from './money.js';
import {isPersonal, myShare, txForMonth} from './transactions.js';
import {shiftMonthKey} from './dates.js';
import {recvRemaining, recvNextDue} from './receivables.js';
import {goalForecast} from './goals.js';

function sum(list, fn){ return list.reduce(function(a, x){ return a + fn(x); }, 0); }
function daysIn(key){ return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate(); }
// Gastos pessoais do mês (a parte da pessoa), sem estornos.
function mineExpenses(list, key){
  return txForMonth(list, key).filter(function(t){ return t.type === 'expense' && isPersonal(t) && !t.reversal && myShare(t) > 0; });
}
function byCategory(items){
  var out = {};
  items.forEach(function(t){ out[t.category] = money((out[t.category] || 0) + myShare(t)); });
  return out;
}
// Média por categoria nos 3 meses anteriores ao mês (só conta os meses em que houve gasto).
export function previousAverages(list, key){
  var tot = {}, months = 0;
  for (var i = 1; i <= 3; i++){
    var cats = byCategory(mineExpenses(list, shiftMonthKey(key, -i)));
    if (Object.keys(cats).length){ months++; Object.keys(cats).forEach(function(c){ tot[c] = (tot[c] || 0) + cats[c]; }); }
  }
  var avg = {};
  if (months) Object.keys(tot).forEach(function(c){ avg[c] = money(tot[c] / months); });
  return {avg: avg, months: months};
}
function ceil10(v){ return Math.ceil(v / 10) * 10; }

export function buildAdvice(ctx){
  var today = ctx.today, key = today.slice(0, 7), n = daysIn(key), day = Number(today.slice(8, 10)), left = Math.max(0, n - day);
  var list = ctx.transactions, plan = ctx.plan || {}, name = ctx.catName || function(id){ return id; };
  var items = mineExpenses(list, key).filter(function(t){ return t.date <= today; });
  var spent = byCategory(items), prev = previousAverages(list, key), out = [];
  function add(x){ x.impact = Math.round(x.impact || 0); out.push(x); }

  Object.keys(plan).forEach(function(cat){
    var limit = Number(plan[cat]) || 0, s = spent[cat] || 0;
    if (!(limit > 0)) return;
    if (s > limit){
      var projected = day ? money(s / day * n) : s;
      add({id: 'over:' + cat, kind: 'over', tone: 'warn', impact: s - limit + 1000,
        title: name(cat) + ' passou do planejado',
        text: 'Passou ' + fmtMoney(s - limit) + ' do limite de ' + fmtMoney(limit) + '. Tudo bem acontecer: ainda dá para segurar os próximos dias.' +
          (left && projected > s ? ' Se o resto do mês seguir no mesmo ritmo, o total vai chegar perto de ' + fmtMoney(projected) + '.' : ''),
        action: {type: 'go', tab: 'limites', label: 'Ver planejamento'}});
    } else if (s >= 0.9 * limit){
      add({id: 'near:' + cat, kind: 'near', tone: 'warn', impact: s / limit * 500,
        title: name(cat) + ' está perto do limite',
        text: 'Já usou ' + Math.round(100 * s / limit) + '% do planejado e restam ' + fmtMoney(limit - s) + (left ? ' para ' + left + (left === 1 ? ' dia' : ' dias') + ' (cerca de ' + fmtMoney(limit - s > 0 ? (limit - s) / left : 0) + ' por dia).' : '.'),
        action: {type: 'go', tab: 'limites', label: 'Ver planejamento'}});
    }
  });

  // Categoria seguindo bem acima da média dos meses anteriores.
  if (prev.months && day >= 7){
    Object.keys(spent).forEach(function(cat){
      var avg = prev.avg[cat] || 0, s = spent[cat], proj = s / day * n;
      if (avg >= 50 && s >= 50 && proj > avg * 1.3 && !(plan[cat] > 0 && s > plan[cat])){
        var cut = money(Math.max(0, proj - avg) * 0.5);
        add({id: 'spike:' + cat, kind: 'spike', tone: 'tip', impact: proj - avg, saving: cut,
          title: name(cat) + ' está acima do seu costume',
          text: 'Nos últimos meses você gastou em média ' + fmtMoney(avg) + ' por mês aqui e este mês caminha para ' + fmtMoney(money(proj)) + '. ' +
            'Voltar à média libera cerca de ' + fmtMoney(money(proj - avg)) + ' no mês' + (cut > 0 ? '; só reduzir a metade dessa diferença já deixa ' + fmtMoney(money(cut * 12)) + ' em um ano.' : '.'),
          action: plan[cat] > 0 ? {type: 'go', tab: 'limites', label: 'Ver planejamento'} : {type: 'limit', cat: cat, amount: ceil10(avg), label: 'Definir limite de ' + fmtMoney(ceil10(avg))}});
      }
    });
  }

  // Sem nenhum limite definido: começa pelos maiores gastos.
  if (!Object.keys(plan).some(function(c){ return plan[c] > 0; }) && Object.keys(spent).length){
    var top = Object.keys(spent).sort(function(a, b){ return spent[b] - spent[a]; }).slice(0, 2);
    add({id: 'nolimit', kind: 'nolimit', tone: 'tip', impact: 300,
      title: 'Que tal definir limites?',
      text: 'Seus maiores gastos neste mês são ' + top.map(name).join(' e ') + '. Com um limite para cada um, o app avisa antes de passar e fica mais fácil guardar.',
      action: {type: 'go', tab: 'limites', label: 'Definir limites'}});
  }

  // Quanto sobra do que entra (a partir do dia 10, quando o mês já tem história).
  var income = sum(txForMonth(list, key).filter(function(t){ return t.type === 'income' && isPersonal(t) && !t.refund && t.date <= today; }), function(t){ return Number(t.amount) || 0; });
  var expense = sum(items, myShare);
  if (day >= 10 && income > 0){
    var rate = (income - expense) / income;
    if (rate < 0){
      add({id: 'savings:neg', kind: 'savings', tone: 'warn', impact: -(income - expense) + 800,
        title: 'Saiu mais do que entrou',
        text: 'Neste mês você gastou ' + fmtMoney(money(expense - income)) + ' a mais do que recebeu. Olhar as maiores categorias e adiar o que não for urgente costuma ajudar a fechar no azul.',
        action: {type: 'go', tab: 'dashboard', label: 'Ver gastos do mês'}});
    } else if (rate < 0.1){
      var goal10 = money(income * 0.1 - (income - expense));
      add({id: 'savings:low', kind: 'savings', tone: 'tip', impact: goal10 + 200, saving: goal10,
        title: 'Dá para guardar um pouquinho mais',
        text: 'Até agora sobrou ' + Math.round(rate * 100) + '% do que entrou. Separar ' + fmtMoney(goal10) + ' a mais já chegaria a 10%, um bom começo.',
        action: {type: 'go', tab: 'metas', label: 'Criar uma meta'}});
    } else if (rate >= 0.2){
      add({id: 'good:savings', kind: 'good', tone: 'good', impact: 1,
        title: 'Você está guardando bem',
        text: 'Até agora sobrou ' + Math.round(rate * 100) + '% do que entrou neste mês. Que tal mandar essa sobra para uma meta?',
        action: {type: 'go', tab: 'metas', label: 'Ver metas'}});
    }
  }

  // Peso do que já está comprometido no mês que vem (faturas suas + contas fixas).
  if (ctx.nextCommitted > 0 && income > 0 && ctx.nextCommitted > income * 0.5){
    add({id: 'commit', kind: 'commit', tone: 'tip', impact: ctx.nextCommitted / 4,
      title: 'O mês que vem já começa pesado',
      text: 'Faturas e contas fixas somam ' + fmtMoney(ctx.nextCommitted) + ', mais da metade do que entrou neste mês. Se der, evite novas parcelas por enquanto.',
      action: {type: 'go', tab: 'cartoes', label: 'Ver contas e cartões'}});
  }

  // Muitos gastos pequenos na mesma categoria.
  var smalls = {};
  items.forEach(function(t){ if (myShare(t) <= 30) (smalls[t.category] = smalls[t.category] || []).push(t); });
  Object.keys(smalls).forEach(function(cat){
    var l = smalls[cat], total = money(sum(l, myShare));
    if (l.length >= 8 && total >= 100){
      add({id: 'small:' + cat, kind: 'small', tone: 'tip', impact: total / 2, saving: money(total * 0.2),
        title: 'Muitos gastos pequenos em ' + name(cat),
        text: l.length + ' compras de até R$ 30 somam ' + fmtMoney(total) + ' neste mês. Juntar algumas delas ou escolher dias fixos para isso pode poupar uns ' + fmtMoney(money(total * 0.2)) + '.'});
    }
  });

  // Gente que te deve dinheiro.
  var recv = (ctx.receivables || []).filter(function(r){ return !r.forgiven && recvRemaining(r) > 0.004; });
  if (recv.length){
    var owed = money(sum(recv, recvRemaining));
    var late = recv.filter(function(r){ var d = recvNextDue(r); return d && d < today; });
    if (late.length || owed >= 100){
      add({id: 'receive', kind: 'receive', tone: 'tip', impact: owed / 3 + (late.length ? 200 : 0),
        title: 'Tem dinheiro para voltar para você',
        text: 'Faltam ' + fmtMoney(owed) + ' para receber' + (late.length ? ', e ' + late.length + (late.length === 1 ? ' combinado já passou' : ' combinados já passaram') + ' da data' : '') + '. Uma mensagem gentil de cobrança ajuda a fechar o mês.',
        action: {type: 'go', tab: 'receber', label: 'Ver quem me deve'}});
    }
  }

  // Metas que estão ficando para trás do prazo.
  (ctx.goals || []).filter(function(g){ return !g.deletedAt; }).forEach(function(g){
    var f = goalForecast(g, today);
    if (f.done || f.openEnded || f.onTrack !== false || !(f.needed > 0)) return;
    add({id: 'goal:' + g.id, kind: 'goal', tone: 'tip', impact: f.needed,
      title: 'A meta “' + g.name + '” está um pouco atrasada',
      text: 'No ritmo atual ela não chega no prazo. Guardar cerca de ' + fmtMoney(f.needed) + ' por mês resolve.',
      action: {type: 'go', tab: 'metas', label: 'Ver a meta'}});
  });

  out.sort(function(a, b){ return b.impact - a.impact; });
  if (!out.length){
    out.push({id: 'good:calm', kind: 'good', tone: 'good', impact: 0, title: 'Tudo sob controle por aqui',
      text: 'Não vi nada que precise de atenção neste mês. Continue lançando os gastos para eu acompanhar com você.'});
  }
  return out;
}
