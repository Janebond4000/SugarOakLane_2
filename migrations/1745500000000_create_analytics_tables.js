module.exports = {
  name: '1745500000000_create_analytics_tables',

  up: async (client) => {
    // ── 1. Page views ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_page_views (
        id         BIGSERIAL PRIMARY KEY,
        path       VARCHAR(2000) NOT NULL,
        referrer   TEXT,
        user_agent TEXT,
        ip_hash    VARCHAR(64),
        session_id VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_pv_created_at_idx ON sol_page_views (created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_pv_path_idx ON sol_page_views (path)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_pv_session_idx ON sol_page_views (session_id)`);

    // ── 2. Product views ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_product_views (
        id         BIGSERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        session_id VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_prodv_product_id_idx ON sol_product_views (product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_prodv_created_at_idx ON sol_product_views (created_at)`);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_product_views`);
    await client.query(`DROP TABLE IF EXISTS sol_page_views`);
  },
};
