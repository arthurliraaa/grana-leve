/*
 * Adaptador do Supabase (Fase 2): login, dados sincronizados, estudo e painel de administração.
 * Implementa os mesmos métodos do Store local, então o resto do app não muda.
 * Quem protege os dados são as regras do banco (supabase/migrations); a chave usada aqui é a
 * pública (anon), que sozinha não lê nada de ninguém.
 */
import {uid} from '../domain/util.js';

// Mensagens do Supabase Auth traduzidas para o que a pessoa entende.
var AUTH_MESSAGES = [
  [/captcha/i, 'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.'],
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar: abra o link que enviamos para a sua caixa de entrada.'],
  [/user already registered|already been registered/i, 'Já existe uma conta com esse e-mail. Tente entrar.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'],
  [/password should be at least|weak password/i, 'A senha é fraca. Use pelo menos 6 caracteres, com letras e números.'],
  [/error sending .*email|sending (confirmation|recovery|magic link)|smtp|mail/i, 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos; se continuar, avise a equipe do Grana Leve.'],
  [/expired|invalid.*(token|link|otp)|otp/i, 'Este link expirou ou já foi usado. Peça um novo.'],
  [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.']
];
export function authMessage(error){
  var msg = (error && (error.message || error.error_description)) || '';
  // Detalhe técnico no console do navegador (F12), para diagnosticar sem mostrar à pessoa.
  if (typeof console !== 'undefined' && error) console.warn('[Grana Leve] erro do login:', error.status || '', error.code || '', msg);
  for (var i = 0; i < AUTH_MESSAGES.length; i++) if (AUTH_MESSAGES[i][0].test(msg)) return AUTH_MESSAGES[i][1];
  return 'Não foi possível concluir agora. Tente novamente.';
}

export var OFFLINE_MESSAGE = 'Sem internet: nada foi salvo. Tente de novo quando a conexão voltar.';
function isNetworkError(e){ return /failed to fetch|network|load failed|fetch/i.test(String(e && (e.message || e))); }
// Erro com uma mensagem pronta para a tela (userMessage).
// Mensagens dos limites do banco (migração 20261010010000_limites.sql) e da coleção nova.
function serverMessage(err){
  var m = String((err && (err.message + ' ' + (err.hint || ''))) || '');
  if (/limite_registros|Limite de 20 mil/.test(m)) return 'Sua conta chegou ao limite de 20 mil registros. Apague lançamentos antigos (ou baixe um backup e comece de novo) para continuar.';
  if (/user_data_collection_check/.test(m)) return 'O servidor ainda não aceita este tipo de registro. Avise quem cuida do app: falta rodar uma atualização do banco.';
  return 'O servidor recusou a operação. Recarregue a página e tente de novo.';
}
function check(res){
  if (res.error){
    var offline = isNetworkError(res.error) || (typeof navigator !== 'undefined' && navigator.onLine === false);
    throw Object.assign(new Error(res.error.message || 'Erro no servidor'), {cause: res.error, offline: offline,
      userMessage: offline ? OFFLINE_MESSAGE : serverMessage(res.error)});
  }
  return res.data;
}
// A função ainda não existe no banco (migração não rodada).
function isMissingFunction(err){ return err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(String(err.message))); }
function docOf(obj){ var d = Object.assign({}, obj); delete d.id; return d; }

export function createSupabaseStore(client, collections){
  var studyCode;   // código do estudo da pessoa (undefined = ainda não buscado; null = não participa)
  var captcha = null;   // fornecedor do token do captcha (Turnstile), quando ligado
  var patchRpc = null;  // patch_docs existe no banco? (null = ainda não sabemos)
  // Token novo a cada ação de login (cada token só vale uma vez). Sem captcha: undefined.
  async function cap(){
    if (!captcha) return undefined;
    try { return await captcha(); }
    catch(e){
      // Sem internet o captcha nem carrega: a mensagem certa é a de conexão, não a de robô.
      var off = typeof navigator !== 'undefined' && navigator.onLine === false;
      throw Object.assign(new Error(off ? 'Failed to fetch' : 'captcha failed'), {cause: {message: off ? 'Failed to fetch' : 'captcha failed'}, offline: off,
        userMessage: off ? OFFLINE_MESSAGE : AUTH_MESSAGES[0][1]});
    }
  }

  return {
    mode: 'supabase',
    client: client,
    async persist(){ return null; },
    async migrate(){ return 0; },

    /* ---------- Login ---------- */
    async getSession(){ return check(await client.auth.getSession()).session; },
    onAuthChange(fn){ return client.auth.onAuthStateChange(fn); },
    setCaptcha(fn){ captcha = fn; },
    async signUp(email, password, meta, redirectTo){
      var token = await cap();
      return check(await client.auth.signUp({email: email, password: password, options: {data: meta, emailRedirectTo: redirectTo, captchaToken: token}}));
    },
    async signIn(email, password){ var token = await cap(); return check(await client.auth.signInWithPassword({email: email, password: password, options: {captchaToken: token}})); },
    async signOut(){ studyCode = undefined; await client.auth.signOut(); },
    async resetPassword(email, redirectTo){ var token = await cap(); return check(await client.auth.resetPasswordForEmail(email, {redirectTo: redirectTo, captchaToken: token})); },
    async updatePassword(password){ return check(await client.auth.updateUser({password: password})); },
    // Link do e-mail (modelos em supabase/templates): o token vem no endereço e só é usado aqui,
    // quando o app abre de verdade. Pré-visualização de link (Gmail, antivírus) não o gasta.
    async verifyEmailLink(tokenHash, type){ return check(await client.auth.verifyOtp({token_hash: tokenHash, type: type})); },
    // Troca de e-mail: com "Secure email change" (padrão do Supabase), chega um link no e-mail atual
    // e outro no novo; a troca só vale depois de confirmar.
    async updateEmail(email, redirectTo){ return check(await client.auth.updateUser({email: email}, {emailRedirectTo: redirectTo})); },
    // Confere a senha atual antes de trocar (entrar de novo com ela; erro = senha errada).
    async checkPassword(email, password){ var token = await cap(); return check(await client.auth.signInWithPassword({email: email, password: password, options: {captchaToken: token}})); },
    async signOutAll(){ studyCode = undefined; await client.auth.signOut({scope: 'global'}); },
    async resendConfirmation(email, redirectTo){ var token = await cap(); return check(await client.auth.resend({type: 'signup', email: email, options: {emailRedirectTo: redirectTo, captchaToken: token}})); },

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
    async update(key, coll, id, partial){ return this.updateMany(key, coll, [{id: id, partial: partial}]); },
    // Várias edições numa ida só: o banco junta as mudanças em cada registro (patch_docs, migração
    // 20261011000000). Sem a migração, volta ao jeito antigo: ler e gravar registro por registro.
    async updateMany(key, coll, items){
      if (!items.length) return;
      if (patchRpc !== false){
        var res = await client.rpc('patch_docs', {p_collection: coll, p_items: items.map(function(it){ return {id: it.id, patch: docOf(it.partial)}; })});
        if (!res.error){ patchRpc = true; return; }
        if (!isMissingFunction(res.error)) check(res);
        patchRpc = false;
      }
      for (var i = 0; i < items.length; i++){
        var rows = check(await client.from('user_data').select('doc').eq('collection', coll).eq('id', items[i].id).limit(1));
        if (!rows.length) continue;
        var doc = Object.assign({}, rows[0].doc, docOf(items[i].partial));
        check(await client.from('user_data').update({doc: doc, updated_at: new Date().toISOString()}).eq('collection', coll).eq('id', items[i].id));
      }
    },
    // Vários registros novos numa ida só (ex.: as 12 parcelas de uma compra).
    async addMany(key, coll, list){
      var rows = list.map(function(obj){ return {collection: coll, id: uid(), doc: docOf(obj)}; });
      for (var i = 0; i < rows.length; i += 500) check(await client.from('user_data').insert(rows.slice(i, i + 500)));
      return list.map(function(obj, j){ return Object.assign({id: rows[j].id}, obj); });
    },
    async remove(key, coll, id){
      check(await client.from('user_data').delete().eq('collection', coll).eq('id', id));
    },
    async removeMany(key, coll, ids){
      for (var i = 0; i < ids.length; i += 200) check(await client.from('user_data').delete().eq('collection', coll).in('id', ids.slice(i, i + 200)));
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
