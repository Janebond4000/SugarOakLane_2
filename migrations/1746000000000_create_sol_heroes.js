/**
 * Sugar Oak Lane — Reusable hero system
 * Creates sol_heroes table: per-page hero images supporting static and slider modes.
 * Multiple rows per page_key = slider; single row = static hero.
 */
module.exports = {
  name: 'create_sol_heroes',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_heroes (
        id          SERIAL PRIMARY KEY,
        page_key    VARCHAR(100)  NOT NULL,
        image_url   TEXT          NOT NULL,
        headline    TEXT,
        subtext     TEXT,
        cta_text    VARCHAR(200),
        cta_link    VARCHAR(500),
        sort_order  INTEGER       NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ   DEFAULT NOW(),
        updated_at  TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sol_heroes_page_key_idx
        ON sol_heroes (page_key, sort_order)
    `);
  },
  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_heroes`);
  }
};
