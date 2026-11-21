/*
 * Persistência. Três adaptadores:
 *   "supabase": conta e dados no servidor (Fase 2, js/data/supabase.js);
 *   "local": localStorage deste navegador (Fase 1, e para desenvolver e testar);
 *   "cloud": banco do ambiente Claude, quando o app roda como Artifact.
 */
import {uid} from '../domain/util.js';
import {createSupabaseStore} from './supabase.js';
import {SUPABASE_URL, SUPABASE_ANON_KEY, BACKEND_OVERRIDE_KEY} from '../config.js';
import {SCHEMA_VERSION, migrateData} from './migrations.js';

export var COLLECTIONS = ['transactions','budgets','goals','debts','cards','receivables','forecasts','categories','vouchers','accounts','transfers','bills'];

// Quantas gravações (add, update, remove…) estão em andamento agora. js/ui/busy.js usa isto para não deixar um toque repetido gravar de novo
// enquanto a primeira gravação ainda não terminou (internet lenta).
export function trackWrites(store){
  ['add', 'addMany', 'put', 'update', 'updateMany', 'remove', 'removeMany'].forEach(function(name){
    var fn = store[name];
    if (typeof fn !== 'function' || fn.__tracked) return;
    var wrapped = async function(){
      store.inflight = (store.inflight || 0) + 1;
      try { return await fn.apply(this, arguments); }
      finally { store.inflight--; }
    };
    wrapped.__tracked = true;
    store[name] = wrapped;
  });
  return store;
}

