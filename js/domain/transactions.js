/*
 * Lançamentos: {id, type: 'income'|'expense', amount, category, date, description,
 * paymentMethod: 'conta'|'cartao'|'vale'|null, accountId?, cardId?, voucherId?, installment?, createdAt}.
 */
import {monthKeyOf, addMonthsIso, monthsBetween} from './dates.js';
import {money, sumMoney, splitAmount, toCents} from './money.js';
import {findById} from './util.js';

export var MAX_INSTALLMENTS = 24;
export function clampInstall(v){ var n = Math.round(Number(v)); return n >= 1 ? Math.min(MAX_INSTALLMENTS, n) : 1; }

export function sortTransactions(list){
  return list.sort(function(a,b){ return (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0); });
}
// Gasto pago por outra pessoa, que vai devolver (forOther: {person, receivableId}): o dinheiro saiu
// da conta ou do cartão, mas não é gasto seu. A devolução (refund) volta para a conta, mas não é ganho.
// Assim o mesmo dinheiro não conta duas vezes. Se a pessoa não devolver, um lançamento à parte
// ("não devolvido") passa a contar como gasto seu.
export function isForOther(t){ return t.type === 'expense' && !!t.forOther; }
export function isRefund(t){ return t.type === 'income' && !!t.refund; }
// outsideTotals: movimento só de saldo (ex.: pagamento de dívida que você pediu para não contar como gasto).
// Estorno: crédito (valor negativo) ligado à compra original em reversal.of.
export function isReversal(t){ return !!t.reversal; }
export function reversalsOf(list, id){ return list.filter(function(t){ return t.reversal && t.reversal.of === id; }); }
export function isPersonal(t){ return !isForOther(t) && !isRefund(t) && !t.outsideTotals; }
// Compra dividida (split: {total, mine, people: [{person, receivableId, amount}]}): só a sua parte é
// gasto seu. Numa parcela padrão (valor igual ao de splitAmount da compra), a sua parte é a parcela
// n de splitAmount(mine, N): as partes somam exatamente split.mine e as de outras pessoas, total − mine.
// Parcela editada (valor fora do padrão), estorno ou compra à vista: parte proporcional ao valor.
export function myShare(t){
  if (!isPersonal(t)) return 0;
  if (t.split && Number(t.split.total) > 0) return splitMine(t);
  return Number(t.amount) || 0;
}
function splitMine(t){
  var s = t.split, inst = t.installment, N = inst ? Number(inst.total) : 0, i = inst ? Number(inst.n) - 1 : -1;
  if (N > 1 && i >= 0 && i < N && toCents(s.total) === toCents(inst.totalAmount)){
    var parts = splitAmount(s.total, N), mine = splitAmount(s.mine, N);
    var fits = mine.every(function(m, k){ return m >= 0 && m <= parts[k]; });
    if (fits && toCents(t.amount) === toCents(parts[i])) return mine[i];
  }
  return money(Number(t.amount) * Number(s.mine) / Number(s.total));
}
// "Dividir igualmente": `total` entre `people` pessoas (você incluída), em centavos inteiros.
// A 1ª parte (a sua) leva os centavos que sobram; as demais são iguais. 2,26 entre 2 → [1,13; 1,13].
export function splitEqual(total, people){
  var n = Math.max(1, Math.round(Number(people)) || 1);
  return splitAmount(total, n);
}
// De quem é o gasto, em palavras: "Seu", "De Fulano" (pago por outra pessoa) ou "Dividida com A, B".
export function whoLabel(t){
  if (isForOther(t)) return 'De ' + ((t.forOther && t.forOther.person) || 'outra pessoa');
  if (t.split && Array.isArray(t.split.people) && t.split.people.length)
    return 'Dividida com ' + t.split.people.map(function(p){ return p.person || 'outra pessoa'; }).join(', ');
  return 'Seu';
}
// Quanto do gasto é de outras pessoas (pago por elas ou a parte delas numa compra dividida).
export function othersShare(t){
  if (t.type !== 'expense') return 0;
  if (isForOther(t)) return Number(t.amount) || 0;
  return t.split ? money(Number(t.amount) - myShare(t)) : 0;
}
// Divide o total entre as pessoas: valores em R$ ou em % do total. Devolve a parte de cada uma e a sua.
export function splitShares(total, entries, percent){
  var people = entries.map(function(e){ return {person: e.person, amount: money(percent ? total * Number(e.value) / 100 : Number(e.value))}; });
  var others = sumMoney(people, function(p){ return p.amount; });
  return {people: people, others: others, mine: money(total - others)};
}

