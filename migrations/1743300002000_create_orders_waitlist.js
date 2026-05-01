/**
 * Create orders and waitlist tables for Sugar Oak Lane checkout flow
 */
module.exports = {
  name: 'create_orders_waitlist',
  up: async (client) => {
    // ── Orders ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,

        -- Arrangement
        product_slug   VARCHAR(255),
        product_name   VARCHAR(255),
        tier           VARCHAR(50)  DEFAULT 'standard',
        arrangement    TEXT,

        -- Pricing
        price_product  DECIMAL(10,2),
        delivery_fee   DECIMAL(10,2) DEFAULT 14.99,
        express_fee    DECIMAL(10,2) DEFAULT 0,
        total_price    DECIMAL(10,2),

        -- Delivery
        delivery_type  VARCHAR(50) DEFAULT 'standard',

        -- Sender
        sender_name    VARCHAR(255) NOT NULL,
        sender_email   VARCHAR(255),
        sender_phone   VARCHAR(50),

        -- Recipient + address
        recipient_name   VARCHAR(255),
        delivery_address TEXT NOT NULL,
        delivery_city    VARCHAR(100),
        delivery_state   VARCHAR(50) DEFAULT 'GA',
        delivery_zip     VARCHAR(10),

        -- Card message
        card_message TEXT,

        -- Status
        status    VARCHAR(50) DEFAULT 'pending',
        notes     TEXT,
        metadata  JSONB DEFAULT '{}',

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS orders_sender_email_idx  ON orders (sender_email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS orders_sender_phone_idx  ON orders (sender_phone)`);
    await client.query(`CREATE INDEX IF NOT EXISTS orders_delivery_zip_idx  ON orders (delivery_zip)`);
    await client.query(`CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS orders_created_at_idx    ON orders (created_at)`);

    // ── Waitlist (out-of-zone email capture) ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id         SERIAL PRIMARY KEY,
        email      VARCHAR(255) NOT NULL UNIQUE,
        zip_code   VARCHAR(10),
        city       VARCHAR(100),
        state      VARCHAR(50),
        source     VARCHAR(100) DEFAULT 'storefront',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS waitlist_zip_code_idx   ON waitlist (zip_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON waitlist (created_at)`);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS waitlist`);
    await client.query(`DROP TABLE IF EXISTS orders`);
  },
};
