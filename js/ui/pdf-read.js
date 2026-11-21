/*
 * Leitura de PDF (pdf.js) para importar fatura ou extrato: extrai o texto e devolve uma linha por linha visual da página.
 * O pdf.js pesa cerca de 1,4 MB (leitor e worker): só é baixado do CDN quando a pessoa escolhe um PDF, com a verificação de
 * integridade (SRI) nos dois arquivos. O worker é baixado por fetch com integrity, vira um blob e roda a partir dele
 * (a política de segurança do site só deixa worker próprio ou blob). Sem eval nas fontes (isEvalSupported: false),
 * como pede o aviso de segurança do pdf.js (CVE-2024-4367) para esta versão.
 * O que se faz com as linhas está em domain/statement.js (parsePdfLines).
 */
var BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
var LIB = {src: BASE + 'pdf.min.js', integrity: 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ=='};
var WORKER = {src: BASE + 'pdf.worker.min.js', integrity: 'sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw=='};
export var MAX_PDF_BYTES = 10 * 1024 * 1024;
var MAX_PAGES = 30;
var loading = null;

function inject(){
  return new Promise(function(resolve){
    var s = document.createElement('script');
    s.src = LIB.src; s.integrity = LIB.integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = function(){ resolve(!!window.pdfjsLib); };
    s.onerror = function(){ s.remove(); resolve(false); };
    document.head.appendChild(s);
  });
}
export function loadPdfJs(){
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions.workerSrc) return Promise.resolve(true);
  if (loading) return loading;
  loading = (async function(){
    if (!window.pdfjsLib && !(await inject())) return false;
    try {
      var res = await fetch(WORKER.src, {integrity: WORKER.integrity, referrerPolicy: 'no-referrer'});
      if (!res.ok) return false;
      var buf = await res.arrayBuffer();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([buf], {type: 'text/javascript'}));
      return true;
    } catch(e){ return false; }
  })().then(function(ok){ if (!ok) loading = null; return ok; });
  return loading;
}

// Itens de texto de uma página → linhas (mesma altura = mesma linha; da esquerda para a direita; de cima para baixo).
function pageLines(items){
  var rows = [];
  items.forEach(function(it){
    if (!it.str || !it.str.trim()) return;
    var x = it.transform[4], y = it.transform[5], row = rows.filter(function(r){ return Math.abs(r.y - y) <= 2.5; })[0];
    if (!row){ row = {y: y, parts: []}; rows.push(row); }
    row.parts.push({x: x, s: it.str});
  });
  return rows.sort(function(a, b){ return b.y - a.y; }).map(function(r){
    return r.parts.sort(function(a, b){ return a.x - b.x; }).map(function(p){ return p.s; }).join(' ');
  });
}

// Lê o arquivo e devolve {lines, pages}. askPassword(motivo) devolve a senha (ou null para desistir); motivo 'wrong' se a anterior falhou.
export async function readPdfLines(bytes, askPassword){
  if (!(await loadPdfJs())) throw new Error('offline');
  var lib = window.pdfjsLib, task = lib.getDocument({data: bytes, isEvalSupported: false, enableXfa: false}), cancelled = false;
  task.onPassword = async function(update, reason){
    var pw = askPassword ? await askPassword(reason === lib.PasswordResponses.INCORRECT_PASSWORD ? 'wrong' : 'need') : null;
    if (pw === null || pw === undefined){ cancelled = true; task.destroy(); return; }
    update(pw);
  };
  var doc;
  try { doc = await task.promise; } catch(e){ if (cancelled) throw new Error('cancelled'); throw e; }
  var lines = [], pages = Math.min(doc.numPages, MAX_PAGES);
  for (var p = 1; p <= pages; p++){
    var page = await doc.getPage(p), tc = await page.getTextContent();
    lines = lines.concat(pageLines(tc.items));
  }
  doc.destroy();
  return {lines: lines, pages: pages, truncated: doc.numPages > MAX_PAGES};
}
