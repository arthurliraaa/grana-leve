// Pequenas funções de lista usadas em todo o app.
export function findById(list, id){ for (var i=0;i<list.length;i++){ if (list[i].id === id) return list[i]; } return null; }
// Soma de números comuns (contagens, porcentagens). Para dinheiro, use sumMoney de money.js.
export function sum(list, fn){ return list.reduce(function(s,x){ return s + Number(fn(x) || 0); }, 0); }
export function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
