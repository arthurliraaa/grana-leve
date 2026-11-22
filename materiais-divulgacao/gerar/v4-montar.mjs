// Junta os fundos e as gravações de tela no vídeo das novidades (4:5, 1080×1350, sem áudio).
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const aqui = new URL('./', import.meta.url).pathname;
const saida = aqui + '../v4/', tmp = aqui + 'tmp-v4/';
mkdirSync(tmp, {recursive: true});
const ff = args => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'}); if (r.status) throw new Error(r.stderr); return r; };
const duracao = arq => { const r = spawnSync('ffmpeg', ['-i', arq, '-f', 'null', '-'], {encoding: 'utf8'}); const m = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop(); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
const FPS = 30, FADE = 0.4;

// Cena fixa (abertura e encerramento): só a imagem, parada, com o tempo dado.
const fixa = (nome, seg) => { ff(['-loop', '1', '-framerate', FPS, '-t', seg, '-i', aqui + 'fundos-v4/cena-' + nome + '.png', '-vf', 'format=yuv420p', '-r', FPS, '-c:v', 'libopenh264', '-b:v', '14M', tmp + nome + '.mp4']); return seg; };
// Cena com tela: grava na moldura do celular (cantos arredondados) e acelera um pouco.
const R = 60, X = 334, Y = 434, LARG = 412, ALT = 891;
const comTela = (nome, vel) => {
  const d = duracao(aqui + 'clipes-v4/' + nome + '.mp4') / vel;
  const mascara = `if(lt(hypot(max(abs(X-W/2)-(W/2-${R}),0),max(abs(Y-H/2)-(H/2-${R}),0)),${R}),255,0)`;
  ff(['-loop', '1', '-framerate', FPS, '-t', d, '-i', aqui + 'fundos-v4/cena-' + nome + '.png', '-i', aqui + 'clipes-v4/' + nome + '.mp4', '-filter_complex',
    `[1:v]setpts=PTS/${vel},fps=${FPS},scale=${LARG}:${ALT}:flags=lanczos,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${mascara}'[t];[0:v][t]overlay=${X}:${Y}:shortest=1,format=yuv420p[v]`,
    '-map', '[v]', '-t', d, '-r', FPS, '-c:v', 'libopenh264', '-b:v', '14M', tmp + nome + '.mp4']);
  return d;
};
const cenas = [['abertura', fixa('abertura', 3.2)], ['grana', comTela('grana', 1.45)], ['importar', comTela('importar', 1.4)], ['salario', comTela('salario', 1.55)], ['caiu', comTela('caiu', 1.4)], ['empregos', comTela('empregos', 1.5)], ['cantinho', comTela('cantinho', 1.45)], ['final', fixa('final', 5)]];
// Encadeia com dissolvência curta.
const entradas = cenas.flatMap(([n]) => ['-i', tmp + n + '.mp4']);
let filtro = '', anterior = '[0:v]', acumulado = cenas[0][1];
for (let i = 1; i < cenas.length; i++){
  const off = (acumulado - FADE).toFixed(3), saidaNome = i === cenas.length - 1 ? '[v]' : `[x${i}]`;
  filtro += `${anterior}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${off}${saidaNome};`;
  anterior = saidaNome; acumulado += cenas[i][1] - FADE;
}
ff([...entradas, '-filter_complex', filtro.slice(0, -1), '-map', '[v]', '-r', FPS, '-c:v', 'libopenh264', '-b:v', '9M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', saida + 'video-grana-leve-novidades.mp4']);
console.log('vídeo pronto: ' + acumulado.toFixed(1) + ' s');
