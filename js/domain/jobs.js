/*
 * Mais de um emprego. Cada emprego tem o seu perfil da calculadora (regime, salário bruto, descontos, ganhos) e, se a pessoa quiser, a
 * sua própria previsão de salário. Aqui ficam só as contas sobre a lista; quem guarda é js/ui/salary-calc.js (preferências).
 * Forma: {list: [{id, name, profile}], active: id}. Quem só tinha o perfil único (prefs.workProfile) vira um emprego chamado
 * “Emprego principal” (migrateJobs), sem perder nada.
 */
export var DEFAULT_JOB_ID = 'j1';
export var MAX_JOBS = 6;
export var DEFAULT_JOB_NAME = 'Emprego principal';

function cleanName(s, fallback){ s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40); return s || fallback; }

// prefs.workJobs, ou o perfil antigo (prefs.workProfile) como o único emprego, ou uma lista com um emprego vazio.
export function migrateJobs(prefs){
  var w = prefs && prefs.workJobs;
  if (w && Array.isArray(w.list) && w.list.length){
    var list = w.list.map(function(j, i){ return {id: String(j.id || ('j' + (i + 1))), name: cleanName(j.name, 'Emprego ' + (i + 1)), profile: j.profile || {}}; });
    return {list: list, active: list.some(function(j){ return j.id === w.active; }) ? w.active : list[0].id};
  }
  return {list: [{id: DEFAULT_JOB_ID, name: DEFAULT_JOB_NAME, profile: (prefs && prefs.workProfile) || {}}], active: DEFAULT_JOB_ID};
}
export function activeJob(state){ return state.list.filter(function(j){ return j.id === state.active; })[0] || state.list[0]; }
export function jobById(state, id){ return state.list.filter(function(j){ return j.id === id; })[0] || null; }
function nextId(list){
  var n = 1; while (list.some(function(j){ return j.id === 'j' + n; })) n++;
  return 'j' + n;
}
// Novo emprego (vazio) e ele passa a ser o ativo. Respeita o limite.
export function addJob(state, name){
  if (state.list.length >= MAX_JOBS) return state;
  var id = nextId(state.list);
  return {list: state.list.concat([{id: id, name: cleanName(name, 'Emprego ' + (state.list.length + 1)), profile: {}}]), active: id};
}
export function removeJob(state, id){
  if (state.list.length <= 1) return state;
  var list = state.list.filter(function(j){ return j.id !== id; });
  return {list: list, active: state.active === id ? list[0].id : state.active};
}
export function setActive(state, id){ return jobById(state, id) ? {list: state.list, active: id} : state; }
export function renameJob(state, id, name){
  return {list: state.list.map(function(j){ return j.id === id ? {id: j.id, name: cleanName(name, j.name), profile: j.profile} : j; }), active: state.active};
}
export function setProfile(state, id, profile){
  return {list: state.list.map(function(j){ return j.id === id ? {id: j.id, name: j.name, profile: profile} : j; }), active: state.active};
}
// Garante que existe o emprego `id` (por exemplo, o de uma previsão de salário que veio de outro aparelho).
export function ensureJob(state, id, name){
  if (jobById(state, id)) return state;
  if (state.list.length >= MAX_JOBS) return state;
  return {list: state.list.concat([{id: id, name: cleanName(name, 'Emprego ' + (state.list.length + 1)), profile: {}}]), active: state.active};
}
// Resumo para mostrar: [{id, name, gross, fixedNet}] e o total. netOf(profile) → {gross, fixedNet} (quem chama usa o netSalary).
export function summarizeJobs(state, netOf){
  var rows = state.list.map(function(j){
    var r = Number(j.profile && j.profile.gross) > 0 ? netOf(j.profile) : {gross: 0, fixedNet: 0};
    return {id: j.id, name: j.name, gross: r.gross, fixedNet: r.fixedNet};
  });
  var round = function(v){ return Math.round(v * 100) / 100; };
  return {rows: rows, gross: round(rows.reduce(function(s, r){ return s + r.gross; }, 0)), fixedNet: round(rows.reduce(function(s, r){ return s + r.fixedNet; }, 0)), count: rows.filter(function(r){ return r.gross > 0; }).length};
}
