import crypto from 'node:crypto';
import { authenticate } from './auth.js';

const orderTransitions = {
  draft: ['placed', 'cancelled'],
  placed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['on_the_way', 'cancelled'],
  on_the_way: ['completed'],
  completed: [],
  cancelled: [],
};

export function registerApiRoutes({ request, response, database, sendJson }) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/catalog/merchants') {
    const query = url.searchParams.get('query')?.trim() || '';
    const category = url.searchParams.get('category')?.trim() || '';
    const rows = database.prepare(`
      SELECT id, name, description, category, is_open AS isOpen
      FROM merchants
      WHERE (? = '' OR LOWER(name) LIKE '%' || LOWER(?) || '%' OR LOWER(description) LIKE '%' || LOWER(?) || '%')
        AND (? = '' OR LOWER(category) = LOWER(?))
      ORDER BY name
    `).all(query, query, query, category, category);
    sendJson(response, 200, { data: rows });
    return true;
  }

  const merchantMatch = path.match(/^\/api\/catalog\/merchants\/([^/]+)$/);
  if (request.method === 'GET' && merchantMatch) {
    const merchant = database.prepare('SELECT id, name, description, category, is_open AS isOpen FROM merchants WHERE id = ?').get(merchantMatch[1]);
    if (!merchant) return notFound(response, sendJson, 'MERCHANT_NOT_FOUND', 'Merchant not found');
    const products = database.prepare(`
      SELECT id, name, description, price_cents AS priceCents, is_available AS isAvailable
      FROM products WHERE merchant_id = ? ORDER BY name
    `).all(merchant.id);
    sendJson(response, 200, { data: { ...merchant, products } });
    return true;
  }

  if (request.method === 'GET' && path === '/api/catalog/products') {
    const merchantId = url.searchParams.get('merchantId') || '';
    const query = url.searchParams.get('query')?.trim() || '';
    const rows = database.prepare(`
      SELECT products.id, products.merchant_id AS merchantId, products.name, products.description,
             products.price_cents AS priceCents, products.is_available AS isAvailable,
             merchants.name AS merchantName
      FROM products JOIN merchants ON merchants.id = products.merchant_id
      WHERE (? = '' OR products.merchant_id = ?)
        AND (? = '' OR LOWER(products.name) LIKE '%' || LOWER(?) || '%' OR LOWER(products.description) LIKE '%' || LOWER(?) || '%')
      ORDER BY products.name
    `).all(merchantId, merchantId, query, query, query);
    sendJson(response, 200, { data: rows });
    return true;
  }

  if (path.startsWith('/api/')) {
    const user = authenticate(request, database);
    if (!user) {
      sendJson(response, 401, error('UNAUTHENTICATED', 'A valid Bearer token is required'));
      return true;
    }

    if (request.method === 'GET' && path === '/api/profile') {
      const profile = database.prepare(`
        SELECT users.id, users.email, users.display_name AS displayName,
               profiles.phone, profiles.avatar_url AS avatarUrl
        FROM users JOIN profiles ON profiles.user_id = users.id WHERE users.id = ?
      `).get(user.id);
      sendJson(response, 200, { data: profile });
      return true;
    }

    if (request.method === 'PATCH' && path === '/api/profile') {
      return readJson(request).then((body) => {
        const phone = optionalString(body.phone);
        const displayName = optionalString(body.displayName);
        if (body.phone !== undefined && phone === null) return sendJson(response, 400, error('INVALID_INPUT', 'phone must be a string or null'));
        if (body.displayName !== undefined && !displayName) return sendJson(response, 400, error('INVALID_INPUT', 'displayName must not be empty'));
        const timestamp = now();
        database.exec('BEGIN');
        try {
          if (displayName !== undefined) database.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, user.id);
          if (body.phone !== undefined) database.prepare('UPDATE profiles SET phone = ?, updated_at = ? WHERE user_id = ?').run(phone, timestamp, user.id);
          database.exec('COMMIT');
        } catch (cause) {
          database.exec('ROLLBACK');
          throw cause;
        }
        const profile = database.prepare(`
          SELECT users.id, users.email, users.display_name AS displayName, profiles.phone, profiles.avatar_url AS avatarUrl
          FROM users JOIN profiles ON profiles.user_id = users.id WHERE users.id = ?
        `).get(user.id);
        sendJson(response, 200, { data: profile });
      });
    }

    if (request.method === 'GET' && path === '/api/profile/permissions') {
      const rows = database.prepare(`SELECT permission, state, updated_at AS updatedAt FROM permission_states WHERE user_id = ? ORDER BY permission`).all(user.id);
      sendJson(response, 200, { data: rows });
      return true;
    }

    if (request.method === 'PUT' && path === '/api/profile/permissions') {
      return readJson(request).then((body) => {
        const allowed = new Set(['location', 'camera', 'microphone', 'bluetooth', 'notifications']);
        if (!allowed.has(body.permission) || !['unknown', 'allowed', 'denied'].includes(body.state)) {
          sendJson(response, 400, error('INVALID_INPUT', 'permission or state is invalid'));
          return;
        }
        database.prepare(`
          INSERT INTO permission_states (user_id, permission, state, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, permission) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
        `).run(user.id, body.permission, body.state, now());
        sendJson(response, 200, { data: { permission: body.permission, state: body.state } });
      });
    }

    const orderPath = path.match(/^\/api\/orders(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (orderPath && request.method === 'GET') {
      if (!orderPath[1]) {
        const orders = database.prepare(`SELECT id, status, total_cents AS totalCents, delivery_address AS deliveryAddress, created_at AS createdAt, updated_at AS updatedAt FROM orders WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
        sendJson(response, 200, { data: orders });
        return true;
      }
      const order = getOrder(database, user.id, orderPath[1]);
      if (!order) return notFound(response, sendJson, 'ORDER_NOT_FOUND', 'Order not found');
      sendJson(response, 200, { data: order });
      return true;
    }

    if (request.method === 'POST' && path === '/api/orders') {
      return readJson(request).then((body) => createOrder({ body, user, database, response, sendJson }));
    }

    if (request.method === 'POST' && orderPath && orderPath[1] && orderPath[2] === 'status') {
      return readJson(request).then((body) => updateOrderStatus({ orderId: orderPath[1], body, user, database, response, sendJson }));
    }

    if (request.method === 'POST' && orderPath && orderPath[1] && orderPath[2] === 'cancel') {
      return updateOrderStatus({ orderId: orderPath[1], body: { status: 'cancelled' }, user, database, response, sendJson });
    }

    const travelPath = path.match(/^\/api\/travel\/requests(?:\/([^/]+))?(?:\/(status))?$/);
    if (request.method === 'GET' && travelPath) {
      if (!travelPath[1]) {
        const requests = database.prepare(`SELECT id, pickup, destination, status, duration_minutes AS durationMinutes, fare_cents AS fareCents, created_at AS createdAt FROM travel_requests WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
        sendJson(response, 200, { data: requests });
        return true;
      }
      const travel = database.prepare(`SELECT id, pickup, destination, status, duration_minutes AS durationMinutes, fare_cents AS fareCents, created_at AS createdAt FROM travel_requests WHERE id = ? AND user_id = ?`).get(travelPath[1], user.id);
      if (!travel) return notFound(response, sendJson, 'TRAVEL_NOT_FOUND', 'Travel request not found');
      sendJson(response, 200, { data: travel });
      return true;
    }

    if (request.method === 'POST' && path === '/api/travel/quote') {
      return readJson(request).then((body) => travelQuote({ body, response, sendJson }));
    }

    if (request.method === 'POST' && path === '/api/travel/requests') {
      return readJson(request).then((body) => createTravel({ body, user, database, response, sendJson }));
    }

    if (request.method === 'POST' && travelPath && travelPath[1] && path.endsWith('/status')) {
      return readJson(request).then((body) => updateTravel({ body, id: travelPath[1], user, database, response, sendJson }));
    }

    if (request.method === 'GET' && path === '/api/support/threads') {
      const threads = database.prepare(`SELECT id, subject, status, created_at AS createdAt FROM support_threads WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
      sendJson(response, 200, { data: threads });
      return true;
    }

    const threadMatch = path.match(/^\/api\/support\/threads\/([^/]+)(?:\/messages)?$/);
    if (threadMatch && request.method === 'GET') {
      const thread = database.prepare('SELECT id, subject, status, created_at AS createdAt FROM support_threads WHERE id = ? AND user_id = ?').get(threadMatch[1], user.id);
      if (!thread) return notFound(response, sendJson, 'THREAD_NOT_FOUND', 'Support thread not found');
      const messages = database.prepare(`SELECT id, sender, message, created_at AS createdAt FROM support_messages WHERE thread_id = ? ORDER BY created_at`).all(thread.id);
      sendJson(response, 200, { data: { ...thread, messages } });
      return true;
    }

    if (request.method === 'POST' && path === '/api/support/threads') {
      return readJson(request).then((body) => createThread({ body, user, database, response, sendJson }));
    }

    const messageMatch = path.match(/^\/api\/support\/threads\/([^/]+)\/messages$/);
    if (request.method === 'POST' && messageMatch) {
      return readJson(request).then((body) => createMessage({ body, threadId: messageMatch[1], user, database, response, sendJson }));
    }

    if (request.method === 'GET' && path === '/api/payments') {
      const payments = database.prepare(`SELECT id, order_id AS orderId, method, status, amount_cents AS amountCents, reference, created_at AS createdAt FROM payments WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
      sendJson(response, 200, { data: payments });
      return true;
    }

    const paymentMatch = path.match(/^\/api\/payments(?:\/([^/]+)\/pay)?$/);
    if (request.method === 'POST' && path === '/api/payments') {
      return readJson(request).then((body) => createPayment({ body, user, database, response, sendJson }));
    }
    if (request.method === 'POST' && paymentMatch?.[1]) {
      const payment = database.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(paymentMatch[1], user.id);
      if (!payment) return notFound(response, sendJson, 'PAYMENT_NOT_FOUND', 'Payment not found');
      database.prepare('UPDATE payments SET status = ? WHERE id = ?').run('paid', payment.id);
      sendJson(response, 200, { data: { ...payment, status: 'paid' } });
      return true;
    }
  }

  return false;
}

function createOrder({ body, user, database, response, sendJson }) {
  if (!Array.isArray(body.items) || body.items.length === 0 || typeof body.deliveryAddress !== 'string' || !body.deliveryAddress.trim()) {
    sendJson(response, 400, error('INVALID_INPUT', 'items and deliveryAddress are required'));
    return;
  }
  const ids = body.items.map((item) => item?.productId);
  if (ids.some((id) => typeof id !== 'string') || body.items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    sendJson(response, 400, error('INVALID_INPUT', 'Each item needs a productId and positive integer quantity'));
    return;
  }
  const products = ids.map((id) => database.prepare('SELECT id, price_cents AS priceCents FROM products WHERE id = ? AND is_available = 1').get(id));
  if (products.some((product) => !product)) {
    sendJson(response, 400, error('PRODUCT_UNAVAILABLE', 'One or more products are unavailable'));
    return;
  }
  const productMap = new Map(products.map((product) => [product.id, product]));
  const totalCents = body.items.reduce((sum, item) => sum + productMap.get(item.productId).priceCents * item.quantity, 0);
  const orderId = `order_${crypto.randomUUID()}`;
  const timestamp = now();
  database.exec('BEGIN');
  try {
    database.prepare(`INSERT INTO orders (id, user_id, status, total_cents, delivery_address, created_at, updated_at) VALUES (?, ?, 'placed', ?, ?, ?, ?)`).run(orderId, user.id, totalCents, body.deliveryAddress.trim(), timestamp, timestamp);
    const insertItem = database.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)');
    for (const item of body.items) insertItem.run(orderId, item.productId, item.quantity, productMap.get(item.productId).priceCents);
    database.exec('COMMIT');
  } catch (cause) {
    database.exec('ROLLBACK');
    throw cause;
  }
  sendJson(response, 201, { data: getOrder(database, user.id, orderId) });
}

function updateOrderStatus({ orderId, body, user, database, response, sendJson }) {
  const order = getOrder(database, user.id, orderId);
  if (!order) return notFound(response, sendJson, 'ORDER_NOT_FOUND', 'Order not found');
  if (!orderTransitions[order.status]?.includes(body.status)) {
    sendJson(response, 409, error('INVALID_ORDER_TRANSITION', `Cannot change order from ${order.status} to ${body.status}`));
    return;
  }
  database.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(body.status, now(), orderId, user.id);
  sendJson(response, 200, { data: getOrder(database, user.id, orderId) });
}

function getOrder(database, userId, id) {
  const order = database.prepare(`SELECT id, status, total_cents AS totalCents, delivery_address AS deliveryAddress, created_at AS createdAt, updated_at AS updatedAt FROM orders WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!order) return null;
  const items = database.prepare(`SELECT order_items.product_id AS productId, products.name, order_items.quantity, order_items.unit_price_cents AS unitPriceCents FROM order_items JOIN products ON products.id = order_items.product_id WHERE order_id = ?`).all(id);
  return { ...order, items };
}

function travelQuote({ body, response, sendJson }) {
  if (!validPlace(body.pickup) || !validPlace(body.destination)) {
    sendJson(response, 400, error('INVALID_INPUT', 'pickup and destination are required'));
    return;
  }
  sendJson(response, 200, { data: { pickup: body.pickup.trim(), destination: body.destination.trim(), durationMinutes: 18, fareCents: 240 } });
}

function createTravel({ body, user, database, response, sendJson }) {
  if (!validPlace(body.pickup) || !validPlace(body.destination)) {
    sendJson(response, 400, error('INVALID_INPUT', 'pickup and destination are required'));
    return;
  }
  const id = `travel_${crypto.randomUUID()}`;
  database.prepare(`INSERT INTO travel_requests (id, user_id, pickup, destination, status, duration_minutes, fare_cents, created_at) VALUES (?, ?, ?, ?, 'requested', 18, 240, ?)`).run(id, user.id, body.pickup.trim(), body.destination.trim(), now());
  const travel = database.prepare(`SELECT id, pickup, destination, status, duration_minutes AS durationMinutes, fare_cents AS fareCents, created_at AS createdAt FROM travel_requests WHERE id = ?`).get(id);
  sendJson(response, 201, { data: travel });
}

function updateTravel({ body, id, user, database, response, sendJson }) {
  const allowed = ['requested', 'matched', 'in_progress', 'completed', 'cancelled'];
  if (!allowed.includes(body.status)) {
    sendJson(response, 400, error('INVALID_INPUT', 'Invalid travel status'));
    return;
  }
  const result = database.prepare('UPDATE travel_requests SET status = ? WHERE id = ? AND user_id = ?').run(body.status, id, user.id);
  if (!result.changes) return notFound(response, sendJson, 'TRAVEL_NOT_FOUND', 'Travel request not found');
  const travel = database.prepare(`SELECT id, pickup, destination, status, duration_minutes AS durationMinutes, fare_cents AS fareCents, created_at AS createdAt FROM travel_requests WHERE id = ?`).get(id);
  sendJson(response, 200, { data: travel });
}

function createThread({ body, user, database, response, sendJson }) {
  if (!validPlace(body.subject)) {
    sendJson(response, 400, error('INVALID_INPUT', 'subject is required'));
    return;
  }
  const id = `thread_${crypto.randomUUID()}`;
  const timestamp = now();
  database.prepare('INSERT INTO support_threads (id, user_id, subject, status, created_at) VALUES (?, ?, ?, \'open\', ?)').run(id, user.id, body.subject.trim(), timestamp);
  if (validPlace(body.message)) database.prepare('INSERT INTO support_messages (id, thread_id, sender, message, created_at) VALUES (?, ?, \'user\', ?, ?)').run(`message_${crypto.randomUUID()}`, id, body.message.trim(), timestamp);
  sendJson(response, 201, { data: database.prepare('SELECT id, subject, status, created_at AS createdAt FROM support_threads WHERE id = ?').get(id) });
}

function createMessage({ body, threadId, user, database, response, sendJson }) {
  if (!validPlace(body.message)) {
    sendJson(response, 400, error('INVALID_INPUT', 'message is required'));
    return;
  }
  const thread = database.prepare('SELECT id FROM support_threads WHERE id = ? AND user_id = ?').get(threadId, user.id);
  if (!thread) return notFound(response, sendJson, 'THREAD_NOT_FOUND', 'Support thread not found');
  const timestamp = now();
  const id = `message_${crypto.randomUUID()}`;
  database.prepare('INSERT INTO support_messages (id, thread_id, sender, message, created_at) VALUES (?, ?, \'user\', ?, ?)').run(id, threadId, body.message.trim(), timestamp);
  sendJson(response, 201, { data: { id, threadId, sender: 'user', message: body.message.trim(), createdAt: timestamp } });
}

function createPayment({ body, user, database, response, sendJson }) {
  if (!['qris', 'mock_card', 'cash'].includes(body.method) || !Number.isInteger(body.amountCents) || body.amountCents <= 0) {
    sendJson(response, 400, error('INVALID_INPUT', 'method and positive amountCents are required'));
    return;
  }
  if (body.orderId) {
    const order = database.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(body.orderId, user.id);
    if (!order) return notFound(response, sendJson, 'ORDER_NOT_FOUND', 'Order not found');
  }
  const id = `payment_${crypto.randomUUID()}`;
  const reference = `LB-${Date.now()}`;
  database.prepare(`INSERT INTO payments (id, user_id, order_id, method, status, amount_cents, reference, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`).run(id, user.id, body.orderId || null, body.method, body.amountCents, reference, now());
  sendJson(response, 201, { data: database.prepare(`SELECT id, order_id AS orderId, method, status, amount_cents AS amountCents, reference, created_at AS createdAt FROM payments WHERE id = ?`).get(id) });
}

function validPlace(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500;
}

function optionalString(value) {
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() : undefined;
}

function notFound(response, sendJson, code, message) {
  sendJson(response, 404, error(code, message));
  return true;
}

function error(code, message) {
  return { error: { code, message } };
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

function now() {
  return new Date().toISOString();
}
