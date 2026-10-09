// Sessão (30 dias) e preferências guardadas neste navegador.
var SESSION_KEY = 'granaleve_session_v1';
var SESSION_DAYS = 30;
export function saveSession(s){ try{ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch(e){} }
export function loadSession(){
  try{
    var s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s) return null;
    if (s.expiresAt && s.expiresAt < Date.now()){ clearSession(); return null; }
    return s;
  } catch(e){ return null; }
}
export function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); } catch(e){} }
export function newSession(emailKey, user){
  return {emailKey: emailKey, name: user.name, email: user.email, expiresAt: Date.now() + SESSION_DAYS*86400000};
}

// Preferências do usuário neste navegador (ex.: “não perguntar novamente”).
var prefsOwner = 'anon';
// As preferências são por usuário: chame ao entrar e ao sair.
export function setPrefsOwner(emailKey){ prefsOwner = emailKey || 'anon'; }
export function prefsKey(){ return 'granaleve_prefs_' + prefsOwner; }
export function getPrefs(){ try{ return JSON.parse(localStorage.getItem(prefsKey())) || {}; } catch(e){ return {}; } }
export function setPref(name, value){ var p = getPrefs(); p[name] = value; try{ localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch(e){} }
