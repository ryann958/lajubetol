import crypto from 'node:crypto';
import { requireRoles } from './auth.js';

export function registerFoundationRoutes({ request, response, database, sendJson }) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/admin/me') {
    const user = requireRoles(request, database, ['admin', 'operator', 'merchant', 'driver', 'support']);
    if (!user) return unauthorized(response, sendJson);
    sendJson(response, 200, { data: user });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/dashboard') {
    const user = requireRoles(request, database, ['admin', 'operator', 'merchant', 'driver', 'support']);
    if (!user) return unauthorized(response, sendJson);
    const counts = {
      users: database.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      merchants: database.prepare('SELECT COUNT(*) AS count FROM merchants').get().count,
      products: database.prepare('SELECT COUNT(*) AS count FROM products').get().count,
      openOrders: database.prepare("SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('completed', 'cancelled')").get().count,
      openSupportThreads: database.prepare("SELECT COUNT(*) AS count FROM support_threads WHERE status = 'open'").get().count,
      pendingPayments: database.prepare("SELECT COUNT(*) AS count FROM payments WHERE status = 'pending'").get().count,
    };
    sendJson(response, 200, { data: { actor: user, counts } });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/audit-logs') {
    const user = requireRoles(request, database, ['admin']);
    if (!user) return unauthorized(response, sendJson);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
    const logs = database.prepare(`
      SELECT id, actor_user_id AS actorUserId, action, resource_type AS resourceType,
             resource_id AS resourceId, outcome, metadata_json AS metadataJson, created_at AS createdAt
      FROM audit_logs ORDER BY created_at DESC LIMIT ?
    `).all(limit);
    sendJson(response, 200, { data: logs });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/roles') {
    const user = requireRoles(request, database, ['admin']);
    if (!user) return unauthorized(response, sendJson);
    const roles = database.prepare('SELECT id, name, description FROM roles ORDER BY name').all();
    sendJson(response, 200, { data: roles });
    return true;
  }

  return false;
}

export function audit(database, { actorUserId, action, resourceType, resourceId = null, outcome = 'success', metadata = {} }) {
  database.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id, outcome, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`audit_${crypto.randomUUID()}`, actorUserId, action, resourceType, resourceId, outcome, JSON.stringify(metadata), new Date().toISOString());
}

function unauthorized(response, sendJson) {
  sendJson(response, 403, { error: { code: 'FORBIDDEN', message: 'An admin role is required' } });
  return true;
}