// Mês em que o lançamento conta (competência). Padrão: o mês da data. O app registra um "resolvedor"
// que, para compras no cartão, devolve o mês em que vence a fatura daquela parcela (compra de 04/10
// com fatura vencendo em novembro conta em novembro). Sem resolvedor (ex.: testes), vale a data.
var monthResolver = null;
export function setMonthResolver(fn){ monthResolver = fn; }
export function monthOf(t){ return (monthResolver && monthResolver(t)) || monthKeyOf(t.date); }
export function txForMonth(list, key){ return list.filter(function(t){ return monthOf(t) === key; }); }

// Realizado = data até hoje; agendado = data futura dentro do mês (ex.: parcela que ainda vai cair).
export function monthTotals(list, key, today){
  var all = txForMonth(list, key), tx = all.filter(isPersonal);
  function total(type, when){
    return sumMoney(tx.filter(function(t){ return t.type === type && (!when || (when === 'done' ? t.date <= today : t.date > today)); }), myShare);
  }
  var income = total('income'), expense = total('expense');
  var out = {income: income, expense: expense, saldo: money(income - expense),
    forOther: sumMoney(all.filter(function(t){ return !today || t.date <= today; }), othersShare)};
  if (today){
    out.incomeDone = total('income', 'done'); out.expenseDone = total('expense', 'done');
    out.incomeScheduled = total('income', 'later'); out.expenseScheduled = total('expense', 'later');
  }
  return out;
}
// Quanto do mês é de outras pessoas (pago por elas ou a parte delas nas compras divididas), com a data que for.
// "Não vai devolver" vira gasto seu (writeOff) sem sair mais dinheiro: a parte já estava no que
// outras pessoas pagaram, então sai dessa conta para o total não contar duas vezes.
export function monthOthers(list, key, today){
  var all = txForMonth(list, key).filter(function(t){ return !today || t.date <= today; });
  var off = sumMoney(all.filter(function(t){ return t.type === 'expense' && t.writeOff && !t.reversal; }), function(t){ return t.amount; });
  return money(Math.max(0, sumMoney(all, othersShare) - off));
}
// Gastos por categoria contando tudo o que saiu, inclusive a parte de outras pessoas (all = true).
export function expenseCategoryTotals(list, key, all){
  var out = {};
  txForMonth(list, key).filter(function(t){ return t.type === 'expense' && (isPersonal(t) || (all && isForOther(t))); }).forEach(function(t){
    out[t.category] = money((out[t.category] || 0) + (all ? (Number(t.amount) || 0) : myShare(t)));
  });
  return out;
}
// Os gastos de uma categoria no mês, na mesma regra do gráfico (all: com o que é de outras pessoas).
export function categoryExpenses(list, key, cat, all){
  return txForMonth(list, key).filter(function(t){ return t.type === 'expense' && t.category === cat && (isPersonal(t) || (all && isForOther(t))); })
    .sort(function(a, b){ return a.date.localeCompare(b.date); });
}
// Até quantos meses à frente existem lançamentos (parcelas futuras).
export function maxMonthOffset(list, curKey){
  var max = 0;
  list.forEach(function(t){ var d = monthsBetween(curKey, monthOf(t)); if (d > max) max = d; });
  return max;
}

