module.exports = {
  name: '1746600000000_add_utm_columns_to_page_views',

  up: async (client) => {
    // Add UTM attribution columns (forward-looking — existing NULLs are expected)
    await client.query(`
      ALTER TABLE sol_page_views
        ADD COLUMN IF NOT EXISTS utm_source   VARCHAR(255),
        ADD COLUMN IF NOT EXISTS utm_medium   VARCHAR(255),
        ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255)
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_pv_utm_source_idx ON sol_page_views (utm_source) WHERE utm_source IS NOT NULL`);
  },

  down: async (client) => {
    await client.query(`ALTER TABLE sol_page_views DROP COLUMN IF EXISTS utm_source`);
    await client.query(`ALTER TABLE sol_page_views DROP COLUMN IF EXISTS utm_medium`);
    await client.query(`ALTER TABLE sol_page_views DROP COLUMN IF EXISTS utm_campaign`);
  },
};
