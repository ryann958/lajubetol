import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 43000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

async function startServer(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'laju-betol-catalog-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(directory, 'catalog.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
  });
  t.after(async () => {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && JSON.stringify(options.body),
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}

test('admin can manage merchants and products while customer cannot', async (t) => {
  await startServer(t);
  const adminLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@lajubetol.app', password: 'admin' } });
  const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };
  const customerLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'demo@lajubetol.app', password: 'password' } });
  const customerHeaders = { authorization: `Bearer ${customerLogin.body.data.token}` };

  const denied = await request('/api/admin/catalog/merchants', { headers: customerHeaders });
  assert.equal(denied.response.status, 403);

  const createMerchant = await request('/api/admin/catalog/merchants/ignored', {
    method: 'POST',
    headers: adminHeaders,
    body: { name: 'Toko Baru', description: 'Layanan baru', category: 'service' },
  });
  assert.equal(createMerchant.response.status, 201);
  const merchantId = createMerchant.body.data.id;

  const updateMerchant = await request(`/api/admin/catalog/merchants/${merchantId}`, {
    method: 'PATCH', headers: adminHeaders, body: { isOpen: false },
  });
  assert.equal(updateMerchant.body.data.isOpen, false);

  const createProduct = await request('/api/admin/catalog/products/ignored', {
    method: 'POST', headers: adminHeaders,
    body: { merchantId, name: 'Layanan Antar', description: 'Antar cepat', priceCents: 1250 },
  });
  assert.equal(createProduct.response.status, 201);
  const productId = createProduct.body.data.id;

  const updateProduct = await request(`/api/admin/catalog/products/${productId}`, {
    method: 'PATCH', headers: adminHeaders, body: { priceCents: 1500 },
  });
  assert.equal(updateProduct.body.data.priceCents, 1500);

  const archiveProduct = await request(`/api/admin/catalog/products/${productId}`, { method: 'DELETE', headers: adminHeaders });
  assert.equal(archiveProduct.body.data.isAvailable, false);

  const logs = await request('/api/admin/audit-logs', { headers: adminHeaders });
  assert.equal(logs.body.data.length >= 4, true);
});
