import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 42000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

async function startServer(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'laju-betol-api-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(directory, 'api.sqlite') },
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
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test('catalog, orders, travel, support, profile, permissions, and payments work together', async (t) => {
  await startServer(t);
  const login = await request('/api/auth/login', { method: 'POST', body: { email: 'demo@lajubetol.app', password: 'password' } });
  const token = login.body.data.token;
  const headers = { authorization: `Bearer ${token}` };

  const merchants = await request('/api/catalog/merchants?query=Warung', { headers });
  assert.equal(merchants.response.status, 200);
  assert.equal(merchants.body.data.length, 1);

  const merchant = await request('/api/catalog/merchants/merchant_warung', { headers });
  assert.equal(merchant.body.data.products[0].id, 'product_nasi');

  const profile = await request('/api/profile', { headers });
  assert.equal(profile.body.data.displayName, 'Demo User');

  const updatedProfile = await request('/api/profile', { method: 'PATCH', headers, body: { displayName: 'Laju Tester', phone: '08123456789' } });
  assert.equal(updatedProfile.body.data.displayName, 'Laju Tester');
  assert.equal(updatedProfile.body.data.phone, '08123456789');

  const permission = await request('/api/profile/permissions', { method: 'PUT', headers, body: { permission: 'location', state: 'allowed' } });
  assert.equal(permission.body.data.state, 'allowed');

  const order = await request('/api/orders', { method: 'POST', headers, body: { items: [{ productId: 'product_nasi', quantity: 2 }], deliveryAddress: 'Jl. Demo 1' } });
  assert.equal(order.response.status, 201);
  assert.equal(order.body.data.status, 'placed');
  assert.equal(order.body.data.totalCents, 900);

  const preparing = await request(`/api/orders/${order.body.data.id}/status`, { method: 'POST', headers, body: { status: 'preparing' } });
  assert.equal(preparing.body.data.status, 'preparing');
  const invalidTransition = await request(`/api/orders/${order.body.data.id}/status`, { method: 'POST', headers, body: { status: 'completed' } });
  assert.equal(invalidTransition.response.status, 409);

  const quote = await request('/api/travel/quote', { method: 'POST', headers, body: { pickup: 'Current location', destination: 'Central Market' } });
  assert.equal(quote.body.data.fareCents, 240);
  const travel = await request('/api/travel/requests', { method: 'POST', headers, body: { pickup: 'Current location', destination: 'Central Market' } });
  assert.equal(travel.response.status, 201);

  const thread = await request('/api/support/threads', { method: 'POST', headers, body: { subject: 'Order help', message: 'Where is my order?' } });
  assert.equal(thread.body.data.status, 'open');
  const message = await request(`/api/support/threads/${thread.body.data.id}/messages`, { method: 'POST', headers, body: { message: 'Please check the status.' } });
  assert.equal(message.response.status, 201);

  const payment = await request('/api/payments', { method: 'POST', headers, body: { method: 'qris', amountCents: 900, orderId: order.body.data.id } });
  assert.equal(payment.response.status, 201);
  const paid = await request(`/api/payments/${payment.body.data.id}/pay`, { method: 'POST', headers });
  assert.equal(paid.body.data.status, 'paid');
});
