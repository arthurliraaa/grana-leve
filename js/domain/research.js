/*
 * Pesquisa acadêmica: consentimento separado do cadastro (opt-in), com versão do termo e data,
 * para provar o consentimento (LGPD, art. 8º). Só participa quem tem 18 anos ou mais.
 *
 * O que entra no estudo (decidido com o responsável pelo projeto):
 *   - uso do app, anônimo: quais áreas e funções são usadas e quantas vezes;
 *   - correções do lançamento por mensagem: qual campo foi corrigido (sem valores nem textos);
 *   - perfil opcional: faixa etária e estado (UF).
 * Valores, descrições, nomes, e-mail e senha nunca entram.
 */
export var TERM_VERSION = '1';
export var TERM_DATE = '2026-10-09';

export var AGE_RANGES = [
  {id: '', label: 'Prefiro não dizer'},
  {id: '18-24', label: '18 a 24 anos'},
  {id: '25-34', label: '25 a 34 anos'},
  {id: '35-44', label: '35 a 44 anos'},
  {id: '45-59', label: '45 a 59 anos'},
  {id: '60+', label: '60 anos ou mais'}
];
export var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// Registro guardado no perfil da pessoa.
export function consentRecord(accept, ageRange, uf, now){
  var at = (now || new Date()).toISOString();
  if (!accept) return {consent: false, version: TERM_VERSION, at: at};
  return {
    consent: true, version: TERM_VERSION, at: at,
    ageRange: AGE_RANGES.some(function(a){ return a.id === ageRange; }) ? ageRange : '',
    uf: UFS.indexOf(uf) >= 0 ? uf : ''
  };
}
// Participa só quem aceitou a versão atual do termo (se o termo mudar, pergunta de novo).
export function isParticipating(research){
  return !!(research && research.consent && research.version === TERM_VERSION);
}
