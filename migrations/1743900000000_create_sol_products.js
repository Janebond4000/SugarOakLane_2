/**
 * Sugar Oak Lane — Farm Storefront Products
 * Separate from Loganville Flowers (products table) — different schema.
 */
module.exports = {
  name: 'create_sol_products',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_products (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255)  NOT NULL,
        slug          VARCHAR(255)  NOT NULL UNIQUE,
        sol_category  VARCHAR(100)  NOT NULL DEFAULT 'flower-shop',
        subcategory   VARCHAR(100),
        description   TEXT,
        short_description VARCHAR(400),
        price         DECIMAL(10,2),
        price_label   VARCHAR(60),
        images        JSONB         DEFAULT '[]',
        availability  VARCHAR(50)   DEFAULT 'in_stock',
        inventory_count INT,
        season_tags   TEXT[]        DEFAULT '{}',
        type_tags     TEXT[]        DEFAULT '{}',
        is_featured   BOOLEAN       DEFAULT FALSE,
        is_active     BOOLEAN       DEFAULT TRUE,
        sort_order    INT           DEFAULT 0,
        seo_title     VARCHAR(120),
        seo_description VARCHAR(220),
        created_at    TIMESTAMPTZ   DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS sol_products_category_idx ON sol_products (sol_category) WHERE is_active = TRUE`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_products_slug_idx ON sol_products (slug)`);

    /* ── SOL orders table ─────────────────────────────────────────────────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_orders (
        id               SERIAL PRIMARY KEY,
        order_number     VARCHAR(40) UNIQUE,
        status           VARCHAR(50) DEFAULT 'pending_payment',
        fulfillment_type VARCHAR(30) DEFAULT 'pickup',
        customer_name    VARCHAR(255) NOT NULL,
        customer_email   VARCHAR(255),
        customer_phone   VARCHAR(40),
        shipping_address TEXT,
        shipping_city    VARCHAR(100),
        shipping_state   VARCHAR(50),
        shipping_zip     VARCHAR(20),
        delivery_zip     VARCHAR(20),
        subtotal         DECIMAL(10,2),
        shipping_fee     DECIMAL(10,2) DEFAULT 0,
        delivery_fee     DECIMAL(10,2) DEFAULT 0,
        total_price      DECIMAL(10,2),
        items            JSONB        DEFAULT '[]',
        notes            TEXT,
        stripe_session_id VARCHAR(255),
        metadata         JSONB        DEFAULT '{}',
        created_at       TIMESTAMPTZ  DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS sol_orders_email_idx ON sol_orders (customer_email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_orders_number_idx ON sol_orders (order_number)`);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_orders`);
    await client.query(`DROP TABLE IF EXISTS sol_products`);
  }
};
