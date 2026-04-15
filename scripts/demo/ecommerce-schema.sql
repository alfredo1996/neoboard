-- NeoBoard demo e-commerce schema.
--
-- All demo tables live in an isolated schema (`neoboard_demo_public`) so
-- `neoboard demo reset` can `DROP SCHEMA neoboard_demo_public CASCADE`
-- without touching any user data. NEVER move these tables into `public`.
--
-- Idempotent: the seed script drops and recreates the schema on every run.

CREATE SCHEMA IF NOT EXISTS neoboard_demo_public;

SET search_path TO neoboard_demo_public;

-- ---------------------------------------------------------------------------
-- Regions (continents + countries)
-- ---------------------------------------------------------------------------
CREATE TABLE regions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL,
  continent    TEXT NOT NULL
);

CREATE INDEX regions_continent_idx ON regions (continent);

-- ---------------------------------------------------------------------------
-- Categories (hierarchical — drives sunburst/treemap)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  parent_id    INTEGER REFERENCES categories (id) ON DELETE CASCADE
);

CREATE INDEX categories_parent_idx ON categories (parent_id);

-- ---------------------------------------------------------------------------
-- Customers (geo for map + region for filters)
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  region_id    INTEGER NOT NULL REFERENCES regions (id) ON DELETE RESTRICT,
  city         TEXT NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  signup_date  DATE NOT NULL
);

CREATE INDEX customers_region_idx ON customers (region_id);
CREATE INDEX customers_signup_idx ON customers (signup_date);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  price        NUMERIC(10, 2) NOT NULL,
  cost         NUMERIC(10, 2) NOT NULL
);

CREATE INDEX products_category_idx ON products (category_id);

-- ---------------------------------------------------------------------------
-- Orders (one row per customer purchase event)
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL,
  total        NUMERIC(10, 2) NOT NULL
);

CREATE INDEX orders_customer_idx  ON orders (customer_id);
CREATE INDEX orders_created_idx   ON orders (created_at);
CREATE INDEX orders_status_idx    ON orders (status);

-- ---------------------------------------------------------------------------
-- Order items (join table, one row per line in an order)
-- ---------------------------------------------------------------------------
CREATE TABLE order_items (
  order_id     INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  qty          INTEGER NOT NULL,
  price        NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX order_items_product_idx ON order_items (product_id);

-- ---------------------------------------------------------------------------
-- Feedback (target of the Form-widget demo page in Chart Gallery)
-- ---------------------------------------------------------------------------
CREATE TABLE feedback (
  id           SERIAL PRIMARY KEY,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category     TEXT NOT NULL,
  comment      TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
