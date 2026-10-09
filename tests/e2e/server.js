// Servidor estático mínimo para os testes E2E (sem dependências).
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml'};

export function startServer(port){
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(ROOT)){ res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
      res.end(body);
    } catch {
      res.writeHead(404); res.end('não encontrado');
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
