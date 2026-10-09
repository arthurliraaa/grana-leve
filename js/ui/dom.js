// Utilidades de interface: seleção, escape de HTML, ícones, avisos (toast) e arquivos.
import {findById} from '../domain/util.js';

export function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
export function csvCell(s){ s = String(s == null ? '' : s); if (/^[=+\-@]/.test(s)) s = "'" + s; if (/[;"\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"'; return s; }
export function optionsHtml(list, selected){ return list.map(function(o){ return '<option value="'+escapeHtml(o.id)+'"'+(o.id===selected?' selected':'')+'>'+escapeHtml(o.label)+'</option>'; }).join(''); }
export function labelOf(list, id){ var o = findById(list, id); return o ? o.label : ''; }
export function icon(name, cls){ return '<svg class="ico'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#i-'+name+'"/></svg>'; }
export function resolveVar(cssVarExpr, el){
  var m = /var\((--[a-z0-9-]+)\)/.exec(cssVarExpr);
  if (!m) return cssVarExpr;
  return getComputedStyle(el || document.documentElement).getPropertyValue(m[1]).trim();
}
export function qs(sel, root){ return (root||document).querySelector(sel); }
export function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

// Salva um arquivo: usa a capacidade de downloads do Claude quando existe,
// senão cai no download padrão do navegador.
export async function saveFile(filename, data, mimeType){
  if (window.claude && typeof window.claude.use === 'function'){
    var downloads = await window.claude.use('downloads');
    if (downloads){ await downloads.save({filename: filename, data: data}); return; }
  }
  var blob = data instanceof Blob ? data : new Blob([data], {type: mimeType});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

export function toast(msg){
  var wrap = document.getElementById('toastWrap');
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function(){ el.remove(); }, 3200);
}
