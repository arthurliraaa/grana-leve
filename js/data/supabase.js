/*
 * Adaptador do Supabase (Fase 2): login, dados sincronizados, estudo e painel de administração.
 * Implementa os mesmos métodos do Store local, então o resto do app não muda.
 * Quem protege os dados são as regras do banco (supabase/migrations); a chave usada aqui é a
 * pública (anon), que sozinha não lê nada de ninguém.
 */
import {uid} from '../domain/util.js';

// Mensagens do Supabase Auth traduzidas para o que a pessoa entende.
var AUTH_MESSAGES = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar: abra o link que enviamos para a sua caixa de entrada.'],
  [/user already registered|already been registered/i, 'Já existe uma conta com esse e-mail. Tente entrar.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'],
  [/password should be at least|weak password/i, 'A senha é fraca. Use pelo menos 6 caracteres, com letras e números.'],
  [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.']
];
export function authMessage(error){
  var msg = (error && (error.message || error.error_description)) || '';
  for (var i = 0; i < AUTH_MESSAGES.length; i++) if (AUTH_MESSAGES[i][0].test(msg)) return AUTH_MESSAGES[i][1];
  return 'Não foi possível concluir agora. Tente novamente.';
}

function check(res){
  if (res.error) throw Object.assign(new Error(res.error.message || 'Erro no servidor'), {cause: res.error});
  return res.data;
}
function docOf(obj){ var d = Object.assign({}, obj); delete d.id; return d; }

export function createSupabaseStore(client, collections){
  var studyCode;   // código do estudo da pessoa (undefined = ainda não buscado; null = não participa)

  return {
    mode: 'supabase',
    client: client,
    async persist(){ return null; },
    async migrate(){ return 0; },

    /* ---------- Login ---------- */
    async getSession(){ return check(await client.auth.getSession()).session; },
    onAuthChange(fn){ return client.auth.onAuthStateChange(fn); },
    async signUp(email, password, meta, redirectTo){
      return check(await client.auth.signUp({email: email, password: password, options: {data: meta, emailRedirectTo: redirectTo}}));
    },
    async signIn(email, password){ return check(await client.auth.signInWithPassword({email: email, password: password})); },
    async signOut(){ studyCode = undefined; await client.auth.signOut(); },
    async resetPassword(email, redirectTo){ return check(await client.auth.resetPasswordForEmail(email, {redirectTo: redirectTo})); },
    async updatePassword(password){ return check(await client.auth.updateUser({password: password})); },

    /* ---------- Perfil ---------- */
    async getUser(id){
      var rows = check(await client.from('profiles').select('name, role, blocked, research, created_at').eq('id', id).limit(1));
      return rows[0] || null;
    },
    async updateUser(id, partial){
      if (partial.name !== undefined) check(await client.from('profiles').update({name: partial.name}).eq('id', id));
    },
    async deleteUser(){ check(await client.rpc('delete_my_account')); studyCode = undefined; await client.auth.signOut(); },

    /* ---------- Dados do app ---------- */
    // Uma consulta traz tudo; list() usa o que já veio.
    async listAll(){
      var rows = [], from = 0, page;
      do {
        page = check(await client.from('user_data').select('collection, id, doc').order('collection').order('id').range(from, from + 999));
        rows = rows.concat(page);
        from += 1000;
      } while (page.length === 1000);
      var out = {};
      collections.forEach(function(c){ out[c] = []; });
      rows.forEach(function(r){ if (out[r.collection]) out[r.collection].push(Object.assign({id: r.id}, r.doc)); });
      return out;
    },
    async list(key, coll){
      var rows = check(await client.from('user_data').select('id, doc').eq('collection', coll));
      return rows.map(function(r){ return Object.assign({id: r.id}, r.doc); });
    },
    async add(key, coll, obj){
      var id = uid();
      check(await client.from('user_data').insert({collection: coll, id: id, doc: docOf(obj)}));
      return Object.assign({id: id}, obj);
    },
    async put(key, coll, id, obj){
      check(await client.from('user_data').upsert({collection: coll, id: id, doc: docOf(obj), updated_at: new Date().toISOString()}));
    },
    async update(key, coll, id, partial){
      var rows = check(await client.from('user_data').select('doc').eq('collection', coll).eq('id', id).limit(1));
      if (!rows.length) return;
      var doc = Object.assign({}, rows[0].doc, docOf(partial));
      check(await client.from('user_data').update({doc: doc, updated_at: new Date().toISOString()}).eq('collection', coll).eq('id', id));
    },
    async remove(key, coll, id){
      check(await client.from('user_data').delete().eq('collection', coll).eq('id', id));
    },
    // Restaurar backup / importar dados do navegador: substitui tudo da pessoa.
    async replaceAll(key, data){
      check(await client.from('user_data').delete().in('collection', collections));
      var rows = [];
      collections.forEach(function(c){ (data[c] || []).forEach(function(it){ rows.push({collection: c, id: it.id, doc: docOf(it)}); }); });
      for (var i = 0; i < rows.length; i += 500) check(await client.from('user_data').insert(rows.slice(i, i + 500)));
    },
    async isEmpty(){
      var rows = check(await client.from('user_data').select('id').limit(1));
      return !rows.length;
    },

    /* ---------- Estudo ---------- */
    async studyJoin(version, ageRange, uf){
      studyCode = undefined;
      return check(await client.rpc('study_join', {p_version: version, p_age: ageRange || '', p_uf: uf || ''}));
    },
    async studyWithdraw(){
      studyCode = null;
      return check(await client.rpc('study_withdraw'));
    },
    // Registra um evento do estudo. Nunca trava o app: qualquer erro é ignorado.
    async track(event, field){
      try {
        if (studyCode === undefined) studyCode = check(await client.rpc('my_study_code')) || null;
        if (!studyCode) return;
        await client.from('study_events').insert({code: studyCode, event: event, field: field || null});
      } catch(e){ /* o estudo nunca atrapalha o uso */ }
    },

    /* ---------- Conteúdos e administração ---------- */
    async listContent(){ return check(await client.from('content').select('id, kind, position, data').order('position')); },
    async isAdmin(){ try { return !!check(await client.rpc('is_admin')); } catch(e){ return false; } },
    async adminMetrics(){ return check(await client.rpc('admin_metrics')); },
    async adminAccounts(){ return check(await client.rpc('admin_list_accounts')); },
    async adminSetBlocked(id, blocked){ return check(await client.rpc('admin_set_blocked', {p_user: id, p_blocked: blocked})); },
    async adminDeleteAccount(id){ return check(await client.rpc('admin_delete_account', {p_user: id})); },
    async adminExportStudy(){ return check(await client.rpc('admin_export_study')); },
    async adminSaveContent(id, kind, position, data){ return check(await client.rpc('admin_save_content', {p_id: id, p_kind: kind, p_position: position, p_data: data})); },
    async adminDeleteContent(id){ return check(await client.rpc('admin_delete_content', {p_id: id})); }
  };
}
