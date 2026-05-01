/**
 * Floral Checkout Extension
 *
 * 1. Add is_floral_category (boolean) to categories
 * 2. Add requires_floral_checkout (boolean, nullable) to sol_products
 * 3. Create sol_floral_addons — add-on catalog
 * 4. Create sol_floral_order_details — per-order-item delivery details
 * 5. Create sol_floral_order_addons — selected add-ons per order
 * 6. Seed 8 add-ons
 * 7. Flag 'flower-shop' category as floral
 */
module.exports = {
  name: 'floral_checkout',

  up: async (client) => {
    // ── Step 1: Category floral flag ─────────────────────────────────────────
    await client.query(`
      ALTER TABLE categories
        ADD COLUMN IF NOT EXISTS is_floral_category BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // ── Step 2: Per-product override ─────────────────────────────────────────
    await client.query(`
      ALTER TABLE sol_products
        ADD COLUMN IF NOT EXISTS requires_floral_checkout BOOLEAN DEFAULT NULL
    `);

    // ── Step 3: Add-on catalog ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_floral_addons (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120)   NOT NULL,
        price       DECIMAL(10,2)  DEFAULT NULL,
        image_url   TEXT           DEFAULT NULL,
        active      BOOLEAN        NOT NULL DEFAULT TRUE,
        sort_order  INT            NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ    DEFAULT NOW()
      )
    `);

    // ── Step 4: Per-cart-item floral delivery details ────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_floral_order_details (
        id                   SERIAL PRIMARY KEY,
        cart_item_id         VARCHAR(128)  NOT NULL,
        order_id             INT           DEFAULT NULL,
        delivery_date        DATE          NOT NULL,
        recipient_name       VARCHAR(255)  NOT NULL,
        delivery_address     TEXT          NOT NULL,
        delivery_city        VARCHAR(120),
        delivery_state       VARCHAR(80),
        delivery_zip         VARCHAR(20),
        location_type        VARCHAR(60)   NOT NULL DEFAULT 'Home',
        delivery_instructions TEXT,
        card_message         TEXT,
        sender_name          VARCHAR(255),
        created_at           TIMESTAMPTZ   DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_floral_order_details_cart_item
        ON sol_floral_order_details (cart_item_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_floral_order_details_order
        ON sol_floral_order_details (order_id)
    `);

    // ── Step 5: Selected add-ons per floral order ────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_floral_order_addons (
        id                     SERIAL PRIMARY KEY,
        floral_order_detail_id INT  NOT NULL REFERENCES sol_floral_order_details(id) ON DELETE CASCADE,
        addon_id               INT  NOT NULL REFERENCES sol_floral_addons(id) ON DELETE CASCADE,
        quantity               INT  NOT NULL DEFAULT 1,
        created_at             TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Step 6: Seed 8 default add-ons ──────────────────────────────────────
    await client.query(`
      INSERT INTO sol_floral_addons (name, price, sort_order)
      VALUES
        ('Chocolates',    NULL, 1),
        ('Balloons',      NULL, 2),
        ('Card',          NULL, 3),
        ('Teddy Bear',    NULL, 4),
        ('Candle',        NULL, 5),
        ('Tea',           NULL, 6),
        ('Bath Salts',    NULL, 7),
        ('Spa Gift Set',  NULL, 8)
      ON CONFLICT DO NOTHING
    `);

    // ── Step 7: Mark 'flower-shop' category as floral ────────────────────────
    await client.query(`
      UPDATE categories SET is_floral_category = TRUE WHERE slug = 'flower-shop'
    `);

    console.log('[migration] floral_checkout: done');
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_floral_order_addons`);
    await client.query(`DROP TABLE IF EXISTS sol_floral_order_details`);
    await client.query(`DROP TABLE IF EXISTS sol_floral_addons`);
    await client.query(`ALTER TABLE sol_products DROP COLUMN IF EXISTS requires_floral_checkout`);
    await client.query(`ALTER TABLE categories DROP COLUMN IF EXISTS is_floral_category`);
  }
};
