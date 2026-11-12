import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.ADMIN_WEB_PORT || 4173);
const modulePath = new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:');
const root = path.resolve(path.dirname(modulePath), '..');

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
  const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.join(root, filename);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const contentType = filePath.endsWith('.css') ? 'text/css; charset=utf-8' : filePath.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': contentType });
  response.end(fs.readFileSync(filePath));
});

server.listen(port, '127.0.0.1', () => console.log(`Laju Betol admin web at http://127.0.0.1:${port}`));

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
