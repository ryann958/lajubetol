import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schemaVersion = 2;

export function openDatabase(filename = process.env.DB_PATH || path.join(process.cwd(), 'data', 'laju-betol.sqlite')) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON;');
  migrate(database);
  seed(database);
  return database;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = database.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(schemaVersion);
  if (applied) return;

  const legacySchema = database.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (legacySchema) {
    applyFoundationMigration(database);
    database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(schemaVersion, now());
    return;
  }

  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_user_roles_user ON user_roles(user_id);
    CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

    CREATE TABLE profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT,
      avatar_url TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE permission_states (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('unknown', 'allowed', 'denied')),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, permission)
    );

    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('draft', 'placed', 'preparing', 'ready', 'on_the_way', 'completed', 'cancelled')),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      delivery_address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      PRIMARY KEY (order_id, product_id)
    );

    CREATE TABLE travel_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      pickup TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('quoted', 'requested', 'matched', 'in_progress', 'completed', 'cancelled')),
      duration_minutes INTEGER NOT NULL,
      fare_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE support_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE support_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
      sender TEXT NOT NULL CHECK (sender IN ('user', 'support')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      order_id TEXT REFERENCES orders(id),
      method TEXT NOT NULL CHECK (method IN ('qris', 'mock_card', 'cash')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      reference TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_products_merchant ON products(merchant_id);
    CREATE INDEX idx_orders_user ON orders(user_id, created_at DESC);
    CREATE INDEX idx_support_messages_thread ON support_messages(thread_id, created_at);
  `);

  database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(schemaVersion, now());
}

function applyFoundationMigration(database) {
  database.exec(`
    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );
    CREATE TABLE user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_user_roles_user ON user_roles(user_id);
    CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
  `);
  seedFoundation(database);
}

function seedFoundation(database) {
  const timestamp = now();
  const roles = [
    ['customer', 'customer', 'Can use customer-facing features and access own data.'],
    ['admin', 'admin', 'Full operational access.'],
    ['operator', 'operator', 'Catalog and order operations.'],
    ['merchant', 'merchant', 'Assigned merchant operations.'],
    ['driver', 'driver', 'Assigned delivery and travel operations.'],
    ['support', 'support', 'Support conversations and customer lookup.'],
  ];
  const insertRole = database.prepare('INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)');
  for (const role of roles) insertRole.run(...role);

  database.prepare(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at)
    VALUES ('user_demo', 'customer', ?)
  `).run(timestamp);
  database.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, display_name, created_at)
    VALUES ('user_admin', 'admin@lajubetol.app', 'admin-demo-password', 'Laju Betol Admin', ?)
  `).run(timestamp);
  database.prepare(`
    INSERT OR IGNORE INTO profiles (user_id, phone, updated_at)
    VALUES ('user_admin', NULL, ?)
  `).run(timestamp);
  database.prepare(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at)
    VALUES ('user_admin', 'admin', ?)
  `).run(timestamp);
}

function seed(database) {
  const timestamp = now();
  database.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, display_name, created_at)
    VALUES ('user_demo', 'demo@lajubetol.app', 'demo-only-password', 'Demo User', ?)
  `).run(timestamp);
  database.prepare(`
    INSERT OR IGNORE INTO profiles (user_id, phone, updated_at)
    VALUES ('user_demo', NULL, ?)
  `).run(timestamp);

  const merchants = [
    ['merchant_warung', 'Warung Laju Betol', 'Makanan rumahan untuk kebutuhan harian.', 'food'],
    ['merchant_kopi', 'Kopi Titik Temu', 'Kopi dan minuman lokal.', 'beverage'],
    ['merchant_express', 'Laju Betol Express', 'Pengiriman barang cepat di sekitar kota.', 'delivery'],
  ];
  const insertMerchant = database.prepare(`
    INSERT OR IGNORE INTO merchants (id, name, description, category, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const merchant of merchants) insertMerchant.run(...merchant, timestamp);

  const products = [
    ['product_nasi', 'merchant_warung', 'Nasi ayam sambal', 'Paket makan praktis.', 450],
    ['product_kopi', 'merchant_kopi', 'Kopi susu gula aren', 'Kopi susu dingin.', 280],
    ['product_express', 'merchant_express', 'Paket kirim cepat', 'Pengiriman dalam kota.', 600],
  ];
  const insertProduct = database.prepare(`
    INSERT OR IGNORE INTO products (id, merchant_id, name, description, price_cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const product of products) insertProduct.run(...product, timestamp);
  seedFoundation(database);
}

function now() {
  return new Date().toISOString();
}

export function databaseSummary(database) {
  const tables = ['users', 'merchants', 'products', 'orders', 'travel_requests', 'support_threads', 'payments'];
  return Object.fromEntries(tables.map((table) => [table, database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
}
