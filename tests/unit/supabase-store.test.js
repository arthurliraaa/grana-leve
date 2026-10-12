import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseStore, authMessage, retryAfter} from '../../js/data/supabase.js';

const COLLS = ['transactions', 'budgets', 'goals', 'debts', 'cards', 'receivables', 'forecasts', 'categories', 'vouchers', 'accounts', 'transfers'];

// Cliente falso, em memória, com a mesma cadeia de chamadas do supabase-js usada pelo adaptador.
// Imita o RLS de user_data (cada usuário só vê as próprias linhas).
function fakeClient(){
  const me = {id: 'u1'};
  const db = {user_data: [], profiles: [{id: 'u1', name: 'Ana', role: 'user', blocked: false, research: null}], study_events: []};
  const calls = [];
  let studyCode = 'code-1', rpcFail = false, noPatch = false;
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
    setStudyCode(c){ studyCode = c; }, failRpc(v){ rpcFail = v; }, withoutPatchDocs(){ noPatch = true; },
    from: table,
    async rpc(fn, args){
      calls.push('rpc:' + fn);
      if (rpcFail) return {data: null, error: {message: 'network'}};
      if (fn === 'my_study_code') return {data: studyCode, error: null};
      if (fn === 'patch_docs'){
        if (noPatch) return {data: null, error: {code: 'PGRST202', message: 'Could not find the function public.patch_docs'}};
        const p = args;
        p.p_items.forEach(it => { const r = db.user_data.find(x => x.user_id === me.id && x.collection === p.p_collection && x.id === it.id); if (r) r.doc = {...r.doc, ...it.patch}; });
        return {data: null, error: null};
      }
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
  assert.match(authMessage({message: 'email rate limit exceeded'}), /muitos e-mails na última hora/);
  assert.match(authMessage({message: 'Too many requests'}), /Muitas tentativas/);
  // Intervalo entre e-mails para o mesmo endereço: diz quanto falta e que o link anterior vale.
  assert.match(authMessage({code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.'}), /espere 42 segundos.*continua valendo/);
  assert.equal(retryAfter({message: 'For security purposes, you can only request this after 1 second.'}), 1);
  assert.equal(retryAfter({message: 'Invalid login credentials'}), 0);
  // Senha recusada pelo servidor (vazada, fácil ou igual à antiga): antes caía na mensagem genérica.
  assert.match(authMessage({code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.'}), /não é aceita/);
  assert.match(authMessage({message: 'Password is known to be weak and easy to guess, please choose a different one.'}), /não é aceita/);
  assert.match(authMessage({code: 'same_password', message: 'New password should be different from the old password.'}), /diferente da senha atual/);
  assert.match(authMessage({code: 'email_address_invalid', message: 'Email address "a@b" is invalid'}), /não foi aceito/);
  assert.match(authMessage({code: 'email_exists', message: 'A user with this email address has already been registered'}), /Já existe uma conta/);
  assert.match(authMessage({code: 'otp_expired', message: 'Email link is invalid or has expired'}), /expirou/);
  assert.match(authMessage({message: 'Failed to fetch'}), /Sem conexão/);
  assert.match(authMessage({message: 'algo inesperado'}), /Não foi possível/);
  assert.match(authMessage({message: 'Error sending recovery email', status: 500}), /Não conseguimos enviar o e-mail/);
  assert.match(authMessage({message: 'Error sending confirmation email'}), /Não conseguimos enviar o e-mail/);
  console.warn = warn;
});

test('perfil: trocar e-mail, conferir senha e sair de todos os aparelhos chamam o Supabase do jeito certo', async () => {
  const c = fakeClient(), log = [];
  c.auth = {
    async updateUser(attrs, opts){ log.push(['updateUser', attrs, opts]); return {data: {user: {}}, error: null}; },
    async signInWithPassword(cred){ log.push(['signIn', cred.email]); return cred.password === 'certa1' ? {data: {user: {}}, error: null} : {data: null, error: {message: 'Invalid login credentials'}}; },
    async signOut(opts){ log.push(['signOut', opts]); return {error: null}; }
  };
  const S = createSupabaseStore(c, COLLS);
  await S.updateEmail('novo@teste.com', 'https://grana-leve.vercel.app/');
  assert.deepEqual(log[0], ['updateUser', {email: 'novo@teste.com'}, {emailRedirectTo: 'https://grana-leve.vercel.app/'}]);
  await S.checkPassword('a@teste.com', 'certa1');
  await assert.rejects(S.checkPassword('a@teste.com', 'errada'), /Invalid login credentials/);
  await S.signOutAll();
  assert.deepEqual(log[log.length - 1], ['signOut', {scope: 'global'}]);
});

test('redefinir senha (perfil e painel adm) pede o e-mail ao Supabase com o endereço de volta do app', async () => {
  const c = fakeClient(), log = [];
  c.auth = {async resetPasswordForEmail(email, opts){ log.push([email, opts]); return {data: {}, error: null}; }};
  await createSupabaseStore(c, COLLS).resetPassword('pessoa@teste.com', 'https://grana-leve.vercel.app/');
  assert.deepEqual(log, [['pessoa@teste.com', {redirectTo: 'https://grana-leve.vercel.app/', captchaToken: undefined}]]);
});

test('mensagens claras para os limites do banco', async () => {
  const c = fakeClient();
  c.from = () => ({upsert: async () => ({data: null, error: {message: 'Limite de 20 mil registros por conta atingido.', hint: 'limite_registros'}}),
    insert: async () => ({data: null, error: {message: 'new row violates check constraint "user_data_collection_check"'}})});
  const S = createSupabaseStore(c, COLLS);
  await assert.rejects(S.put('k', 'transactions', 'x', {amount: 1}), e => /limite de 20 mil registros/.test(e.userMessage));
});

test('captcha: o token vai em cadastro, login, nova senha, reenvio e conferência de senha', async () => {
  const c = fakeClient(), seen = [];
  let n = 0;
  c.auth = {
    async signUp(a){ seen.push(['signUp', a.options.captchaToken]); return {data: {}, error: null}; },
    async signInWithPassword(a){ seen.push(['signIn', a.options.captchaToken]); return {data: {}, error: null}; },
    async resetPasswordForEmail(e, o){ seen.push(['reset', o.captchaToken]); return {data: {}, error: null}; },
    async resend(a){ seen.push(['resend', a.options.captchaToken]); return {data: {}, error: null}; }
  };
  const S = createSupabaseStore(c, COLLS);
  await S.signIn('a@b.com', 'x');
  assert.deepEqual(seen.pop(), ['signIn', undefined], 'sem captcha configurado: nenhum token');
  S.setCaptcha(async () => 'tok' + (++n));
  await S.signUp('a@b.com', 'x', {}, 'u'); await S.signIn('a@b.com', 'x'); await S.resetPassword('a@b.com', 'u');
  await S.resendConfirmation('a@b.com', 'u'); await S.checkPassword('a@b.com', 'x');
  assert.deepEqual(seen, [['signUp', 'tok1'], ['signIn', 'tok2'], ['reset', 'tok3'], ['resend', 'tok4'], ['signIn', 'tok5']], 'um token novo por ação');
  S.setCaptcha(async () => { throw new Error('bloqueado'); });
  await assert.rejects(S.signIn('a@b.com', 'x'), e => /não é um robô/.test(e.userMessage));
});

test('captcha sem internet: mensagem de conexão, não de robô', async () => {
  const c = fakeClient();
  c.auth = {async signInWithPassword(){ return {data: {}, error: null}; }};
  const S = createSupabaseStore(c, COLLS);
  S.setCaptcha(async () => { throw new Error('script não carregou'); });
  const orig = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {value: {onLine: false}, configurable: true});
  try { await assert.rejects(S.signIn('a@b.com', 'x'), e => e.offline === true && /Failed to fetch/.test(e.cause.message)); }
  finally { if (orig) Object.defineProperty(globalThis, 'navigator', orig); else delete globalThis.navigator; }
});

test('gravação rápida: edição numa ida só, lotes e volta ao jeito antigo sem a migração', async () => {
  const c = fakeClient(), S = createSupabaseStore(c, COLLS);
  const list = await S.addMany('u1', 'transactions', [{amount: 1}, {amount: 2}, {amount: 3}]);
  assert.equal(c.calls.filter(x => x === 'user_data:insert').length, 1, '3 registros numa ida só');
  assert.ok(list.every(t => t.id) && c.db.user_data.length === 3);
  c.calls.length = 0;
  await S.updateMany('u1', 'transactions', list.map(t => ({id: t.id, partial: {category: 'lazer'}})));
  assert.deepEqual(c.calls, ['rpc:patch_docs'], 'editar 3 registros: uma chamada só');
  assert.ok(c.db.user_data.every(r => r.doc.category === 'lazer' && r.doc.amount > 0), 'mantém os outros campos');
  await S.removeMany('u1', 'transactions', [list[0].id, list[1].id]);
  assert.equal(c.db.user_data.length, 1);
  const old = fakeClient(); old.withoutPatchDocs();
  const S2 = createSupabaseStore(old, COLLS);
  const [t] = await S2.addMany('u1', 'transactions', [{amount: 5, category: 'a'}]);
  await S2.update('u1', 'transactions', t.id, {category: 'b'});
  assert.deepEqual(old.db.user_data[0].doc, {amount: 5, category: 'b'}, 'sem a migração, edita do jeito antigo');
  old.calls.length = 0;
  await S2.update('u1', 'transactions', t.id, {amount: 6});
  assert.ok(!old.calls.includes('rpc:patch_docs'), 'depois de saber que falta a migração, não tenta de novo');
});

test('captcha com domínio não autorizado: explica na hora', async () => {
  const {captchaError} = await import('../../js/ui/captcha.js');
  const c = fakeClient();
  c.auth = {async signInWithPassword(){ return {data: {}, error: null}; }};
  const S = createSupabaseStore(c, COLLS);
  S.setCaptcha(async () => { throw captchaError('110200'); });
  await assert.rejects(S.signIn('a@b.com', 'x'), e => /não está liberada para este endereço/.test(authMessage(e.cause)));
  assert.match(captchaError('300030').userMessage, /desconfiou deste navegador/);
});
