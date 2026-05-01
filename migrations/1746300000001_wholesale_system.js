/**
 * Wholesale Ordering System
 *
 * Creates the complete wholesale ordering infrastructure:
 * 1. sol_wholesale_customers  — B2B customer accounts with hashed passwords
 * 2. sol_wholesale_products   — catalog of orderable wholesale products
 * 3. sol_wholesale_harvest_weeks — available ordering windows
 * 4. sol_wholesale_orders     — submitted customer orders
 * 5. sol_wholesale_order_items — line items per order
 */
module.exports = {
  name: 'wholesale_system',

  up: async (client) => {
    // ── 1. Wholesale customers ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_wholesale_customers (
        id            SERIAL PRIMARY KEY,
        business_name VARCHAR(255)  NOT NULL,
        contact_name  VARCHAR(255)  NOT NULL,
        email         VARCHAR(255)  NOT NULL UNIQUE,
        password_hash TEXT          NOT NULL,
        phone         VARCHAR(60),
        notes         TEXT,
        active        BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ   DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_customers_email
        ON sol_wholesale_customers (LOWER(email))
    `);

    // ── 2. Wholesale products ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_wholesale_products (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(255)    NOT NULL,
        image_url       TEXT,
        description     TEXT,
        unit_type       VARCHAR(30)     NOT NULL DEFAULT 'bunch',
        price_per_unit  DECIMAL(10,2)   NOT NULL,
        variety_options JSONB           DEFAULT '[]',
        available_now   BOOLEAN         NOT NULL DEFAULT FALSE,
        active          BOOLEAN         NOT NULL DEFAULT TRUE,
        sort_order      INT             NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ     DEFAULT NOW(),
        updated_at      TIMESTAMPTZ     DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ws_products_active_sort
        ON sol_wholesale_products (active, sort_order)
    `);

    // ── 3. Harvest weeks ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_wholesale_harvest_weeks (
        id              SERIAL PRIMARY KEY,
        week_start_date DATE          NOT NULL,
        week_end_date   DATE          NOT NULL,
        label           VARCHAR(120)  NOT NULL,
        active          BOOLEAN       NOT NULL DEFAULT TRUE,
        sort_order      INT           NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ   DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   DEFAULT NOW()
      )
    `);

    // ── 4. Orders ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_wholesale_orders (
        id          SERIAL PRIMARY KEY,
        customer_id INT            NOT NULL REFERENCES sol_wholesale_customers(id) ON DELETE CASCADE,
        status      VARCHAR(30)    NOT NULL DEFAULT 'submitted',
        subtotal    DECIMAL(10,2)  NOT NULL DEFAULT 0,
        notes       TEXT,
        created_at  TIMESTAMPTZ    DEFAULT NOW(),
        updated_at  TIMESTAMPTZ    DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ws_orders_customer
        ON sol_wholesale_orders (customer_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ws_orders_status
        ON sol_wholesale_orders (status, created_at DESC)
    `);

    // ── 5. Order items ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_wholesale_order_items (
        id               SERIAL PRIMARY KEY,
        order_id         INT           NOT NULL REFERENCES sol_wholesale_orders(id) ON DELETE CASCADE,
        product_id       INT           NOT NULL REFERENCES sol_wholesale_products(id) ON DELETE RESTRICT,
        variety          VARCHAR(120),
        quantity         INT           NOT NULL DEFAULT 1,
        unit_type        VARCHAR(30)   NOT NULL,
        price_per_unit   DECIMAL(10,2) NOT NULL,
        harvest_week_id  INT           REFERENCES sol_wholesale_harvest_weeks(id) ON DELETE SET NULL,
        delivery_date    DATE,
        created_at       TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ws_order_items_order
        ON sol_wholesale_order_items (order_id)
    `);

    console.log('[migration] wholesale_system: done');
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_wholesale_order_items`);
    await client.query(`DROP TABLE IF EXISTS sol_wholesale_orders`);
    await client.query(`DROP TABLE IF EXISTS sol_wholesale_harvest_weeks`);
    await client.query(`DROP TABLE IF EXISTS sol_wholesale_products`);
    await client.query(`DROP TABLE IF EXISTS sol_wholesale_customers`);
  }
};
