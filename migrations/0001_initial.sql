PRAGMA foreign_keys = ON;

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),
  catalog_version INTEGER NOT NULL DEFAULT 1,
  license_status TEXT NOT NULL DEFAULT 'trial' CHECK (license_status IN ('trial','active','suspended')),
  license_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE store_hosts (
  hostname TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE products (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (store_id, id)
) STRICT;
CREATE INDEX products_by_category ON products(store_id, archived, category, name, id);

CREATE TRIGGER product_insert AFTER INSERT ON products
BEGIN UPDATE stores SET catalog_version = catalog_version+1 WHERE id = new.store_id; END;
CREATE TRIGGER product_update AFTER UPDATE ON products
BEGIN UPDATE stores SET catalog_version = catalog_version+1 WHERE id = new.store_id; END;
CREATE TRIGGER product_delete AFTER DELETE ON products
BEGIN UPDATE stores SET catalog_version = catalog_version+1 WHERE id = old.store_id; END;

CREATE TABLE presets (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (store_id,id)
) STRICT;

CREATE TABLE shared_builds (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (store_id,id)
) STRICT;
CREATE INDEX shared_expiry ON shared_builds(created_at);

CREATE TABLE users (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','support')),
  password_hash TEXT NOT NULL,
  totp_enc TEXT NOT NULL,
  last_totp_counter INTEGER NOT NULL DEFAULT -1,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (store_id,id),
  UNIQUE (store_id,email)
) STRICT;

CREATE TABLE sessions (
  store_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (store_id,token_hash),
  FOREIGN KEY (store_id,user_id) REFERENCES users(store_id,id) ON DELETE CASCADE
) STRICT;
CREATE INDEX sessions_by_expiry ON sessions(expires_at);

CREATE TABLE orders (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  idempotency_key TEXT,
  request_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','review','confirmed','completed','cancelled')),
  customer TEXT NOT NULL CHECK (json_valid(customer)),
  parts TEXT NOT NULL CHECK (json_valid(parts)),
  services TEXT NOT NULL CHECK (json_valid(services)),
  pricing TEXT NOT NULL CHECK (json_valid(pricing)),
  options TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options)),
  total INTEGER NOT NULL CHECK (total >= 0),
  currency TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (store_id,id),
  UNIQUE (store_id,idempotency_key)
) STRICT;
CREATE INDEX orders_by_date ON orders(store_id,created_at DESC,id);
CREATE INDEX orders_by_status ON orders(store_id,status,created_at DESC);

CREATE TABLE media (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (store_id,id)
) STRICT;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX audit_by_store ON audit_log(store_id,created_at DESC,id DESC);

CREATE TABLE limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX limits_by_expiry ON limits(expires_at);

CREATE TABLE turnstile_tokens (
  digest TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX turnstile_expiry ON turnstile_tokens(expires_at);

INSERT INTO stores (id,slug,name,currency,settings,license_status)
VALUES ('lumo','lumo','LUMO PC BUILDER','RUB',
  '{"accent":"#d1fa61","assemblyFee":4500,"services":[{"id":"stress-test","name":"Стресс-тест и отчёт","price":1500}],"promotions":[]}',
  'active');
