import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 41000 + (process.pid % 1000);

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
  });
}

test('demo user can login, read profile, and logout', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'laju-betol-auth-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(directory, 'auth.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await waitForServer(child);

  const invalid = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@lajubetol.app', password: 'wrong' }),
  });
  assert.equal(invalid.status, 401);

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@lajubetol.app', password: 'password' }),
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.data.user.display_name, 'Demo User');
  assert.deepEqual(loginBody.data.user.roles, ['customer']);
  assert.equal(typeof loginBody.data.token, 'string');

  const me = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.email, 'demo@lajubetol.app');

  const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  assert.equal(logout.status, 204);

  const afterLogout = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  assert.equal(afterLogout.status, 401);
});
