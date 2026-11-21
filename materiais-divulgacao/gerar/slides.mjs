// Gera o carrossel (PNG 1080×1350), os fundos das cenas do vídeo e a imagem de pré-visualização do link.
// Tudo a partir de capturas reais do app (gerar/brutas) feitas na conta de demonstração.
import {mkdirSync, readFileSync} from 'node:fs';
import {L} from './util.mjs';

const aqui = new URL('./', import.meta.url).pathname;
const saida = aqui + '../v2/', fundos = aqui + 'fundos/';
mkdirSync(saida, {recursive: true}); mkdirSync(fundos, {recursive: true});
const URL_APP = 'grana-leve.vercel.app';
const img = nome => 'data:image/png;base64,' + readFileSync(aqui + 'brutas/' + nome + '.png').toString('base64');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;overflow:hidden;background:#F7F5EF;font-family:'IBM Plex Sans',Arial,sans-serif;color:#123E35;position:relative}
.blob{position:absolute;border-radius:50%}
.b1{width:620px;height:620px;right:-210px;top:-230px;background:#E1EFE9}
.b2{width:480px;height:480px;left:-190px;bottom:-120px;background:#F3EBD9}
.topo{position:absolute;left:72px;right:72px;top:60px;display:flex;align-items:center;justify-content:space-between}
.marca{display:flex;align-items:center;gap:16px;font:700 34px Outfit,Arial,sans-serif;letter-spacing:-.5px}
.marca b{color:#0E6B5C}
.pag{font:500 22px 'IBM Plex Sans';color:#55736B}
h1{position:absolute;left:72px;right:72px;top:142px;font:700 64px/1.04 Outfit,Arial,sans-serif;letter-spacing:-1.8px}
p.sub{position:absolute;left:72px;right:90px;top:292px;font:400 28px/1.35 'IBM Plex Sans';color:#3F5A53}
.fone{position:absolute;background:#123E35;border-radius:76px;padding:14px;box-shadow:0 40px 80px -30px rgba(18,62,53,.45)}
.tela{position:relative;overflow:hidden;border-radius:62px;background:#FCFCFB}
.tela img{display:block;width:100%}
.chip{position:absolute;background:#0E6B5C;color:#fff;font:600 28px/1.2 Outfit,Arial,sans-serif;padding:18px 26px;border-radius:22px;box-shadow:0 18px 40px -16px rgba(14,107,92,.7);width:276px}
.rodape{position:absolute;left:72px;right:72px;bottom:40px;display:flex;justify-content:space-between;font:600 22px 'IBM Plex Sans';color:#55736B}
.rodape b{color:#0E6B5C}
`;
const logo = `<svg width="52" height="52" viewBox="0 0 48 48"><rect width="48" height="48" rx="15" fill="#0E6B5C"/><path d="M14 33c4-15 13-23 27-25-2 14-10 23-25 27m2-3 14-13" transform="translate(-10 -2) scale(.95)" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
const topo = (n, total) => `<div class="topo"><div class="marca">${logo}<span>grana <b>leve</b></span></div>${n ? `<div class="pag">${n} / ${total}</div>` : ''}</div>`;
const html = corpo => `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body><div class="blob b1"></div><div class="blob b2"></div>${corpo}</body>`;

// Slide com celular. fone: largura da moldura; shift: quanto da captura sobe (esconde o topo do app).
function comCelular({n, total, titulo, sub, nome, shift = 0, chip, rodape = true}){
  const W = 480, tela = W - 28, top = 410, x = (1080 - W) / 2;
  const alturaImg = tela * 1688 / 780;
  return html(`${topo(n, total)}<h1>${titulo}</h1><p class="sub">${sub}</p>
    <div class="fone" style="left:${x}px;top:${top}px;width:${W}px;height:${alturaImg + 28}px"><div class="tela" style="height:${alturaImg}px"><img src="${img(nome)}" style="margin-top:${-shift}px"></div></div>
    ${chip ? `<div class="chip" style="${chip.pos}">${chip.texto}</div>` : ''}
`);
}

const total = 7;
const slides = [
  {titulo: 'Seu dinheiro em ordem, sem planilha e sem susto.', sub: 'Grana Leve: controle financeiro gratuito, nascido de um projeto de extensão universitária.', nome: 'inicio',
    chip: {texto: 'Quanto tenho, quanto gastei e o que vem por aí', pos: 'left:18px;top:1020px;transform:rotate(-3deg)'}},
  {titulo: 'Escreva como você fala.', sub: '“Gastei 32 no mercado e 18 de uber” vira dois lançamentos. Você confere e só então salva.', nome: 'chat', shift: 62,
    chip: {texto: 'Nada é salvo sem a sua confirmação', pos: 'left:786px;top:620px;transform:rotate(3deg)'}},
  {titulo: 'O mês inteiro, de relance.', sub: 'Rosca, pizza ou blocos. Navegue pelos meses, inclusive os que ainda vão chegar.', nome: 'graficos-blocos', shift: 0,
    chip: {texto: '3 jeitos de ver para onde o dinheiro vai', pos: 'left:18px;top:1000px;transform:rotate(-3deg)'}},
  {titulo: 'Planeje por categoria.', sub: 'Defina quanto quer gastar em cada uma e veja, ao longo do mês, o quanto ainda pode.', nome: 'planejar', shift: 0,
    chip: {texto: 'Cada mês guarda o próprio planejamento', pos: 'left:786px;top:640px;transform:rotate(3deg)'}},
  {titulo: 'Cartão sem susto.', sub: 'Veja o que sobra depois de pagar as faturas, com a conta à mostra.', nome: 'cartoes', shift: 0,
    chip: {texto: 'Sobra = contas − faturas', pos: 'left:18px;top:1020px;transform:rotate(-3deg)'}},
  {titulo: 'Metas que rendem de verdade.', sub: 'Diga onde o dinheiro está (CDB, poupança, Tesouro) e veja a previsão com os índices do Banco Central.', nome: 'metas', shift: 0,
    chip: {texto: 'Quanto guardar por mês para chegar no prazo', pos: 'left:786px;top:980px;transform:rotate(3deg)'}}
];

const cta = html(`${topo(7, total)}
  <div style="position:absolute;left:72px;right:72px;top:210px">
    <div style="font:700 24px 'IBM Plex Sans';letter-spacing:3px;color:#0E6B5C">CONVITE</div>
    <h1 style="position:static;font-size:104px;line-height:1;margin-top:22px">Quer testar<br>o Grana Leve?</h1>
    <p class="sub" style="position:static;font-size:34px;margin-top:36px;max-width:820px">É gratuito, funciona no celular e no computador e você instala como app, sem loja.</p>
    <div style="margin-top:64px;display:inline-block;background:#0E6B5C;color:#fff;font:700 58px Outfit,Arial,sans-serif;padding:30px 48px;border-radius:30px;box-shadow:0 26px 50px -22px rgba(14,107,92,.8)">${URL_APP}</div>
    <ul style="margin-top:64px;list-style:none;display:grid;gap:22px;font:500 32px 'IBM Plex Sans';color:#2C4B44">
      <li>✓ Crie a conta com e-mail ou Google e acesse de qualquer aparelho</li>
      <li>✓ Exporte seus dados e apague a conta quando quiser. Sem anúncios</li>
      <li>✓ Me conta o que achou: há um botão “Ajuda e sugestões” dentro do app</li>
    </ul>
  </div>
  <div class="rodape"><span>Projeto de extensão · Engenharia de Software</span><span>pesquisa com 48 pessoas</span></div>`);

// Fundos das cenas do vídeo: texto + moldura do celular (o vídeo da tela entra por cima, no ffmpeg).
function fundoCena({titulo, sub}){
  const W = 440, x = (1080 - W) / 2, top = 420, tela = W - 28;
  return html(`${topo(null)}<h1 style="font-size:68px">${titulo}</h1><p class="sub">${sub}</p>
    <div class="fone" style="left:${x}px;top:${top}px;width:${W}px;height:${tela * 1688 / 780 + 28}px"><div class="tela" style="height:${tela * 1688 / 780}px"></div></div>`);
}
const cenas = {
  chat: {titulo: 'Escreva como você fala.', sub: 'Você confere o que foi entendido e só então salva.'},
  inicio: {titulo: 'O mês inteiro, de relance.', sub: 'Rosca, pizza ou blocos. Mês a mês, inclusive o futuro.'},
  cartoes: {titulo: 'Cartão sem susto.', sub: 'Quanto sobra depois de pagar as faturas, com a conta à mostra.'},
  metas: {titulo: 'Metas que rendem de verdade.', sub: 'Previsão com o rendimento e os índices do Banco Central.'}
};
const abertura = html(`${topo(null)}
  <div style="position:absolute;left:72px;right:72px;top:420px">
    <div style="font:700 24px 'IBM Plex Sans';letter-spacing:3px;color:#0E6B5C">GRANA LEVE</div>
    <h1 style="position:static;font-size:112px;line-height:1.02;margin-top:26px">Anotar gasto não precisa dar ansiedade.</h1>
  </div>`);

const {browser, page} = await L.launch();
await page.setViewport({width: 1080, height: 1350, deviceScaleFactor: 1});
const render = async (conteudo, arquivo, viewport) => {
  if (viewport) await page.setViewport(viewport);
  await page.setContent(conteudo, {waitUntil: 'load', timeout: 60000});
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 10000))]));
  await L.sleep(500);
  await page.screenshot({path: arquivo});
  if (viewport) await page.setViewport({width: 1080, height: 1350, deviceScaleFactor: 1});
};
for (let i = 0; i < slides.length; i++) await render(comCelular({n: i + 1, total, ...slides[i]}), saida + 'carrossel-0' + (i + 1) + '.png');
await render(cta, saida + 'carrossel-07.png');
for (const [nome, c] of Object.entries(cenas)) await render(fundoCena(c), fundos + 'cena-' + nome + '.png');
await render(abertura, fundos + 'cena-abertura.png');
await render(cta.replace(/<div class="pag">.*?<\/div>/, ''), fundos + 'cena-final.png');
await browser.close();
console.log('ok');
