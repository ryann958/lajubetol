import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 44000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

async function startServer(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'laju-betol-operations-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(directory, 'operations.sqlite') },
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
    child.stderr.on('data', (chunk) => reject(new Error(chunk.toString())));
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

test('admin operations can inspect and update business workflows', async (t) => {
  await startServer(t);
  const adminLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@lajubetol.app', password: 'admin' } });
  const headers = { authorization: `Bearer ${adminLogin.body.data.token}` };
  const customerLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'demo@lajubetol.app', password: 'password' } });
  const customerHeaders = { authorization: `Bearer ${customerLogin.body.data.token}` };

  const createdOrder = await request('/api/orders', { method: 'POST', headers: customerHeaders, body: { items: [{ productId: 'product_nasi', quantity: 1 }], deliveryAddress: 'Jl. Admin 1' } });
  const orderId = createdOrder.body.data.id;
  const orders = await request('/api/admin/operations/orders?status=placed', { headers });
  assert.equal(orders.body.data.some((order) => order.id === orderId), true);

  const status = await request(`/api/admin/operations/orders/${orderId}/status`, { method: 'POST', headers, body: { status: 'preparing' } });
  assert.equal(status.body.data.status, 'preparing');

  const thread = await request('/api/support/threads', { method: 'POST', headers: customerHeaders, body: { subject: 'Admin help', message: 'Need help' } });
  const reply = await request(`/api/admin/operations/support/${thread.body.data.id}/messages`, { method: 'POST', headers, body: { message: 'Support response' } });
  assert.equal(reply.body.data.sender, 'support');

  const customers = await request('/api/admin/operations/customers', { headers });
  assert.equal(customers.body.data.length >= 2, true);
  const support = await request('/api/admin/operations/support', { headers });
  assert.equal(support.body.data.some((item) => item.id === thread.body.data.id), true);
});
