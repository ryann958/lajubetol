import crypto from 'node:crypto';
import { requireRoles } from './auth.js';
import { audit } from './foundation.js';

const catalogRoles = ['admin', 'operator'];

export function registerAdminCatalogRoutes({ request, response, database, sendJson }) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const path = url.pathname;
  if (!path.startsWith('/api/admin/catalog/')) return false;

  const actor = requireRoles(request, database, catalogRoles);
  if (!actor) return forbidden(response, sendJson);

  if (request.method === 'GET' && path === '/api/admin/catalog/merchants') {
    const rows = database.prepare(`
      SELECT id, name, description, category, is_open AS isOpen, created_at AS createdAt
      FROM merchants ORDER BY name
    `).all();
    sendJson(response, 200, { data: rows });
    return true;
  }

  const merchantMatch = path.match(/^\/api\/admin\/catalog\/merchants\/([^/]+)$/);
  if (merchantMatch && request.method === 'POST') {
    return readJson(request).then((body) => createMerchant({ body, actor, database, response, sendJson }));
  }
  if (merchantMatch && request.method === 'PATCH') {
    return readJson(request).then((body) => updateMerchant({ id: merchantMatch[1], body, actor, database, response, sendJson }));
  }
  if (merchantMatch && request.method === 'DELETE') {
    return archiveMerchant({ id: merchantMatch[1], actor, database, response, sendJson });
  }

  if (request.method === 'GET' && path === '/api/admin/catalog/products') {
    const merchantId = url.searchParams.get('merchantId') || '';
    const rows = database.prepare(`
      SELECT products.id, products.merchant_id AS merchantId, merchants.name AS merchantName,
             products.name, products.description, products.price_cents AS priceCents,
             products.is_available AS isAvailable, products.created_at AS createdAt
      FROM products JOIN merchants ON merchants.id = products.merchant_id
      WHERE (? = '' OR products.merchant_id = ?)
      ORDER BY merchants.name, products.name
    `).all(merchantId, merchantId);
    sendJson(response, 200, { data: rows });
    return true;
  }

  const productMatch = path.match(/^\/api\/admin\/catalog\/products\/([^/]+)$/);
  if (productMatch && request.method === 'POST') {
    return readJson(request).then((body) => createProduct({ body, actor, database, response, sendJson }));
  }
  if (productMatch && request.method === 'PATCH') {
    return readJson(request).then((body) => updateProduct({ id: productMatch[1], body, actor, database, response, sendJson }));
  }
  if (productMatch && request.method === 'DELETE') {
    return archiveProduct({ id: productMatch[1], actor, database, response, sendJson });
  }

  sendJson(response, 404, error('NOT_FOUND', 'Admin catalog route not found'));
  return true;
}