// Divide uma compra no cartão em N lançamentos, um por mês. Os centavos que sobram ficam na 1ª parcela.
// name: descrição base das parcelas (a descrição digitada ou o nome da categoria).
// start: parcela atual de uma compra que já estava em andamento (ex.: 7 de 18). As anteriores foram
// pagas antes do cadastro e não viram lançamento; a parcela atual cai na data informada.
export function expandInstallments(tx, n, group, name, start){
  if (!(n > 1) || tx.paymentMethod !== 'cartao') return [tx];
  start = clampStart(start, n);
  var parts = splitAmount(tx.amount, n), out = [];
  for (var i = start; i <= n; i++){
    var inst = {group: group, n: i, total: n, totalAmount: tx.amount, baseDescription: name};
    if (start > 1) inst.start = start;
    out.push(Object.assign({}, tx, {
      amount: parts[i-1],
      date: addMonthsIso(tx.date, i - start),
      description: name + ' (' + i + '/' + n + ')',
      installment: inst,
      createdAt: tx.createdAt + (i - start)
    }));
  }
  return out;
}
// Compra feita em tx.date: a parcela i cai i-1 meses depois. Todas viram lançamentos (a compra fica
// no histórico do mês em que foi feita); as anteriores a `start` caíram em faturas que já venceram
// antes do cadastro e ficam marcadas como acertadas (installment.settled): contam no histórico, mas
// não como fatura a pagar nem no limite usado. Guarda a data da compra (purchaseDate).
export function expandPurchase(tx, n, group, name, start){
  if (!(n > 1) || tx.paymentMethod !== 'cartao') return [tx];
  start = Math.max(1, Math.round(Number(start) || 1));
  return expandInstallments(Object.assign({}, tx, {purchaseDate: tx.date}), n, group, name, 1).map(function(t){
    if (t.installment.n < start) t.installment = Object.assign({}, t.installment, {settled: true});
    return t;
  });
}
// Parcela que venceu antes do cadastro (já acertada).
export function isSettled(t){ return !!(t.installment && t.installment.settled); }
export function clampStart(start, n){ var s = Math.round(Number(start)); return s >= 1 ? Math.min(n, s) : 1; }
// Valor total da compra a partir do que foi digitado: o total, ou o valor de cada parcela × N.
export function purchaseTotal(typed, n, perInstallment){ return perInstallment && n > 1 ? money(typed * n) : money(typed); }
export function installHint(n, amount, fmt, start){
  if (n <= 1) return 'À vista';
  if (!(amount > 0)) return n + ' parcelas';
  var parts = splitAmount(amount, n);
  var out = n + 'x de ' + fmt(parts[n-1]) + ' · total ' + fmt(amount);
  start = clampStart(start, n);
  if (start > 1){
    var left = n - start + 1;
    out += ' · ' + (start === 2 ? 'a 1ª parcela já venceu' : 'as parcelas 1 a ' + (start - 1) + ' já venceram') + ' (contam como pagas) · ' +
      (left === 1 ? 'falta 1' : 'faltam ' + left) + ' (' + fmt(sumMoney(parts.slice(start - 1), function(v){ return v; })) + ')';
  }
  return out;
}

