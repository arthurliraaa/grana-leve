/*
 * Aceite dos Termos de uso e da Política de privacidade. Guardamos só a prova do aceite
 * (versão e momento). Contas antigas, que aceitaram antes (com ou sem a confirmação de idade),
 * continuam valendo na mesma versão.
 */
export var TERMS_VERSION = '1';

// Mensagem de problema (texto para a pessoa) ou '' se está tudo certo.
export function termsProblem(accepted){
  return accepted ? '' : 'Para continuar, aceite os Termos de uso e a Política de privacidade.';
}
export function termsRecord(now){ return {version: TERMS_VERSION, at: (now || new Date()).toISOString()}; }
export function termsOk(meta){ var t = meta && meta.terms; return !!(t && t.version === TERMS_VERSION); }
