/*
 * Importar extrato: lê um arquivo OFX ou CSV do banco, mostra os lançamentos para conferir (categoria sugerida, duplicados) e grava
 * os marcados na conta ou no cartão escolhido. Tudo é lido neste aparelho: o arquivo não vai para lugar nenhum. A importação ganha um
 * identificador, para poder ser desfeita. As contas ficam em domain/statement.js.
 */
import {fmtMoney} from '../domain/money.js';
import {formatDateBr, formatDateFull} from '../domain/dates.js';
import {validateNewTransaction} from '../domain/validate.js';
import {decodeBytes, parseOfx, parseCsv, detectCsvLayout, csvItems, buildDrafts, learnCategories, summarize, MAX_BYTES} from '../domain/statement.js';
import {Store} from '../data/store.js';
import {qs, qsa, escapeHtml, optionsHtml, toast, toastAction} from './dom.js';
import {openModal, confirmAction} from './modal.js';
import {State, k, catLabel, catOptions, expenseCats, incomeCats} from './state.js';
import {paymentOptions, applyPayment} from './tx-list.js';
import {saveTransactions} from './tx-edit.js';
import {renderAll} from './shell.js';

var MAX_ROWS = 800;

function destOptions(){ return paymentOptions().filter(function(o){ return o.id !== 'card:none' && o.id.indexOf('vale') !== 0; }); }
function isCardDest(id){ return id.indexOf('card:') === 0; }
function isOfx(text){ return /<OFX|<STMTTRN>|OFXHEADER/i.test(text); }
function colOptions(layout, withNone){
  var width = layout.rows.reduce(function(w, r){ return Math.max(w, r.length); }, 0), list = withNone ? [{id: '-1', label: '— nenhuma —'}] : [];
  for (var c = 0; c < width; c++) list.push({id: String(c), label: layout.header && layout.header[c] ? layout.header[c] : 'Coluna ' + (c + 1)});
  return list;
}
function catSelect(d){
  var list = d.type === 'income' ? incomeCats() : expenseCats();
  return '<select class="is-cat" data-is-cat="' + d.key + '" aria-label="Categoria">' + optionsHtml(catOptions(list), d.category) + '</select>';
}
function rowHtml(d){
  var disabled = !!d.ignore, badge = d.ignore ? d.ignore : d.dup === 'imported' ? 'já importado' : d.dup === 'similar' ? 'parece já lançado' : '';
  return '<div class="is-row' + (disabled ? ' is-ignored' : '') + '" data-is-row="' + d.key + '">' +
    '<label class="is-pick"><input type="checkbox" data-is-pick="' + d.key + '"' + (d.checked && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + ' aria-label="Importar este lançamento"></label>' +
    '<div class="is-main"><div class="is-desc">' + escapeHtml(d.description || '(sem descrição)') + '</div><div class="tx-meta">' + formatDateBr(d.date) + (badge ? ' · <span class="pill">' + escapeHtml(badge) + '</span>' : '') + '</div></div>' +
    (disabled ? '<span></span>' : catSelect(d)) +
    '<strong class="tabular is-amt ' + (d.type === 'income' ? 'income' : 'expense') + '">' + (d.type === 'income' ? '+ ' : '− ') + fmtMoney(d.amount) + '</strong></div>';
}

// Importações anteriores (para desfazer depois): agrupa os lançamentos pelo identificador da importação.
function batches(){
  var map = {};
  State.transactions.forEach(function(t){ if (t.importBatch){ var b = map[t.importBatch] = map[t.importBatch] || {id: t.importBatch, count: 0, at: t.createdAt || 0}; b.count++; b.at = Math.max(b.at, t.createdAt || 0); } });
  return Object.keys(map).map(function(id){ return map[id]; }).sort(function(a, b){ return b.at - a.at; }).slice(0, 5);
}
async function undoBatch(id){
  var list = State.transactions.filter(function(t){ return t.importBatch === id; });
  for (var i = 0; i < list.length; i++) await Store.remove(k(), 'transactions', list[i].id);
  State.transactions = State.transactions.filter(function(t){ return t.importBatch !== id; });
  renderAll();
  toast(list.length + (list.length === 1 ? ' lançamento removido.' : ' lançamentos removidos.'));
}
function batchesHtml(){
  var list = batches();
  if (!list.length) return '';
  return '<section class="is-batches"><h4>Importações anteriores</h4>' + list.map(function(b){
    return '<div class="pref-row"><span>' + formatDateFull(new Date(b.at).toISOString().slice(0, 10)) + ': ' + b.count + (b.count === 1 ? ' lançamento' : ' lançamentos') + '</span><button type="button" class="linklike" data-is-undo="' + escapeHtml(b.id) + '">Desfazer</button></div>';
  }).join('') + '</section>';
}

function toTx(d, dest, batch, n){
  var tx = {type: d.type, amount: d.amount, category: d.category, categoryLabel: catLabel(d.category, d.type), date: d.date, description: d.description, paymentMethod: null,
    source: 'import', importBatch: batch, createdAt: Date.now() + n};
  if (d.externalId) tx.externalId = d.externalId;
  if (d.type === 'expense') applyPayment(tx, dest);
  else if (dest.indexOf('acc:') === 0) tx.accountId = dest.slice(4);
  return tx;
}

export async function openStatementImport(){
  var st = {items: [], skipped: 0, accountId: '', layout: null, kind: '', name: '', drafts: []};
  var dests = destOptions();
  var r = await openModal({
    title: 'Importar extrato', wide: true, submitLabel: '', cancelLabel: 'Fechar',
    body: '<div class="sc-body is-body">' +
      '<div id="isStep1">' +
        '<p class="field-hint">Escolha o arquivo do extrato do seu banco (OFX ou CSV). Ele é lido só neste aparelho e não é enviado a lugar nenhum. Você confere tudo antes de importar.</p>' +
        '<div class="field"><label for="isFile">Arquivo do extrato</label><input id="isFile" type="file" accept=".ofx,.qfx,.csv,.txt,text/csv,application/x-ofx"></div>' +
        '<p class="form-error" id="isErr" role="alert"></p>' +
        '<div id="isInfo" class="tx-meta" aria-live="polite"></div>' +
        '<div class="field"><label for="isDest">Onde entram os lançamentos</label><select id="isDest">' + optionsHtml(dests, dests[0].id) + '</select></div>' +
        '<fieldset class="sc-disc" id="isMap" hidden><legend>Colunas do CSV</legend><div class="sc-grid">' +
          '<div class="field"><label for="isColDate">Data</label><select id="isColDate"></select></div>' +
          '<div class="field"><label for="isColDesc">Descrição</label><select id="isColDesc"></select></div>' +
          '<div class="field"><label for="isColAmount">Valor</label><select id="isColAmount"></select></div>' +
          '<div class="field"><label for="isColDebit">Débito (se separado)</label><select id="isColDebit"></select></div>' +
          '<div class="field"><label for="isColCredit">Crédito (se separado)</label><select id="isColCredit"></select></div></div>' +
          '<label class="check"><input type="checkbox" id="isInvert"> Valor positivo é gasto (fatura de cartão)</label></fieldset>' +
        '<div class="sc-use"><button type="button" class="btn btn-primary" id="isReview" disabled>Conferir lançamentos</button></div>' +
        batchesHtml() +
      '</div>' +
      '<div id="isStep2" hidden>' +
        '<div class="is-head"><strong id="isTitle"></strong><span class="is-bulk"><button type="button" class="linklike" data-is-all="1">Marcar todos</button> · <button type="button" class="linklike" data-is-all="0">Desmarcar todos</button></span></div>' +
        '<p class="tx-meta" id="isSummary" aria-live="polite"></p>' +
        '<div class="is-list" id="isList"></div>' +
        '<div class="sc-use"><button type="button" class="btn btn-ghost" id="isBack">Voltar</button><button type="button" class="btn btn-primary" id="isGo">Importar</button></div>' +
      '</div></div>',
    onOpen: function(modal, close){
      var fileEl = qs('#isFile', modal), err = qs('#isErr', modal), info = qs('#isInfo', modal), review = qs('#isReview', modal);
      function fail(msg){ err.textContent = msg; st.items = []; review.disabled = true; info.textContent = ''; qs('#isMap', modal).hidden = true; }
      function readMap(){
        var v = function(id){ return Number(qs('#' + id, modal).value); };
        return {date: v('isColDate'), desc: v('isColDesc'), amount: v('isColAmount'), debit: v('isColDebit'), credit: v('isColCredit')};
      }
      function applyCsv(){
        var res = csvItems(st.layout, readMap(), qs('#isInvert', modal).checked);
        st.items = res.items; st.skipped = res.skipped;
        review.disabled = !st.items.length;
        info.textContent = st.items.length ? 'CSV: ' + st.items.length + (st.items.length === 1 ? ' lançamento' : ' lançamentos') + (res.skipped ? ' (' + res.skipped + ' linhas ignoradas)' : '') + '.' : 'Nenhum lançamento com essas colunas. Confira a data e o valor.';
      }
      fileEl.addEventListener('change', async function(){
        err.textContent = ''; var f = fileEl.files && fileEl.files[0];
        if (!f) return;
        if (f.size > MAX_BYTES) return fail('Arquivo grande demais (máximo de 2 MB). Exporte só um mês do extrato.');
        var text = decodeBytes(new Uint8Array(await f.arrayBuffer()));
        st.name = f.name;
        if (isOfx(text)){
          var o = parseOfx(text);
          if (!o.items.length) return fail('Não encontrei lançamentos neste arquivo OFX.');
          st.kind = 'ofx'; st.items = o.items; st.skipped = o.skipped; st.accountId = o.accountId; st.layout = null;
          qs('#isMap', modal).hidden = true;
          // Extrato de cartão pré-seleciona um cartão; de conta, uma conta.
          var pref = dests.filter(function(d){ return o.kind === 'card' ? isCardDest(d.id) : d.id.indexOf('acc:') === 0; })[0];
          if (pref) qs('#isDest', modal).value = pref.id;
          var dates = o.items.map(function(i){ return i.date; }).sort();
          info.textContent = 'Extrato ' + (o.kind === 'card' ? 'de cartão' : 'de conta') + ' (OFX): ' + o.items.length + (o.items.length === 1 ? ' lançamento' : ' lançamentos') + ' de ' + formatDateBr(dates[0]) + ' a ' + formatDateBr(dates[dates.length - 1]) + '.';
          review.disabled = false;
        } else {
          var p = parseCsv(text), layout = detectCsvLayout(p.rows);
          if (!layout) return fail('Não reconheci as colunas de data e valor neste arquivo. Use um OFX ou um CSV com data e valor.');
          st.kind = 'csv'; st.layout = layout; st.accountId = '';
          [['isColDate', false, layout.map.date], ['isColDesc', true, layout.map.desc], ['isColAmount', true, layout.map.amount], ['isColDebit', true, layout.map.debit], ['isColCredit', true, layout.map.credit]].forEach(function(x){
            var sel = qs('#' + x[0], modal); sel.innerHTML = optionsHtml(colOptions(layout, x[1]), String(x[2]));
          });
          qs('#isInvert', modal).checked = layout.invert;
          if (layout.invert){ var card = dests.filter(function(d){ return isCardDest(d.id); })[0]; if (card) qs('#isDest', modal).value = card.id; }
          qs('#isMap', modal).hidden = false;
          applyCsv();
        }
      });
      qs('#isMap', modal).addEventListener('change', applyCsv);

      function refresh(){
        var s = summarize(st.drafts), dupes = st.drafts.filter(function(d){ return d.dup; }).length;
        qs('#isSummary', modal).textContent = s.count + (s.count === 1 ? ' lançamento marcado' : ' lançamentos marcados') + ' · gastos ' + fmtMoney(s.expense) + (s.income > 0 ? ' · ganhos ' + fmtMoney(s.income) : '') +
          (dupes ? ' · ' + dupes + ' já existem e vieram desmarcados' : '');
        var go = qs('#isGo', modal); go.disabled = !s.count; go.textContent = s.count ? 'Importar ' + s.count + (s.count === 1 ? ' lançamento' : ' lançamentos') : 'Nada marcado para importar';
      }
      review.addEventListener('click', function(){
        var dest = qs('#isDest', modal).value;
        if (st.items.length > MAX_ROWS){ err.textContent = 'O arquivo tem ' + st.items.length + ' lançamentos (máximo de ' + MAX_ROWS + ' por vez). Exporte um período menor.'; return; }
        st.drafts = buildDrafts(st.items, {accountId: st.accountId, isCard: isCardDest(dest), existing: State.transactions, learned: learnCategories(State.transactions),
          validCategory: function(type, id){ return (type === 'income' ? incomeCats() : expenseCats()).some(function(c){ return c.id === id; }); }});
        qs('#isTitle', modal).textContent = st.name + ' · ' + st.drafts.length + ' lançamentos';
        qs('#isList', modal).innerHTML = st.drafts.map(rowHtml).join('');
        qs('#isStep1', modal).hidden = true; qs('#isStep2', modal).hidden = false;
        refresh();
      });
      qs('#isBack', modal).addEventListener('click', function(){ qs('#isStep2', modal).hidden = true; qs('#isStep1', modal).hidden = false; });
      modal.addEventListener('change', function(e){
        var pick = e.target.getAttribute && e.target.getAttribute('data-is-pick'), cat = e.target.getAttribute && e.target.getAttribute('data-is-cat');
        if (pick !== null && pick !== undefined){ st.drafts[Number(pick)].checked = e.target.checked; refresh(); }
        if (cat !== null && cat !== undefined){ st.drafts[Number(cat)].category = e.target.value; }
      });
      modal.addEventListener('click', async function(e){
        var all = e.target.closest('[data-is-all]'), undo = e.target.closest('[data-is-undo]');
        if (all){
          var on = all.getAttribute('data-is-all') === '1';
          st.drafts.forEach(function(d){ if (!d.ignore) d.checked = on; });
          qsa('[data-is-pick]', modal).forEach(function(c){ if (!c.disabled) c.checked = on; });
          refresh();
        }
        if (undo){
          if (!(await confirmAction({title: 'Desfazer a importação?', message: 'Os lançamentos dessa importação serão removidos. O que você lançou à mão não muda.', confirmLabel: 'Desfazer'}))) return;
          await undoBatch(undo.getAttribute('data-is-undo'));
          close({undone: true});
        }
      });
      qs('#isGo', modal).addEventListener('click', async function(){
        var dest = qs('#isDest', modal).value, batch = 'imp-' + Date.now().toString(36);
        var list = st.drafts.filter(function(d){ return d.checked && !d.ignore; }).map(function(d, n){ return toTx(d, dest, batch, n); });
        var valid = list.filter(function(t){ return !validateNewTransaction(t); });
        if (!valid.length){ qs('#isSummary', modal).textContent = 'Nenhum lançamento válido para importar.'; return; }
        qs('#isGo', modal).disabled = true;
        close({tx: valid, skipped: list.length - valid.length, batch: batch});
      });
    }
  });
  if (!r || r === true || !r.tx) return;
  var saved = await saveTransactions(r.tx);
  renderAll();
  toastAction(saved.length + (saved.length === 1 ? ' lançamento importado.' : ' lançamentos importados.') + (r.skipped ? ' ' + r.skipped + ' ignorados por dados inválidos.' : ''), 'Desfazer', function(){ undoBatch(r.batch); });
}

export function wireStatementImport(){
  document.addEventListener('click', function(e){ if (e.target.closest('#importStmtBtn')) openStatementImport(); });
}
