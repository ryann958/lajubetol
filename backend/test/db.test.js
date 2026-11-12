import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { databaseSummary, openDatabase } from '../src/db.js';

test('database creates schema and seed data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'laju-betol-db-'));
  const filename = path.join(directory, 'test.sqlite');
  const database = openDatabase(filename);

  assert.deepEqual(databaseSummary(database), {
    users: 2,
    merchants: 3,
    products: 3,
    orders: 0,
    travel_requests: 0,
    support_threads: 0,
    payments: 0,
  });
  assert.equal(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 2);

  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