// Agrupa as parcelas de cada compra. "Pagas" = parcelas com data até hoje (já entraram em fatura).
// Parcelas adiantadas saem da lista e contam em "advanced"; as pagas antes do cadastro, em "before".
export function installmentGroups(list, cards, today){
  var map = {};
  list.forEach(function(t){
    if (!t.installment) return;
    var g = map[t.installment.group];
    if (!g) g = map[t.installment.group] = {id: t.installment.group, name: t.installment.baseDescription, total: t.installment.total,
      totalAmount: Number(t.installment.totalAmount), cardId: t.cardId, category: t.category, items: []};
    g.items.push(t);
  });
  return Object.keys(map).map(function(key){
    var g = map[key];
    g.items.sort(function(a,b){ return a.installment.n - b.installment.n; });
    // before: parcelas acertadas antes do cadastro (marcadas, ou que nem viraram lançamento nas
    // compras cadastradas com "parcela atual"); advanced: adiantadas (saíram da lista).
    var legacy = Math.max(0, (Number(g.items.length && g.items[0].installment.start) || 1) - 1);
    g.settled = g.items.filter(isSettled);
    g.paid = g.items.filter(function(t){ return t.date <= today && !isSettled(t); });
    g.future = g.items.filter(function(t){ return t.date > today && !isSettled(t); });
    g.before = legacy + g.settled.length;
    g.advanced = Math.max(0, g.total - g.items.length - legacy);
    g.done = g.paid.length + g.advanced + g.before;
    g.remaining = sumMoney(g.future, function(t){ return t.amount; });
    g.perInstallment = g.items.length ? g.items[g.items.length-1].amount : 0;
    g.lastDate = g.items.length ? g.items[g.items.length-1].date : '';
    g.card = findById(cards, g.cardId);
    return g;
  }).sort(function(a,b){ return a.lastDate.localeCompare(b.lastDate); });
}

/* ---------- Adiantamento de parcelas de compra dividida (S5) ---------- */

// Sua parte no lançamento que adianta as parcelas `advancedNs` (números 1..N) de uma compra.
// group: o grupo de installmentGroups (usa group.items) ou a lista das parcelas que ainda existem.
// paid: quanto foi pago (com desconto, menos que a soma das parcelas adiantadas); sem ele, a soma.
// Sem desconto: split.mine − soma de myShare das parcelas que NÃO foram adiantadas (as que já não
// existem, como adiantamentos anteriores, contam pela parte padrão), para a soma fechar no centavo.
// Com desconto: essa parte proporcional ao valor pago, arredondada em centavos (o resto é das outras
// pessoas, e "seu" + "de outras pessoas" fecha com o pago). Compra paga por outra pessoa: 0; sem split: paid.
export function advanceShare(group, advancedNs, paid){
  var items = Array.isArray(group) ? group : (group && group.items) || [];
  var adv = {}, orig = 0;
  (advancedNs || []).forEach(function(n){ adv[Number(n)] = true; });
  items.forEach(function(t){ if (adv[Number(t.installment && t.installment.n)]) orig += toCents(t.amount); });
  var paidC = paid == null ? orig : toCents(paid), t0 = items[0];
  if (!t0) return money(Math.max(0, paidC) / 100);
  if (isForOther(t0) || !isPersonal(t0)) return 0;
  var s = t0.split;
  if (!(s && Number(s.total) > 0)) return paidC / 100;
  var N = Number(t0.installment && t0.installment.total) || items.length;
  var byN = {};
  items.forEach(function(t){ if (t.installment) byN[Number(t.installment.n)] = t; });
  var parts = splitAmount(s.total, N), mineParts = splitAmount(s.mine, N);
  var fits = mineParts.every(function(m, k){ return m >= 0 && m <= parts[k]; });
  var rest = 0;
  for (var n = 1; n <= N; n++){
    if (adv[n]) continue;
    rest += byN[n] ? toCents(myShare(byN[n])) : toCents(fits ? mineParts[n - 1] : parts[n - 1] * Number(s.mine) / Number(s.total));
  }
  var base = Math.max(0, toCents(s.mine) - rest);
  if (orig > 0) base = Math.min(base, orig);
  var share = orig > 0 && paidC !== orig ? Math.round(base * paidC / orig) : base;
  return Math.max(0, Math.min(share, paidC)) / 100;
}
// Campos de divisão para gravar no lançamento do adiantamento (para Object.assign), com
// myShare(lançamento) = advanceShare(...): split vira {total: pago, mine: sua parte, people} e o valor de
// cada pessoa é o resto (pago − sua parte) repartido na proporção de antes (sobra na 1ª pessoa).
// Compra paga por outra pessoa: {forOther} copiado. Sem divisão: {}.
export function advanceFields(group, advancedNs, paid){
  var items = Array.isArray(group) ? group : (group && group.items) || [];
  var t0 = items[0], out = {};
  if (!t0) return out;
  if (t0.forOther) out.forOther = Object.assign({}, t0.forOther);
  if (!(t0.split && Number(t0.split.total) > 0)) return out;
  var adv = {}, orig = 0;
  (advancedNs || []).forEach(function(n){ adv[Number(n)] = true; });
  items.forEach(function(t){ if (adv[Number(t.installment && t.installment.n)]) orig += toCents(t.amount); });
  var paidC = paid == null ? orig : toCents(paid), mine = toCents(advanceShare(items, advancedNs, paid));
  var people = (t0.split.people || []).map(function(p){ return Object.assign({}, p); });
  var others = paidC - mine, weight = people.reduce(function(a, p){ return a + Math.max(0, toCents(p.amount)); }, 0), given = 0;
  people.forEach(function(p, i){
    if (i === 0) return;
    var c = weight > 0 ? Math.round(others * Math.max(0, toCents(p.amount)) / weight) : 0;
    p.amount = c / 100; given += c;
  });
  if (people.length) people[0].amount = (others - given) / 100;
  out.split = {total: paidC / 100, mine: mine / 100, people: people};
  return out;
}

