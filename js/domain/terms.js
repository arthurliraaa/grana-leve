/*
 * Aceite dos Termos de uso e da Política de privacidade, com confirmação de maioridade (18+).
 * Guardamos só a prova do aceite (versão, momento e "é maior de idade"), não a data de nascimento.
 */
export var TERMS_VERSION = '1';
export var MIN_AGE = 18;

// Idade completa em anos na data `today` ('AAAA-MM-DD'), ou null se a data de nascimento não é válida.
export function ageOn(birth, today){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth || ''));
  var t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  if (!m || !t) return null;
  var by = +m[1], bm = +m[2], bd = +m[3];
  var d = new Date(by, bm - 1, bd);
  if (d.getFullYear() !== by || d.getMonth() !== bm - 1 || d.getDate() !== bd) return null;   // 31/02 etc.
  if (by < 1900 || birth > today) return null;
  var age = +t[1] - by;
  if (+t[2] < bm || (+t[2] === bm && +t[3] < bd)) age--;
  return age;
}
// Mensagem de problema (texto para a pessoa) ou '' se está tudo certo.
export function termsProblem(birth, accepted, today){
  if (!birth) return 'Informe a sua data de nascimento.';
  var age = ageOn(birth, today);
  if (age === null) return 'Confira a data de nascimento.';
  if (age < MIN_AGE) return 'O Grana Leve é para maiores de ' + MIN_AGE + ' anos.';
  if (!accepted) return 'Para continuar, aceite os Termos de uso e a Política de privacidade.';
  return '';
}
export function termsRecord(now){ return {version: TERMS_VERSION, at: (now || new Date()).toISOString(), adult: true}; }
export function termsOk(meta){ var t = meta && meta.terms; return !!(t && t.adult === true && t.version === TERMS_VERSION); }
