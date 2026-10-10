import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseStore, authMessage} from '../../js/data/supabase.js';

const COLLS = ['transactions', 'budgets', 'goals', 'debts', 'cards', 'receivables', 'forecasts', 'categories', 'vouchers', 'accounts', 'transfers'];

// Cliente falso, em memória, com a mesma cadeia de chamadas do supabase-js usada pelo adaptador.
// Imita o RLS de user_data (cada usuário só vê as próprias linhas).
function fakeClient(){
  const me = {id: 'u1'};
  const db = {user_data: [], profiles: [{id: 'u1', name: 'Ana', role: 'user', blocked: false, research: null}], study_events: []};
  const calls = [];
  let studyCode = 'code-1', rpcFail = false;
  function table(name){
    const st = {op: 'select', filters: [], range: null, limit: null};
    const own = r => name !== 'user_data' || r.user_id === me.id;
    function run(){
      const rows = db[name];
      const match = r => own(r) && st.filters.every(f => f(r));
      calls.push(name + ':' + st.op);
      if (st.op === 'select'){
        let out = rows.filter(match);
        if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
        if (st.limit) out = out.slice(0, st.limit);
        return {data: out.map(r => JSON.parse(JSON.stringify(r))), error: null};
      }
      if (st.op === 'insert' || st.op === 'upsert'){
        for (const p of st.payload){
          const row = {user_id: me.id, ...p};
          // Chave única só existe em user_data (user_id, collection, id); eventos têm id sequencial.
          const i = name !== 'user_data' ? -1 : rows.findIndex(r => r.user_id === row.user_id && r.collection === row.collection && r.id === row.id);
          if (i >= 0 && st.op === 'insert') return {data: null, error: {message: 'duplicate key value'}};
          if (i >= 0) rows[i] = row; else rows.push(row);
        }
        return {data: null, error: null};
      }
      if (st.op === 'update'){ rows.filter(match).forEach(r => Object.assign(r, st.payload)); return {data: null, error: null}; }
      if (st.op === 'delete'){ db[name] = rows.filter(r => !match(r)); return {data: null, error: null}; }
    }
    const q = {
      select(){ return q; }, order(){ return q; },
      eq(c, v){ st.filters.push(r => r[c] === v); return q; },
      in(c, vs){ st.filters.push(r => vs.includes(r[c])); return q; },
      range(a, b){ st.range = [a, b]; return q; }, limit(n){ st.limit = n; return q; },
      insert(p){ st.op = 'insert'; st.payload = [].concat(p); return q; },
      upsert(p){ st.op = 'upsert'; st.payload = [].concat(p); return q; },
      update(p){ st.op = 'update'; st.payload = p; return q; },
      delete(){ st.op = 'delete'; return q; },
      then(ok, ko){ return Promise.resolve(run()).then(ok, ko); }
    };
    return q;
  }
  return {
    me, db, calls,
    setStudyCode(c){ studyCode = c; }, failRpc(v){ rpcFail = v; },
    from: table,
    async rpc(fn){
      calls.push('rpc:' + fn);
      if (rpcFail) return {data: null, error: {message: 'network'}};
      if (fn === 'my_study_code') return {data: studyCode, error: null};
      if (fn === 'is_admin') return {data: false, error: null};
      return {data: null, error: null};
    },
    auth: {}
  };
}

test('adicionar, listar, atualizar e remover (o id não vai dentro do documento)', async () => {
  const c = fakeClient(), S = createSupabaseStore(c, COLLS);
  const saved = await S.add('u1', 'transactions', {type: 'expense', amount: 30, category: 'alimentacao'});
  assert.ok(saved.id && saved.amount === 30);
  assert.equal(c.db.user_data[0].doc.id, undefined);
  assert.equal(c.db.user_data[0].collection, 'transactions');
  await S.update('u1', 'transactions', saved.id, {amount: 45, description: 'Mercado'});
  const [t] = await S.list('u1', 'transactions');
  assert.deepEqual([t.id, t.amount, t.category, t.description], [saved.id, 45, 'alimentacao', 'Mercado']);
  await S.put('u1', 'budgets', 'plan-2026-10', {month: '2026-10', limits: {lazer: 100}});
  await S.put('u1', 'budgets', 'plan-2026-10', {month: '2026-10', limits: {lazer: 200}});
  assert.deepEqual((await S.list('u1', 'budgets')).map(b => b.limits.lazer), [200]);
  await S.remove('u1', 'transactions', saved.id);
  assert.equal((await S.list('u1', 'transactions')).length, 0);
});

