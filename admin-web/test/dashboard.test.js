import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:')), '..');

test('admin dashboard contains the expected workspace pages', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  for (const view of ['overview', 'catalog', 'orders', 'travel', 'support', 'payments', 'customers']) assert.match(html, new RegExp(view));
  for (const endpoint of ['/api/admin/dashboard', '/api/admin/catalog/merchants', '/api/admin/operations/orders', '/api/admin/operations/customers']) assert.match(app, new RegExp(endpoint.replaceAll('/', '\\/')));
  assert.match(css, /@media/);
});
