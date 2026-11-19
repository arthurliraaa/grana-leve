// Geração de PDF (jsPDF, baixado do CDN só quando é preciso) e visualização dentro do app.
import {escapeHtml, saveFile, toast} from './dom.js';
import {openModal} from './modal.js';

export function pdfWriter(title, subtitle){
  var doc = new window.jspdf.jsPDF({unit:'pt', format:'a4'});
  var pageW = doc.internal.pageSize.getWidth();
  var marginX = 48, line = [225,224,217];
  var w = {doc: doc, y: 56};
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(20,20,20);
  doc.text(title, marginX, w.y); w.y += 20;
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85);
  doc.text(subtitle, marginX, w.y); w.y += 6;
  doc.setDrawColor.apply(doc, line); doc.line(marginX, w.y+8, pageW-marginX, w.y+8);
  w.y += 30;
  function ensure(space){ if (w.y + space > 770){ doc.addPage(); w.y = 56; } }
  w.section = function(t){ ensure(40); doc.setFont('helvetica','bold'); doc.setFontSize(12.5); doc.setTextColor(20,20,20); doc.text(t, marginX, w.y); w.y += 16; };
  w.header = function(cols, widths){
    ensure(30);
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(110,108,100);
    var x = marginX; cols.forEach(function(c,i){ doc.text(c, x, w.y); x += widths[i]; });
    w.y += 8; doc.setDrawColor.apply(doc, line); doc.line(marginX, w.y, pageW-marginX, w.y); w.y += 14;
  };
  w.row = function(cells, widths, opts){
    opts = opts || {};
    ensure(17);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(10.5); doc.setTextColor(30,30,28);
    var x = marginX;
    cells.forEach(function(c,i){ doc.text(doc.splitTextToSize(String(c), widths[i]-8)[0] || '', x, w.y); x += widths[i]; });
    w.y += 17;
  };
  // Faixa de destaque (nome do cartão): separa uma parte da outra com cor.
  w.band = function(t){
    ensure(36);
    doc.setFillColor(232,240,236); doc.rect(marginX - 4, w.y - 12, pageW - 2 * marginX + 8, 20, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.setTextColor(20,70,50); doc.text(t, marginX, w.y + 2);
    w.y += 22;
  };
  w.text = function(t){ ensure(20); doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85); doc.text(t, marginX, w.y); w.y += 20; };
  w.space = function(n){ w.y += n; };
  w.footer = function(){
    var pages = doc.getNumberOfPages();
    for (var i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(140,138,130);
      doc.text('Gerado pelo Grana Leve em ' + new Date().toLocaleDateString('pt-BR') + '  ·  página ' + i + ' de ' + pages, marginX, 810);
    }
  };
  return w;
}
// Mostra o PDF dentro do sistema, com opções de baixar e compartilhar.
export async function showPdf(doc, filename, title){
  var blob = doc.output('blob');
  var url = URL.createObjectURL(blob);
  var file = null, canShare = false;
  try{ file = new File([blob], filename, {type:'application/pdf'}); canShare = !!(navigator.canShare && navigator.canShare({files:[file]})); } catch(e){}
  // No celular o navegador não mostra PDF dentro da página (fica em branco): aqui as ações vêm primeiro,
  // grandes, e a pré-visualização só aparece onde funciona.
  var small = !!(window.matchMedia && window.matchMedia('(max-width: 620px)').matches) || navigator.pdfViewerEnabled === false;
  await openModal({
    title: title, wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<p class="pdf-ready">' + (small ? 'Seu PDF está pronto. Escolha o que fazer:' : 'Seu PDF está pronto.') + '</p>' +
      '<div class="pdf-actions pdf-actions-top">' +
        '<button type="button" class="btn btn-primary btn-pdf" data-pdf="open">Abrir PDF</button>' +
        '<button type="button" class="btn btn-primary btn-pdf" data-pdf="download">Baixar PDF</button>' +
        (canShare ? '<button type="button" class="btn btn-ghost btn-pdf" data-pdf="share">Compartilhar</button>' : '') +
      '</div>' +
      (small ? '' : '<iframe class="pdf-frame" src="' + url + '" title="' + escapeHtml(title) + '"></iframe><p class="field-hint">Se a pré-visualização não aparecer, use os botões acima.</p>'),
    onOpen: function(root){
      root.addEventListener('click', function(e){
        var b = e.target.closest('[data-pdf]');
        if (!b) return;
        var act = b.getAttribute('data-pdf');
        if (act === 'download') saveFile(filename, blob, 'application/pdf').then(function(){ toast('PDF baixado.'); });
        if (act === 'share') navigator.share({files:[file], title:title}).catch(function(){});
        if (act === 'open') window.open(url, '_blank', 'noopener');
      });
    },
    onClose: function(){ setTimeout(function(){ URL.revokeObjectURL(url); }, 60000); }
  });
}
// O jsPDF pesa centenas de KB e quase ninguém gera PDF na hora que abre o app: baixa na primeira vez que é preciso (com a
// verificação de integridade) e, em silêncio, quando o app fica parado com internet, para já estar guardado para o uso sem rede.
var JSPDF = {
  src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js',
  integrity: 'sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj+tiDLffZ4FVUj5a8vyKJ9pIgl8JCAHEJ4D1iUKBecswg=='
};
var jspdfLoading = null;
function hasPdfLib(){ return !!(window.jspdf && window.jspdf.jsPDF); }
export function loadPdfLib(){
  if (hasPdfLib()) return Promise.resolve(true);
  if (jspdfLoading) return jspdfLoading;
  jspdfLoading = new Promise(function(resolve){
    var s = document.createElement('script');
    s.src = JSPDF.src; s.integrity = JSPDF.integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = function(){ resolve(hasPdfLib()); };
    s.onerror = function(){ jspdfLoading = null; s.remove(); resolve(false); };
    document.head.appendChild(s);
  });
  return jspdfLoading;
}
export async function pdfReady(){
  if (hasPdfLib()) return true;
  var slow = setTimeout(function(){ toast('Preparando o PDF…'); }, 500);
  var ok = await loadPdfLib();
  clearTimeout(slow);
  if (!ok) toast('Não foi possível carregar o gerador de PDF agora. Verifique a internet.');
  return ok;
}
// Baixa o gerador quando o app fica um tempo parado e há internet (só uma vez por abertura).
export function preloadPdfLibWhenIdle(){
  if (hasPdfLib() || jspdfLoading || navigator.onLine === false) return;
  setTimeout(function(){ if (navigator.onLine !== false) loadPdfLib(); }, 8000);
}