function createMerchant({ body, actor, database, response, sendJson }) {
  const values = merchantInput(body);
  if (!values) return sendJson(response, 400, error('INVALID_INPUT', 'name, description, and category are required'));
  const id = `merchant_${crypto.randomUUID()}`;
  database.prepare(`
    INSERT INTO merchants (id, name, description, category, is_open, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, values.name, values.description, values.category, values.isOpen ? 1 : 0, now());
  audit(database, { actorUserId: actor.id, action: 'catalog.merchant.create', resourceType: 'merchant', resourceId: id, metadata: { name: values.name, category: values.category } });
  sendJson(response, 201, { data: getMerchant(database, id) });
}

function updateMerchant({ id, body, actor, database, response, sendJson }) {
  const current = getMerchant(database, id);
  if (!current) return notFound(response, sendJson, 'MERCHANT_NOT_FOUND', 'Merchant not found');
  const values = merchantPatch(body);
  if (!values) return sendJson(response, 400, error('INVALID_INPUT', 'At least one valid merchant field is required'));
  const next = { ...current, ...values };
  database.prepare(`
    UPDATE merchants SET name = ?, description = ?, category = ?, is_open = ? WHERE id = ?
  `).run(next.name, next.description, next.category, next.isOpen ? 1 : 0, id);
  audit(database, { actorUserId: actor.id, action: 'catalog.merchant.update', resourceType: 'merchant', resourceId: id, metadata: { changed: Object.keys(values) } });
  sendJson(response, 200, { data: getMerchant(database, id) });
}

function archiveMerchant({ id, actor, database, response, sendJson }) {
  const current = getMerchant(database, id);
  if (!current) return notFound(response, sendJson, 'MERCHANT_NOT_FOUND', 'Merchant not found');
  database.exec('BEGIN');
  try {
    database.prepare('UPDATE merchants SET is_open = 0 WHERE id = ?').run(id);
    database.prepare('UPDATE products SET is_available = 0 WHERE merchant_id = ?').run(id);
    database.exec('COMMIT');
  } catch (cause) {
    database.exec('ROLLBACK');
    throw cause;
  }
  audit(database, { actorUserId: actor.id, action: 'catalog.merchant.archive', resourceType: 'merchant', resourceId: id });
  sendJson(response, 200, { data: getMerchant(database, id) });
  return true;
}

function createProduct({ body, actor, database, response, sendJson }) {
  const values = productInput(body);
  if (!values) return sendJson(response, 400, error('INVALID_INPUT', 'merchantId, name, description, and positive priceCents are required'));
  if (!getMerchant(database, values.merchantId)) return notFound(response, sendJson, 'MERCHANT_NOT_FOUND', 'Merchant not found');
  const id = `product_${crypto.randomUUID()}`;
  database.prepare(`
    INSERT INTO products (id, merchant_id, name, description, price_cents, is_available, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, values.merchantId, values.name, values.description, values.priceCents, values.isAvailable ? 1 : 0, now());
  audit(database, { actorUserId: actor.id, action: 'catalog.product.create', resourceType: 'product', resourceId: id, metadata: { merchantId: values.merchantId, name: values.name } });
  sendJson(response, 201, { data: getProduct(database, id) });
}

function updateProduct({ id, body, actor, database, response, sendJson }) {
  const current = getProduct(database, id);
  if (!current) return notFound(response, sendJson, 'PRODUCT_NOT_FOUND', 'Product not found');
  const values = productPatch(body);
  if (!values) return sendJson(response, 400, error('INVALID_INPUT', 'At least one valid product field is required'));
  const next = { ...current, ...values };
  if (!getMerchant(database, next.merchantId)) return notFound(response, sendJson, 'MERCHANT_NOT_FOUND', 'Merchant not found');
  database.prepare(`
    UPDATE products SET merchant_id = ?, name = ?, description = ?, price_cents = ?, is_available = ? WHERE id = ?
  `).run(next.merchantId, next.name, next.description, next.priceCents, next.isAvailable ? 1 : 0, id);
  audit(database, { actorUserId: actor.id, action: 'catalog.product.update', resourceType: 'product', resourceId: id, metadata: { changed: Object.keys(values) } });
  sendJson(response, 200, { data: getProduct(database, id) });
}

function archiveProduct({ id, actor, database, response, sendJson }) {
  if (!getProduct(database, id)) return notFound(response, sendJson, 'PRODUCT_NOT_FOUND', 'Product not found');
  database.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run(id);
  audit(database, { actorUserId: actor.id, action: 'catalog.product.archive', resourceType: 'product', resourceId: id });
  sendJson(response, 200, { data: getProduct(database, id) });
  return true;
}

function getMerchant(database, id) {
  const merchant = database.prepare(`SELECT id, name, description, category, is_open AS isOpen, created_at AS createdAt FROM merchants WHERE id = ?`).get(id);
  return merchant ? { ...merchant, isOpen: Boolean(merchant.isOpen) } : null;
}

function getProduct(database, id) {
  const product = database.prepare(`SELECT id, merchant_id AS merchantId, name, description, price_cents AS priceCents, is_available AS isAvailable, created_at AS createdAt FROM products WHERE id = ?`).get(id);
  return product ? { ...product, isAvailable: Boolean(product.isAvailable) } : null;
}

function merchantInput(body) {
  if (!validText(body.name) || !validText(body.description) || !validText(body.category)) return null;
  return { name: body.name.trim(), description: body.description.trim(), category: body.category.trim(), isOpen: body.isOpen !== false };
}

function merchantPatch(body) {
  const values = {};
  if (body.name !== undefined && validText(body.name)) values.name = body.name.trim();
  if (body.description !== undefined && validText(body.description)) values.description = body.description.trim();
  if (body.category !== undefined && validText(body.category)) values.category = body.category.trim();
  if (body.isOpen !== undefined && typeof body.isOpen === 'boolean') values.isOpen = body.isOpen;
  return Object.keys(values).length ? values : null;
}

function productInput(body) {
  if (!validText(body.merchantId) || !validText(body.name) || !validText(body.description) || !positiveCents(body.priceCents)) return null;
  return { merchantId: body.merchantId.trim(), name: body.name.trim(), description: body.description.trim(), priceCents: body.priceCents, isAvailable: body.isAvailable !== false };
}

function productPatch(body) {
  const values = {};
  if (body.merchantId !== undefined && validText(body.merchantId)) values.merchantId = body.merchantId.trim();
  if (body.name !== undefined && validText(body.name)) values.name = body.name.trim();
  if (body.description !== undefined && validText(body.description)) values.description = body.description.trim();
  if (body.priceCents !== undefined && positiveCents(body.priceCents)) values.priceCents = body.priceCents;
  if (body.isAvailable !== undefined && typeof body.isAvailable === 'boolean') values.isAvailable = body.isAvailable;
  return Object.keys(values).length ? values : null;
}

function positiveCents(value) {
  return Number.isInteger(value) && value > 0;
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500;
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
  sendJson(response, 403, error('FORBIDDEN', 'An admin or operator role is required'));
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
