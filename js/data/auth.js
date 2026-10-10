/*
 * Senha e login. A senha nunca é guardada: só o hash PBKDF2-SHA256 com sal.
 * Atenção: tudo isto roda no navegador. Protege a senha de ficar em texto puro,
 * mas não é uma fronteira de segurança para os dados, que continuam neste aparelho.
 */
var PBKDF2_ITER = 210000;
function bufToHex(buf){ return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join(''); }
function hexToBuf(hex){ var out = new Uint8Array(hex.length/2); for (var i=0;i<out.length;i++){ out[i] = parseInt(hex.substr(i*2,2),16); } return out; }
function randomHex(bytes){ var a = new Uint8Array(bytes); crypto.getRandomValues(a); return bufToHex(a); }
async function sha256Hex(str){ return bufToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); }
async function pbkdf2Hex(password, saltHex, iterations){
  var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt: hexToBuf(saltHex), iterations: iterations, hash:'SHA-256'}, key, 256);
  return bufToHex(bits);
}
// Comparação em tempo constante, para não vazar quantos caracteres batem.
function safeEqual(a, b){
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i=0;i<Math.max(a.length,b.length);i++){ diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0); }
  return diff === 0;
}
export async function makePasswordRecord(password){
  var salt = randomHex(16);
  return {passwordAlgo:'pbkdf2-sha256', passwordIter: PBKDF2_ITER, passwordSalt: salt, passwordHash: await pbkdf2Hex(password, salt, PBKDF2_ITER)};
}
// Retorna {ok, legacy}. Contas antigas usavam SHA-256 sem sal e são migradas no login.
export async function verifyPassword(user, email, password){
  if (user.passwordAlgo === 'pbkdf2-sha256'){
    return {ok: safeEqual(await pbkdf2Hex(password, user.passwordSalt, user.passwordIter || PBKDF2_ITER), user.passwordHash), legacy:false};
  }
  var legacy = await sha256Hex('granaleve::' + email.toLowerCase() + '::' + password);
  return {ok: safeEqual(legacy, user.passwordHash), legacy:true};
}
// Regras da senha (valem ao criar ou trocar). Os caracteres especiais são os mesmos que o
// Supabase reconhece como símbolo, para o app e o servidor concordarem; acento não conta.
export var PASSWORD_SYMBOLS = '!@#$%^&*()_+-=[]{};\':"|<>?,./`~\\';
export var PASSWORD_RULES = [
  {id: 'length', label: 'Pelo menos 6 caracteres', test: function(pw){ return pw.length >= 6; }},
  {id: 'letter', label: 'Uma letra', test: function(pw){ return /[a-zA-Z]/.test(pw); }},
  {id: 'number', label: 'Um número', test: function(pw){ return /[0-9]/.test(pw); }},
  {id: 'symbol', label: 'Um caractere especial (como ! @ # $ %)', test: function(pw){
    for (var i = 0; i < pw.length; i++) if (PASSWORD_SYMBOLS.indexOf(pw[i]) >= 0) return true;
    return false;
  }}
];
export function passwordProblem(pw){
  if (pw.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use pelo menos uma letra e um número na senha.';
  if (!PASSWORD_RULES[3].test(pw)) return 'Use pelo menos um caractere especial na senha (como ! @ # $ %).';
  return '';
}
export function sanitizeEmailKey(email){
  return String(email).trim().toLowerCase().replace(/[^a-z0-9_.~:@+-]/g, '_');
}
export function validEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

// Limite de tentativas de login: 5 erros seguidos bloqueiam por 60 segundos.
var LOCK_KEY = 'granaleve_login_lock_v1';
function readLock(){ try{ return JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; } catch(e){ return {}; } }
function writeLock(v){ try{ localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch(e){} }
export function lockRemaining(emailKey){ var l = readLock()[emailKey]; return (l && l.until > Date.now()) ? Math.ceil((l.until - Date.now())/1000) : 0; }
export function registerFail(emailKey){
  var all = readLock(); var l = all[emailKey] || {fails:0, until:0};
  l.fails += 1;
  if (l.fails >= 5){ l.until = Date.now() + 60000; l.fails = 0; }
  all[emailKey] = l; writeLock(all);
}
export function clearFails(emailKey){ var all = readLock(); delete all[emailKey]; writeLock(all); }
