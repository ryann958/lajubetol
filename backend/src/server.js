import http from 'node:http';
import { databaseSummary, openDatabase } from './db.js';
import { registerAuthRoutes } from './auth.js';
import { registerApiRoutes } from './api.js';
import { registerFoundationRoutes } from './foundation.js';
import { registerAdminCatalogRoutes } from './admin-catalog.js';
import { registerAdminOperationsRoutes } from './admin-operations.js';

const port = Number(process.env.PORT || 3000);
const database = openDatabase();

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  });
  response.end(JSON.stringify(body));
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    });
    response.end();
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  const handledByAuth = registerAuthRoutes({ request, response, database, sendJson });
  if (handledByAuth instanceof Promise) {
    handledByAuth.catch(() => sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Invalid request body' } }));
    return;
  }
  if (handledByAuth) return;

  const handledByFoundation = registerFoundationRoutes({ request, response, database, sendJson });
  if (handledByFoundation) return;

  const handledByAdminCatalog = registerAdminCatalogRoutes({ request, response, database, sendJson });
  if (handledByAdminCatalog instanceof Promise) {
    handledByAdminCatalog.catch(() => sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Invalid request body' } }));
    return;
  }
  if (handledByAdminCatalog) return;

  const handledByAdminOperations = registerAdminOperationsRoutes({ request, response, database, sendJson });
  if (handledByAdminOperations instanceof Promise) {
    handledByAdminOperations.catch(() => sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Invalid request body' } }));
    return;
  }
  if (handledByAdminOperations) return;

  const handledByApi = registerApiRoutes({ request, response, database, sendJson });
  if (handledByApi instanceof Promise) {
    handledByApi.catch(() => sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Invalid request body' } }));
    return;
  }
  if (handledByApi) return;

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'laju_betol-mvp-backend',
      version: '1.0.0',
      database: databaseSummary(database),
      time: new Date().toISOString(),
    });
    return;
  }

  sendJson(response, 404, {
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Laju Betol backend listening at http://127.0.0.1:${port}`);
});

function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