export var Store = {
  inflight: 0,
  mode: 'local',
  db: null,
  LOCAL_KEY: 'granaleve_local_db_v1',

  // Se o app roda num ambiente com banco na nuvem e ele falha, NÃO troca para o navegador
  // sem avisar: guarda o erro em cloudError e a tela pergunta o que fazer.
  cloudError: null,
  async init(){
    this.cloudError = null;
    if (window.claude && typeof window.claude.use === 'function'){
      try{
        var db = await window.claude.use('db');
        if (db){ this.db = db; this.mode = 'cloud'; return; }
        this.cloudError = 'o armazenamento na nuvem não está disponível';
      } catch(e){ this.cloudError = (e && e.message) || 'erro ao conectar'; }
      this.mode = 'local';
      return;
    }
    var forceLocal = false;
    try { forceLocal = localStorage.getItem(BACKEND_OVERRIDE_KEY) === 'local'; } catch(e){ /* sem localStorage */ }
    if (!forceLocal && window.supabase && window.supabase.createClient && SUPABASE_URL){
      // PKCE: os links de confirmação e de nova senha voltam com ?code=, sem disputar o #/rota do app.
      var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
      });
      Object.assign(this, createSupabaseStore(client, COLLECTIONS));
      trackWrites(this);
      return;
    }
    this.mode = 'local';
  },
  // Pede ao navegador para não apagar os dados sozinho quando faltar espaço. Retorna true/false/null.
  async persist(){
    if (this.mode !== 'local' || !navigator.storage || !navigator.storage.persist) return null;
    try{ return (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch(e){ return null; }
  },

  _readLocal(){
    try{
      var raw = localStorage.getItem(this.LOCAL_KEY);
      return raw ? JSON.parse(raw) : {users:{}};
    } catch(e){ return {users:{}}; }
  },
  _writeLocal(data){
    try{ localStorage.setItem(this.LOCAL_KEY, JSON.stringify(data)); }
    catch(e){ this.onWriteError(e); }
  },
  _userLocal(data, key){
    var u = data.users[key];
    if (!u) u = data.users[key] = {profile:null, schemaVersion: SCHEMA_VERSION};
    // Dados de versões antigas são atualizados aqui (e gravados na próxima escrita ou em migrate()).
    if ((u.schemaVersion || 1) < SCHEMA_VERSION){ migrateData(u, u.schemaVersion || 1); u.schemaVersion = SCHEMA_VERSION; }
    COLLECTIONS.forEach(function(c){ if (!Array.isArray(u[c])) u[c] = []; });
    return u;
  },
  _userDoc(key){ return this.db.doc('users/' + key); },

  // Grava já atualizado o formato dos dados do usuário (chamado ao entrar). Retorna a versão anterior.
  async migrate(key){
    if (this.mode === 'cloud') return SCHEMA_VERSION;
    var data = this._readLocal();
    var before = data.users[key] ? (data.users[key].schemaVersion || 1) : SCHEMA_VERSION;
    if (before < SCHEMA_VERSION){ this._userLocal(data, key); this._writeLocal(data); }
    return before;
  },

  async getUser(key){
    if (this.mode === 'cloud'){
      var snap = await this._userDoc(key).get();
      return snap.exists ? snap.data() : null;
    }
    var u = this._readLocal().users[key];
    return (u && u.profile) ? u.profile : null;
  },
  async createUser(key, profile){
    if (this.mode === 'cloud'){ await this._userDoc(key).set(profile); return; }
    var data = this._readLocal();
    this._userLocal(data, key).profile = profile;
    this._writeLocal(data);
  },
  async updateUser(key, partial){
    if (this.mode === 'cloud'){ await this._userDoc(key).update(partial); return; }
    var data = this._readLocal();
    var u = this._userLocal(data, key);
    u.profile = Object.assign({}, u.profile, partial);
    this._writeLocal(data);
  },
  async deleteUser(key){
    if (this.mode === 'cloud'){
      for (var i=0;i<COLLECTIONS.length;i++){
        var q = await this._userDoc(key).collection(COLLECTIONS[i]).get();
        for (var j=0;j<q.docs.length;j++){ await this._userDoc(key).collection(COLLECTIONS[i]).doc(q.docs[j].id).delete(); }
      }
      await this._userDoc(key).delete();
      return;
    }
    var data = this._readLocal();
    delete data.users[key];
    this._writeLocal(data);
  },

  // Substitui todos os dados do usuário (usado ao restaurar um backup). O perfil e a senha não mudam.
  async replaceAll(key, data){
    if (this.mode === 'cloud'){
      for (var i=0;i<COLLECTIONS.length;i++){
        var c = COLLECTIONS[i];
        var q = await this._userDoc(key).collection(c).get();
        for (var j=0;j<q.docs.length;j++){ await this._userDoc(key).collection(c).doc(q.docs[j].id).delete(); }
        for (var n=0;n<data[c].length;n++){ var item = Object.assign({}, data[c][n]); var id = item.id; delete item.id; await this._userDoc(key).collection(c).doc(id).set(item); }
      }
      return;
    }
    var all = this._readLocal();
    var u = this._userLocal(all, key);
    COLLECTIONS.forEach(function(c){ u[c] = data[c].slice(); });
    u.schemaVersion = SCHEMA_VERSION;
    this._writeLocal(all);
  },

  async list(key, coll){
    if (this.mode === 'cloud'){
      var q = await this._userDoc(key).collection(coll).get();
      return q.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
    }
    return this._userLocal(this._readLocal(), key)[coll].slice();
  },
  async add(key, coll, obj){
    if (this.mode === 'cloud'){
      var ref = await this._userDoc(key).collection(coll).add(obj);
      return Object.assign({id: ref.id}, obj);
    }
    var data = this._readLocal();
    var withId = Object.assign({id: uid()}, obj);
    this._userLocal(data, key)[coll].push(withId);
    this._writeLocal(data);
    return withId;
  },
  async put(key, coll, id, obj){
    if (this.mode === 'cloud'){ await this._userDoc(key).collection(coll).doc(id).set(obj); return; }
    var data = this._readLocal();
    var u = this._userLocal(data, key);
    u[coll] = u[coll].filter(function(x){ return x.id !== id; });
    u[coll].push(Object.assign({id:id}, obj));
    this._writeLocal(data);
  },
  async update(key, coll, id, partial){
    if (this.mode === 'cloud'){ await this._userDoc(key).collection(coll).doc(id).update(partial); return; }
    var data = this._readLocal();
    var u = this._userLocal(data, key);
    u[coll] = u[coll].map(function(x){ return x.id === id ? Object.assign({}, x, partial) : x; });
    this._writeLocal(data);
  },
  // Em lote (o Supabase grava numa ida só; aqui, no navegador, lê e grava o armazenamento uma vez).
  async addMany(key, coll, list){
    if (this.mode === 'cloud'){ var out = []; for (var i = 0; i < list.length; i++) out.push(await this.add(key, coll, list[i])); return out; }
    var data = this._readLocal(), u = this._userLocal(data, key);
    var saved = list.map(function(obj){ return Object.assign({id: uid()}, obj); });
    u[coll] = u[coll].concat(saved);
    this._writeLocal(data);
    return saved;
  },
  async updateMany(key, coll, items){
    if (this.mode === 'cloud'){ for (var i = 0; i < items.length; i++) await this.update(key, coll, items[i].id, items[i].partial); return; }
    var data = this._readLocal(), u = this._userLocal(data, key), by = {};
    items.forEach(function(it){ by[it.id] = Object.assign(by[it.id] || {}, it.partial); });
    u[coll] = u[coll].map(function(x){ return by[x.id] ? Object.assign({}, x, by[x.id]) : x; });
    this._writeLocal(data);
  },
  async removeMany(key, coll, ids){
    if (this.mode === 'cloud'){ for (var i = 0; i < ids.length; i++) await this.remove(key, coll, ids[i]); return; }
    var data = this._readLocal(), u = this._userLocal(data, key), gone = {};
    ids.forEach(function(id){ gone[id] = true; });
    u[coll] = u[coll].filter(function(x){ return !gone[x.id]; });
    this._writeLocal(data);
  },
  async remove(key, coll, id){
    if (this.mode === 'cloud'){ await this._userDoc(key).collection(coll).doc(id).delete(); return; }
    var data = this._readLocal();
    var u = this._userLocal(data, key);
    u[coll] = u[coll].filter(function(x){ return x.id !== id; });
    this._writeLocal(data);
  }
};
trackWrites(Store);
