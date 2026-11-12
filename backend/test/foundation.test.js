import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 45000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

async function startServer(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'laju-betol-foundation-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(directory, 'foundation.sqlite') },
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

test('admin foundation endpoints enforce roles and expose audit-safe dashboard data', async (t) => {
  await startServer(t);
  const customerLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'demo@lajubetol.app', password: 'password' } });
  const customerHeaders = { authorization: `Bearer ${customerLogin.body.data.token}` };
  const forbidden = await request('/api/admin/dashboard', { headers: customerHeaders });
  assert.equal(forbidden.response.status, 403);

  const adminLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@lajubetol.app', password: 'admin' } });
  assert.equal(adminLogin.body.data.user.roles.includes('admin'), true);
  const adminHeaders = { authorization: `Bearer ${adminLogin.body.data.token}` };
  const dashboard = await request('/api/admin/dashboard', { headers: adminHeaders });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.data.counts.merchants, 3);
  assert.equal(dashboard.body.data.counts.products, 3);

  const roles = await request('/api/admin/roles', { headers: adminHeaders });
  assert.equal(roles.response.status, 200);
  assert.equal(roles.body.data.some((role) => role.name === 'support'), true);

  const audit = await request('/api/admin/audit-logs', { headers: adminHeaders });
  assert.equal(audit.response.status, 200);
  assert.equal(Array.isArray(audit.body.data), true);
});