test('listAll traz tudo de uma vez, separado por coleção, mesmo com mais de 1000 linhas', async () => {
  const c = fakeClient(), S = createSupabaseStore(c, COLLS);
  for (let i = 0; i < 1005; i++) c.db.user_data.push({user_id: 'u1', collection: 'transactions', id: 't' + i, doc: {amount: i}});
  c.db.user_data.push({user_id: 'u1', collection: 'accounts', id: 'a1', doc: {name: 'Nubank'}});
  c.db.user_data.push({user_id: 'outra', collection: 'accounts', id: 'x', doc: {name: 'De outra pessoa'}});
  const all = await S.listAll();
  assert.equal(all.transactions.length, 1005);
  assert.deepEqual(all.accounts.map(a => a.name), ['Nubank']);
  assert.deepEqual(Object.keys(all).sort(), [...COLLS].sort());
  assert.ok(c.calls.filter(x => x === 'user_data:select').length >= 2, 'buscou em páginas de 1000');
});

test('replaceAll troca todos os dados da pessoa (restaurar backup / trazer do navegador)', async () => {
  const c = fakeClient(), S = createSupabaseStore(c, COLLS);
  await S.add('u1', 'transactions', {amount: 1});
  c.db.user_data.push({user_id: 'outra', collection: 'transactions', id: 'z', doc: {}});
  await S.replaceAll('u1', {transactions: [{id: 'n1', amount: 9}], accounts: [{id: 'a1', name: 'Itaú'}]});
  const all = await S.listAll();
  assert.deepEqual(all.transactions.map(t => [t.id, t.amount]), [['n1', 9]]);
  assert.equal(all.accounts[0].name, 'Itaú');
  assert.ok(c.db.user_data.some(r => r.user_id === 'outra'), 'dados de outra pessoa não são tocados');
  assert.equal(await S.isEmpty(), false);
});

test('perfil: só o nome muda pelo updateUser', async () => {
  const c = fakeClient(), S = createSupabaseStore(c, COLLS);
  assert.equal((await S.getUser('u1')).name, 'Ana');
  await S.updateUser('u1', {name: 'Ana Lima', research: {consent: true}});
  assert.equal(c.db.profiles[0].name, 'Ana Lima');
  assert.equal(c.db.profiles[0].research, null, 'consentimento só muda pelas funções do estudo');
});

test('estudo: registra eventos só com código e nunca trava o app', async () => {
  const c = fakeClient(), S = createSupabaseStore(c, COLLS);
  await S.track('usou:chat');
  await S.track('corrigiu:chat', 'category');
  assert.deepEqual(c.db.study_events.map(e => [e.code, e.event, e.field]), [['code-1', 'usou:chat', null], ['code-1', 'corrigiu:chat', 'category']]);
  assert.equal(c.calls.filter(x => x === 'rpc:my_study_code').length, 1, 'busca o código uma vez só');
  const c2 = fakeClient(); c2.setStudyCode(null);
  await createSupabaseStore(c2, COLLS).track('usou:chat');
  assert.equal(c2.db.study_events.length, 0, 'quem não participa não registra nada');
  const c3 = fakeClient(); c3.failRpc(true);
  await assert.doesNotReject(createSupabaseStore(c3, COLLS).track('usou:chat'));
  assert.equal(await createSupabaseStore(c3, COLLS).isAdmin(), false, 'erro de rede não vira admin');
});

test('mensagens de login em português', () => {
  const warn = console.warn; console.warn = () => {};
  assert.equal(authMessage({message: 'Invalid login credentials'}), 'E-mail ou senha incorretos.');
  assert.match(authMessage({message: 'Email not confirmed'}), /Confirme seu e-mail/);
  assert.match(authMessage({message: 'email rate limit exceeded'}), /Muitas tentativas/);
  assert.match(authMessage({message: 'Failed to fetch'}), /Sem conexão/);
  assert.match(authMessage({message: 'algo inesperado'}), /Não foi possível/);
  assert.match(authMessage({message: 'Error sending recovery email', status: 500}), /Não conseguimos enviar o e-mail/);
  assert.match(authMessage({message: 'Error sending confirmation email'}), /Não conseguimos enviar o e-mail/);
  console.warn = warn;
});
