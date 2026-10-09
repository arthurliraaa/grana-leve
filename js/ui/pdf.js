// Geração de PDF (jsPDF, carregado do CDN) e visualização dentro do app.
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
  await openModal({
    title: title, wide: true, submitLabel: null, cancelLabel: 'Fechar',
    body: '<iframe class="pdf-frame" src="' + url + '" title="' + escapeHtml(title) + '"></iframe>' +
      '<p class="field-hint">Se a pré-visualização não aparecer (comum no celular), use os botões abaixo.</p>' +
      '<div class="pdf-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-pdf="download">Baixar PDF</button>' +
        (canShare ? '<button type="button" class="btn btn-ghost btn-sm" data-pdf="share">Compartilhar</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-pdf="open">Abrir em nova aba</button>' +
      '</div>',
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
export function pdfReady(){
  if (!window.jspdf || !window.jspdf.jsPDF){ toast('Não foi possível carregar o gerador de PDF agora. Verifique a internet.'); return false; }
  return true;
}