/* ---------- Excluir lançamento com itens ligados (A2-03, A4) ---------- */

// O que sai junto ao excluir os lançamentos `ids`. Puro: só olha as listas.
// advances: lançamentos de adiantamento (installmentAdvance.group) de compras parceladas cujas
// parcelas estão em `ids` (A4); reversals: estornos (reversal.of) desses lançamentos; receivables:
// "A receber" ligados a eles (forOther / split.people) que nenhum outro lançamento usa; refunds:
// devoluções registradas nesses "A receber" (payments[].txId ou receivableId) que ainda existem.
// extraTxIds: ids de lançamentos a apagar além de `ids` (advances + reversals + refunds).
export function linkedToDelete(list, receivables, ids){
  var gone = {}, groups = {};
  ids.forEach(function(id){ gone[id] = true; });
  list.forEach(function(t){ if (gone[t.id] && t.installment && t.installment.group) groups[t.installment.group] = true; });
  var advances = list.filter(function(t){ return t.installmentAdvance && groups[t.installmentAdvance.group] && !gone[t.id]; });
  advances.forEach(function(t){ gone[t.id] = true; });
  var reversals = list.filter(function(t){ return t.reversal && gone[t.reversal.of] && !gone[t.id]; });
  reversals.forEach(function(t){ gone[t.id] = true; });
  function recvIdsOf(t){
    var out = [];
    if (t.forOther && t.forOther.receivableId) out.push(t.forOther.receivableId);
    if (t.split && t.split.people) t.split.people.forEach(function(p){ if (p.receivableId) out.push(p.receivableId); });
    return out;
  }
  var used = {}, kept = {};
  list.forEach(function(t){ recvIdsOf(t).forEach(function(r){ if (gone[t.id]) used[r] = true; else kept[r] = true; }); });
  var recvs = (receivables || []).filter(function(r){ return used[r.id] && !kept[r.id]; });
  var refunds = [];
  recvs.forEach(function(r){
    (r.payments || []).forEach(function(p){ var t = p.txId && !gone[p.txId] && findById(list, p.txId); if (t){ gone[t.id] = true; refunds.push(t); } });
    list.forEach(function(t){ if (t.receivableId === r.id && !gone[t.id]){ gone[t.id] = true; refunds.push(t); } });
  });
  var extraTxIds = advances.concat(reversals, refunds).map(function(t){ return t.id; });
  return {reversals: reversals, receivables: recvs, refunds: refunds, advances: advances, extraTxIds: extraTxIds};
}
