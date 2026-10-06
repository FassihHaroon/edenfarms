-- Eden Farm store schema. Idempotent: safe to run on every boot.
-- Money is stored as integer dirhams (1 QAR = 100) to avoid rounding errors.
-- The advisory lock stops two server instances migrating at the same moment.
SELECT pg_advisory_xact_lock(724501);

CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  note        text NOT NULL DEFAULT '',
  img         text NOT NULL DEFAULT '',
  cut         boolean NOT NULL DEFAULT false,
  star        boolean NOT NULL DEFAULT false,
  sort        int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  category_id     text NOT NULL REFERENCES categories(id),
  origin          text NOT NULL DEFAULT 'Eden Farm, Qatar',
  badge           text NOT NULL DEFAULT '',
  star            boolean NOT NULL DEFAULT false,
  cut             boolean NOT NULL DEFAULT false,
  img             text NOT NULL,
  wide_img        text NOT NULL DEFAULT '',
  pack            text NOT NULL DEFAULT '',
  taste           text NOT NULL DEFAULT '',
  uses            text[] NOT NULL DEFAULT '{}',
  discount_pct    int NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 90),
  discount_until  timestamptz,
  active          boolean NOT NULL DEFAULT true,
  sort            int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id, sort);

CREATE TABLE IF NOT EXISTS product_units (
  id             serial PRIMARY KEY,
  product_id     text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label          text NOT NULL,
  price_cents    int NOT NULL CHECK (price_cents > 0),
  compare_cents  int CHECK (compare_cents IS NULL OR compare_cents > 0),
  sort           int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS product_units_product_idx ON product_units (product_id, sort);

CREATE TABLE IF NOT EXISTS bundles (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  size           text NOT NULL DEFAULT '',
  serves         text NOT NULL DEFAULT '',
  img            text NOT NULL,
  tag            text NOT NULL DEFAULT '',
  price_cents    int NOT NULL CHECK (price_cents > 0),
  compare_cents  int CHECK (compare_cents IS NULL OR compare_cents > 0),
  active         boolean NOT NULL DEFAULT true,
  sort           int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Photos uploaded from the admin panel (web-optimised .webp), served at /img/<id>.webp
CREATE TABLE IF NOT EXISTS images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime        text NOT NULL,
  bytes       bytea NOT NULL,
  width       int,
  height      int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;

CREATE TABLE IF NOT EXISTS orders (
  id               bigserial PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  idempotency_key  uuid NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled')),
  customer_name    text NOT NULL,
  phone            text NOT NULL,
  area             text NOT NULL,
  zone             text NOT NULL DEFAULT '',
  street           text NOT NULL DEFAULT '',
  building         text NOT NULL DEFAULT '',
  address_notes    text NOT NULL DEFAULT '',
  slot_date        date NOT NULL,
  slot_window      text NOT NULL,
  payment_method   text NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer')),
  notes            text NOT NULL DEFAULT '',
  subtotal_cents   int NOT NULL,
  delivery_cents   int NOT NULL,
  total_cents      int NOT NULL,
  admin_note       text NOT NULL DEFAULT '',
  ip_hash          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_ip_idx ON orders (ip_hash, created_at);

-- Line items keep a snapshot of name and price, so editing or deleting a product
-- never changes an order that was already placed.
CREATE TABLE IF NOT EXISTS order_items (
  id             bigserial PRIMARY KEY,
  order_id       bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('product', 'bundle')),
  item_id        text NOT NULL,
  name           text NOT NULL,
  unit_label     text NOT NULL,
  unit_cents     int NOT NULL,
  compare_cents  int,
  qty            int NOT NULL CHECK (qty BETWEEN 1 AND 99),
  line_cents     int NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS admins (
  id               serial PRIMARY KEY,
  email            text NOT NULL UNIQUE,
  name             text NOT NULL DEFAULT '',
  password_hash    text NOT NULL,
  session_version  int NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_login_at    timestamptz
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id     bigserial PRIMARY KEY,
  ip     text NOT NULL,
  email  text NOT NULL,
  ok     boolean NOT NULL,
  at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, at);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, at);

-- ---------- October 2026: Arabic text, delivery location, tracking, repeat orders ----------
-- Arabic versions of shop text. Empty means "use the English".
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS name_ar   text NOT NULL DEFAULT '';
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS note_ar   text NOT NULL DEFAULT '';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS name_ar   text NOT NULL DEFAULT '';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS origin_ar text NOT NULL DEFAULT '';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS badge_ar  text NOT NULL DEFAULT '';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS pack_ar   text NOT NULL DEFAULT '';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS taste_ar  text NOT NULL DEFAULT '';
ALTER TABLE products      ADD COLUMN IF NOT EXISTS uses_ar   text[] NOT NULL DEFAULT '{}';
ALTER TABLE product_units ADD COLUMN IF NOT EXISTS label_ar  text NOT NULL DEFAULT '';
ALTER TABLE bundles       ADD COLUMN IF NOT EXISTS name_ar   text NOT NULL DEFAULT '';
ALTER TABLE bundles       ADD COLUMN IF NOT EXISTS size_ar   text NOT NULL DEFAULT '';
ALTER TABLE bundles       ADD COLUMN IF NOT EXISTS serves_ar text NOT NULL DEFAULT '';
ALTER TABLE bundles       ADD COLUMN IF NOT EXISTS tag_ar    text NOT NULL DEFAULT '';

-- Repeat orders: the same basket again every N days, created by staff from the admin panel.
CREATE TABLE IF NOT EXISTS subscriptions (
  id               bigserial PRIMARY KEY,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  every_days       int NOT NULL CHECK (every_days BETWEEN 3 AND 90),
  next_date        date NOT NULL,
  customer_name    text NOT NULL,
  phone            text NOT NULL,
  area             text NOT NULL,
  zone             text NOT NULL DEFAULT '',
  street           text NOT NULL DEFAULT '',
  building         text NOT NULL DEFAULT '',
  address_notes    text NOT NULL DEFAULT '',
  lat              double precision,
  lng              double precision,
  slot_window      text NOT NULL,
  payment_method   text NOT NULL,
  items            jsonb NOT NULL,
  notes            text NOT NULL DEFAULT '',
  lang             text NOT NULL DEFAULT 'en',
  first_order_id   bigint,
  last_order_id    bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_next_idx ON subscriptions (status, next_date);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS lat               double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lng               double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_label    text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS repeat_every_days int;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subscription_id   bigint;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS track_token       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_name        text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_phone       text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_link        text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lang              text NOT NULL DEFAULT 'en';
CREATE UNIQUE INDEX IF NOT EXISTS orders_track_token_idx ON orders (track_token);
CREATE INDEX IF NOT EXISTS orders_subscription_idx ON orders (subscription_id);
CREATE INDEX IF NOT EXISTS orders_code_idx ON orders (upper(code));
-- Orders placed before tracking existed get a tracking token too.
UPDATE orders SET track_token = replace(gen_random_uuid()::text, '-', '') WHERE track_token IS NULL;
