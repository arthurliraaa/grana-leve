import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseStore} from '../../js/data/supabase.js';

// Cliente falso que só registra as chamadas dos avisos (a cadeia from().select().is()…).
function fakeClient(pending){
  const calls = [];
  function chain(table){
    const st = {table, ops: []};
    const q = new Proxy({}, {get: (_, op) => {
      if (op === 'then') return resolve => { calls.push({table, ops: st.ops.slice()}); resolve({data: op === 'then' && st.ops[0] && st.ops[0][0] === 'select' ? pending : null, error: null}); };
      return (...args) => { st.ops.push([op, ...args]); return q; };
    }});
    return q;
  }
  return {calls, rpc: async (name, args) => { calls.push({rpc: name, args}); return {data: null, error: null}; }, from: chain, auth: {}};
}

test('aparelho: grava pela função do banco e remove pelo endereço', async () => {
  const c = fakeClient([]), S = createSupabaseStore(c, []);
  await S.pushSaveSubscription({endpoint: 'https://push.exemplo.com/a', keys: {p256dh: 'P', auth: 'A'}});
  assert.deepEqual(c.calls[0], {rpc: 'save_push_subscription', args: {p_endpoint: 'https://push.exemplo.com/a', p_p256dh: 'P', p_auth: 'A'}});
  await S.pushRemoveSubscription('https://push.exemplo.com/a');
  assert.equal(c.calls[1].table, 'push_subscriptions');
  assert.deepEqual(c.calls[1].ops, [['delete'], ['eq', 'endpoint', 'https://push.exemplo.com/a']]);
});

test('lembretes: apaga os pendentes que não valem mais e grava/atualiza os novos pela chave', async () => {
  const c = fakeClient([{id: 'r1', dedupe_key: 'bill:b1:2026-11'}, {id: 'r2', dedupe_key: 'invoice:c1:2026-12'}]), S = createSupabaseStore(c, []);
  const novo = {dedupe_key: 'invoice:c1:2026-12', kind: 'invoice', fire_at: '2026-12-11T12:00:00.000Z', title: 'Fatura do cartão', body: 'A fatura do Nubank vence amanhã.', url: './#/contas'};
  await S.pushSyncReminders([novo]);
  assert.deepEqual(c.calls[0].ops, [['select', 'id, dedupe_key'], ['is', 'sent_at', null]], 'só olha os pendentes');
  assert.deepEqual(c.calls[1].ops, [['delete'], ['in', 'id', ['r1']]], 'apaga o que saiu da lista (conta paga)');
  assert.deepEqual(c.calls[2].ops, [['upsert', [novo], {onConflict: 'user_id,dedupe_key'}]]);
  const vazio = fakeClient([{id: 'r9', dedupe_key: 'x'}]), V = createSupabaseStore(vazio, []);
  await V.pushSyncReminders([]);
  assert.equal(vazio.calls.length, 2, 'lista vazia só apaga (desligar os avisos) e não grava nada');
});
