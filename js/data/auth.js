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

// Domínio digitado errado (gmaill.com, hotmal.com, gmail.com.br...): devolve o e-mail corrigido ou ''.
// Só sugere quando o domínio fica a 1 letra (2 nos domínios com 11 letras ou mais) de um provedor conhecido e não é
// ele mesmo. É só uma pergunta: a pessoa pode manter o que digitou.
var EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'yahoo.com',
  'yahoo.com.br', 'icloud.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'msn.com', 'protonmail.com', 'proton.me',
  'me.com', 'aol.com', 'gmx.com', 'ymail.com', 'mail.com', 'email.com', 'zoho.com', 'globo.com', 'ig.com.br', 'r7.com'];
var EMAIL_FIXES = {'gmail.com.br': 'gmail.com', 'icloud.com.br': 'icloud.com', 'live.com.br': 'live.com',
  'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br', 'terra.com': 'terra.com.br'};
// Distância entre dois textos (inserir, apagar, trocar uma letra ou inverter duas vizinhas = 1).
function editDistance(a, b){
  var d = [], i, j;
  for (i = 0; i <= a.length; i++){ d[i] = [i]; }
  for (j = 0; j <= b.length; j++) d[0][j] = j;
  for (i = 1; i <= a.length; i++){
    for (j = 1; j <= b.length; j++){
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
export function emailTypo(email){
  var text = String(email || '').trim(), at = text.lastIndexOf('@');
  if (at < 1) return '';
  var user = text.slice(0, at), domain = text.slice(at + 1).toLowerCase();
  if (!domain || EMAIL_DOMAINS.indexOf(domain) >= 0) return '';
  if (EMAIL_FIXES[domain]) return user + '@' + EMAIL_FIXES[domain];
  var max = domain.length >= 11 ? 2 : 1, best = '', bestD = max + 1;
  EMAIL_DOMAINS.forEach(function(d){
    var dist = editDistance(domain, d);
    if (dist < bestD){ best = d; bestD = dist; }
  });
  return best ? user + '@' + best : '';
}

// Dica de onde olhar quando o e-mail de confirmação não chega, conforme o provedor ('' se não há dica específica).
// Hotmail/Outlook/Live/MSN costumam mandar mensagem de remetente novo para o Lixo Eletrônico.
export function mailProviderTip(email){
  var domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
  if (/^(hotmail|outlook|live|msn)\./.test(domain))
    return 'No Outlook/Hotmail, olhe a pasta <strong>Lixo Eletrônico</strong> e a aba <strong>Outros</strong> da Caixa de Entrada. Se estiver lá, marque como “Não é lixo eletrônico”.';
  if (/^(yahoo|ymail)\./.test(domain)) return 'No Yahoo, olhe a pasta <strong>Spam</strong>.';
  if (/^(icloud|me|mac)\./.test(domain)) return 'No iCloud, olhe a pasta <strong>Lixo Eletrônico</strong>.';
  return '';
}

// Intervalo entre pedidos de link por e-mail (nova senha, confirmação): o Supabase recusa um pedido
// novo para o mesmo endereço antes do intervalo, e cada link novo invalida o anterior.
var LINK_KEY = 'granaleve_link_sent_v1';
function readLinks(){ try{ return JSON.parse(localStorage.getItem(LINK_KEY)) || {}; } catch(e){ return {}; } }
function linkId(kind, email){ return kind + ':' + String(email || '').trim().toLowerCase(); }
export function linkWait(kind, email, seconds, now){
  var at = readLinks()[linkId(kind, email)] || 0;
  var left = at ? Math.ceil((at + seconds * 1000 - (now || Date.now())) / 1000) : 0;
  return left > 0 ? left : 0;
}
export function markLinkSent(kind, email, at){
  var all = readLinks(), now = at || Date.now();
  // Guarda só o último dia, para a lista não crescer.
  Object.keys(all).forEach(function(key){ if (now - all[key] > 86400000) delete all[key]; });
  all[linkId(kind, email)] = now;
  try{ localStorage.setItem(LINK_KEY, JSON.stringify(all)); } catch(e){ /* sem armazenamento: o servidor ainda limita */ }
}

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
