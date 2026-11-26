// A tiny static server for local play-testing: serves game/ on port 8080 and
// nothing else. Node 22, standard library only.
//
//   node serve.ts
//   open http://localhost:8080

import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('game', import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  const stream = createReadStream(file);
  stream.on('open', () => {
    response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    stream.pipe(response);
  });
  stream.on('error', () => {
    response.writeHead(404);
    response.end('Not found');
  });
});

server.listen(port, () => {
  console.log(`Kestrel Run on http://localhost:${port}`);
});
