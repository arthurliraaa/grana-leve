// Utilidades de interface: seleção, escape de HTML, ícones, avisos (toast) e arquivos.
import {findById} from '../domain/util.js';

export function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
// Célula de CSV (separador ;). Texto que começa com = + - @ (ou tab/CR) ganha um ' na frente para a
// planilha não executar como fórmula; aspas, ; e quebras de linha vão entre aspas.
export function csvCell(s){ s = String(s == null ? '' : s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"'; return s; }
export function optionsHtml(list, selected){ return list.map(function(o){ return '<option value="'+escapeHtml(o.id)+'"'+(o.id===selected?' selected':'')+'>'+escapeHtml(o.label)+'</option>'; }).join(''); }
export function labelOf(list, id){ var o = findById(list, id); return o ? o.label : ''; }
export function icon(name, cls){ return '<svg class="ico'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#i-'+name+'"/></svg>'; }
export function resolveVar(cssVarExpr, el){
  var m = /var\((--[a-z0-9-]+)\)/.exec(cssVarExpr);
  if (!m) return cssVarExpr;
  return getComputedStyle(el || document.documentElement).getPropertyValue(m[1]).trim();
}
// Cor do texto por cima de uma cor de fundo: branco ou tinta escura, o que tiver mais contraste.
export function inkOn(color){
  var hex = /^#([0-9a-f]{6})$/i.exec(String(color).trim()), rgb;
  if (hex) rgb = [0, 2, 4].map(function(i){ return parseInt(hex[1].slice(i, i + 2), 16); });
  else { var m = String(color).match(/\d+(\.\d+)?/g); rgb = m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
  var lum = rgb.map(function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  var L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.057 ? "#ffffff" : "#141414";   // 0,057 = luminância de #141414 + 0,05
}
// Celular (tela estreita ou toque): o teclado NÃO deve abrir sozinho ao abrir um popup ou um campo; a pessoa toca no campo quando quiser.
export function touchLayout(){ return typeof matchMedia === 'function' && matchMedia('(max-width: 620px), (pointer: coarse)').matches; }
// Foco automático (ninguém tocou no campo): só no computador. No celular não faz nada.
export function autoFocus(el){ if (el && !touchLayout()) el.focus(); }
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

// Aviso com uma ação (ex.: “Desfazer”). Fica mais tempo na tela e aceita toque.
export function toastAction(msg, label, fn){
  var wrap = document.getElementById('toastWrap');
  var el = document.createElement('div');
  el.className = 'toast toast-action';
  var span = document.createElement('span'); span.textContent = msg;
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'toast-btn'; btn.textContent = label;
  btn.addEventListener('click', function(){ el.remove(); fn(); });
  el.appendChild(span); el.appendChild(btn);
  wrap.appendChild(el);
  setTimeout(function(){ el.remove(); }, 7000);
  return el;
}
export function toast(msg){
  var wrap = document.getElementById('toastWrap');
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function(){ el.remove(); }, 3200);
}
