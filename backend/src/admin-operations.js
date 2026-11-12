import { requireRoles } from './auth.js';
import { audit } from './foundation.js';

export function registerAdminOperationsRoutes({ request, response, database, sendJson }) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const path = url.pathname;
  if (!path.startsWith('/api/admin/operations/')) return false;

  const actor = requireRoles(request, database, ['admin', 'operator', 'support', 'driver']);
  if (!actor) return forbidden(response, sendJson);

  if (request.method === 'GET' && path === '/api/admin/operations/orders') {
    const status = url.searchParams.get('status') || '';
    const orders = database.prepare(`
      SELECT orders.id, orders.user_id AS userId, users.email, users.display_name AS customerName,
             orders.status, orders.total_cents AS totalCents, orders.delivery_address AS deliveryAddress,
             orders.created_at AS createdAt, orders.updated_at AS updatedAt
      FROM orders JOIN users ON users.id = orders.user_id
      WHERE (? = '' OR orders.status = ?) ORDER BY orders.created_at DESC
    `).all(status, status);
    sendJson(response, 200, { data: orders });
    return true;
  }

  const orderMatch = path.match(/^\/api\/admin\/operations\/orders\/([^/]+)\/status$/);
  if (request.method === 'POST' && orderMatch) {
    return readJson(request).then((body) => updateOrderStatus({ id: orderMatch[1], status: body.status, actor, database, response, sendJson }));
  }

  if (request.method === 'GET' && path === '/api/admin/operations/travel') {
    const rows = database.prepare(`
      SELECT travel_requests.id, travel_requests.user_id AS userId, users.display_name AS customerName,
             travel_requests.pickup, travel_requests.destination, travel_requests.status,
             travel_requests.duration_minutes AS durationMinutes, travel_requests.fare_cents AS fareCents,
             travel_requests.created_at AS createdAt
      FROM travel_requests JOIN users ON users.id = travel_requests.user_id ORDER BY travel_requests.created_at DESC
    `).all();
    sendJson(response, 200, { data: rows });
    return true;
  }

  const travelMatch = path.match(/^\/api\/admin\/operations\/travel\/([^/]+)\/status$/);
  if (request.method === 'POST' && travelMatch) {
    return readJson(request).then((body) => updateTravelStatus({ id: travelMatch[1], status: body.status, actor, database, response, sendJson }));
  }

  if (request.method === 'GET' && path === '/api/admin/operations/support') {
    const rows = database.prepare(`
      SELECT support_threads.id, support_threads.user_id AS userId, users.display_name AS customerName,
             support_threads.subject, support_threads.status, support_threads.created_at AS createdAt
      FROM support_threads JOIN users ON users.id = support_threads.user_id ORDER BY support_threads.created_at DESC
    `).all();
    sendJson(response, 200, { data: rows });
    return true;
  }

  const supportMatch = path.match(/^\/api\/admin\/operations\/support\/([^/]+)\/messages$/);
  if (request.method === 'POST' && supportMatch) {
    return readJson(request).then((body) => replySupport({ threadId: supportMatch[1], message: body.message, actor, database, response, sendJson }));
  }

  if (request.method === 'GET' && path === '/api/admin/operations/payments') {
    const rows = database.prepare(`
      SELECT payments.id, payments.user_id AS userId, users.display_name AS customerName,
             payments.order_id AS orderId, payments.method, payments.status,
             payments.amount_cents AS amountCents, payments.reference, payments.created_at AS createdAt
      FROM payments JOIN users ON users.id = payments.user_id ORDER BY payments.created_at DESC
    `).all();
    sendJson(response, 200, { data: rows });
    return true;
  }

  if (request.method === 'GET' && path === '/api/admin/operations/customers') {
    const rows = database.prepare(`
      SELECT users.id, users.email, users.display_name AS displayName, profiles.phone,
             users.created_at AS createdAt
      FROM users LEFT JOIN profiles ON profiles.user_id = users.id
      ORDER BY users.created_at DESC
    `).all();
    sendJson(response, 200, { data: rows });
    return true;
  }

  sendJson(response, 404, error('NOT_FOUND', 'Admin operations route not found'));
  return true;
}

function updateOrderStatus({ id, status, actor, database, response, sendJson }) {
  const allowed = ['placed', 'preparing', 'ready', 'on_the_way', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return sendJson(response, 400, error('INVALID_INPUT', 'Invalid order status'));
  const order = database.prepare('SELECT id, status FROM orders WHERE id = ?').get(id);
  if (!order) return notFound(response, sendJson, 'ORDER_NOT_FOUND', 'Order not found');
  const transitions = { placed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['on_the_way', 'cancelled'], on_the_way: ['completed'], completed: [], cancelled: [] };
  if (!transitions[order.status]?.includes(status)) return sendJson(response, 409, error('INVALID_ORDER_TRANSITION', `Cannot change order from ${order.status} to ${status}`));
  database.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  audit(database, { actorUserId: actor.id, action: 'operations.order.status', resourceType: 'order', resourceId: id, metadata: { from: order.status, to: status } });
  sendJson(response, 200, { data: database.prepare('SELECT id, status, total_cents AS totalCents, updated_at AS updatedAt FROM orders WHERE id = ?').get(id) });
}

function updateTravelStatus({ id, status, actor, database, response, sendJson }) {
  const allowed = ['requested', 'matched', 'in_progress', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return sendJson(response, 400, error('INVALID_INPUT', 'Invalid travel status'));
  const travel = database.prepare('SELECT id, status FROM travel_requests WHERE id = ?').get(id);
  if (!travel) return notFound(response, sendJson, 'TRAVEL_NOT_FOUND', 'Travel request not found');
  database.prepare('UPDATE travel_requests SET status = ? WHERE id = ?').run(status, id);
  audit(database, { actorUserId: actor.id, action: 'operations.travel.status', resourceType: 'travel_request', resourceId: id, metadata: { from: travel.status, to: status } });
  sendJson(response, 200, { data: database.prepare('SELECT id, pickup, destination, status, duration_minutes AS durationMinutes, fare_cents AS fareCents FROM travel_requests WHERE id = ?').get(id) });
}

function replySupport({ threadId, message, actor, database, response, sendJson }) {
  if (!validText(message)) return sendJson(response, 400, error('INVALID_INPUT', 'message is required'));
  const thread = database.prepare('SELECT id FROM support_threads WHERE id = ?').get(threadId);
  if (!thread) return notFound(response, sendJson, 'THREAD_NOT_FOUND', 'Support thread not found');
  const id = `message_${cryptoRandomId()}`;
  const timestamp = now();
  database.prepare("INSERT INTO support_messages (id, thread_id, sender, message, created_at) VALUES (?, ?, 'support', ?, ?)").run(id, threadId, message.trim(), timestamp);
  audit(database, { actorUserId: actor.id, action: 'operations.support.reply', resourceType: 'support_thread', resourceId: threadId });
  sendJson(response, 201, { data: { id, threadId, sender: 'support', message: message.trim(), createdAt: timestamp } });
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 2000;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let text = '';
    request.on('data', (chunk) => {
      text += chunk;
      if (text.length > 1024 * 1024) reject(new Error('Request body too large'));
    });
    request.on('end', () => {
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function forbidden(response, sendJson) {
  sendJson(response, 403, error('FORBIDDEN', 'An admin operation role is required'));
  return true;
}

function notFound(response, sendJson, code, message) {
  sendJson(response, 404, error(code, message));
  return true;
}

function error(code, message) {
  return { error: { code, message } };
}

function now() {
  return new Date().toISOString();
}
