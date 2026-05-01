module.exports = {
  name: '1745400000000_create_sol_subscribers',

  up: async (client) => {
    // ── 1. Subscriber email list ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_subscribers (
        id                 SERIAL PRIMARY KEY,
        email              VARCHAR(320) NOT NULL UNIQUE,
        subscribed_at      TIMESTAMPTZ DEFAULT NOW(),
        source             VARCHAR(100) DEFAULT 'homepage',
        discount_code_used BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_subscribers_email_idx ON sol_subscribers (email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_subscribers_subscribed_at_idx ON sol_subscribers (subscribed_at)`);

    // ── 2. Add promo code columns to sol_orders ───────────────────────────────
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50)`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0`);
  },

  down: async (client) => {
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS discount_amount`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS promo_code`);
    await client.query(`DROP TABLE IF EXISTS sol_subscribers`);
  },
};
