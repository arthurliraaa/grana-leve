/*
 * Telefone do WhatsApp e chave Pix: o que a pessoa digita vira algo que funciona no link do
 * WhatsApp e numa cobrança, com uma explicação quando não dá para entender.
 */
function digits(s){ return String(s || '').replace(/\D/g, ''); }

// Número para https://wa.me/<número>: só dígitos, com o 55 do Brasil.
// "(11) 98888-7777" | "011 98888-7777" | "+55 11 98888-7777" | "0055..." -> "5511988887777".
// Devolve '' quando está vazio e null quando não parece um número com DDD.
export function whatsappNumber(raw){
  var text = String(raw || '').trim(), d = digits(text);
  if (!d) return '';
  if (/^\+/.test(text) || /^00/.test(d)){
    d = d.replace(/^00/, '');
    return d.length >= 10 && d.length <= 15 ? d : null;   // número internacional, como digitado
  }
  d = d.replace(/^0/, '');                                 // 0 da ligação interurbana
  if (d.length === 10 || d.length === 11) return /^[1-9]{2}/.test(d) ? '55' + d : null;
  if ((d.length === 12 || d.length === 13) && /^55/.test(d)) return d;
  return null;
}

// Chave Pix: CPF, CNPJ, celular, e-mail ou chave aleatória. Retorna '' se parece válida, ou o
// motivo. Não muda o que foi digitado (a chave aparece na cobrança do jeito que a pessoa escreveu).
function cpfOk(d){
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (var t = 9; t < 11; t++){
    var sum = 0;
    for (var i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(d[t])) return false;
  }
  return true;
}
function cnpjOk(d){
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  var w = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (var t = 12; t < 14; t++){
    var sum = 0;
    for (var i = 0; i < t; i++) sum += Number(d[i]) * w[i + 13 - t];
    var r = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (r !== Number(d[t])) return false;
  }
  return true;
}
export function pixKeyProblem(raw){
  var key = String(raw || '').trim();
  if (!key) return 'Digite a chave Pix.';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return '';                                   // e-mail
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return '';  // aleatória
  if (/[^\d\s().+\/-]/.test(key)) return 'Essa chave Pix não parece válida. Use CPF, CNPJ, celular, e-mail ou a chave aleatória.';
  var d = digits(key);
  if (/^\+/.test(key)) return d.length >= 12 && d.length <= 13 ? '' : 'Confira o celular da chave Pix: +55, DDD e número.';
  if (d.length === 14) return cnpjOk(d) ? '' : 'Confira o CNPJ da chave Pix: os dígitos não batem.';
  if (d.length === 11){
    if (cpfOk(d)) return '';
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(key)) return 'Confira o CPF da chave Pix: os dígitos não batem.';
    // 11 dígitos que não são CPF: celular com DDD (o 3º dígito é 9).
    return /^[1-9]{2}9/.test(d) ? '' : 'Confira a chave Pix: não é um CPF válido nem um celular com DDD.';
  }
  if (d.length === 10 || d.length === 12 || d.length === 13) return /^(55)?[1-9]{2}9?\d{8}$/.test(d) ? '' : 'Confira o celular da chave Pix: DDD e número.';
  return 'Essa chave Pix não parece válida. Use CPF, CNPJ, celular, e-mail ou a chave aleatória.';
}
