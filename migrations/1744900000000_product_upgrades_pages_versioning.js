/**
 * Product system upgrades:
 *   - Multi-category JSONB array on sol_products
 *   - stock_status field (in_stock / low_stock / sold_out)
 *
 * Page versioning:
 *   - route_slug: the public URL path this page version belongs to
 *   - version_label: human name for this version ("Spring Design", "V2", etc.)
 *   - is_live: whether this version is the one currently served at route_slug
 */
module.exports = {
  name: 'product_upgrades_pages_versioning',

  up: async (client) => {
    // sol_products: multi-category support
    await client.query(`
      ALTER TABLE sol_products
        ADD COLUMN IF NOT EXISTS categories   JSONB         DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS stock_status VARCHAR(20)   DEFAULT 'in_stock'
    `);

    // Backfill categories from existing sol_category
    await client.query(`
      UPDATE sol_products
      SET categories = jsonb_build_array(sol_category)
      WHERE categories = '[]'::jsonb OR categories IS NULL
    `);

    // pages: versioning columns
    await client.query(`
      ALTER TABLE pages
        ADD COLUMN IF NOT EXISTS route_slug    VARCHAR(100),
        ADD COLUMN IF NOT EXISTS version_label VARCHAR(100) DEFAULT 'Version 1',
        ADD COLUMN IF NOT EXISTS is_live       BOOLEAN      DEFAULT false
    `);

    // Backfill route_slug and is_live from existing data
    await client.query(`
      UPDATE pages
      SET route_slug = slug,
          is_live    = is_published
      WHERE route_slug IS NULL
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_pages_route_slug ON pages(route_slug)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pages_is_live ON pages(is_live) WHERE is_live = true`);

    console.log('[migration] product_upgrades_pages_versioning: done');
  },

  down: async (client) => {
    await client.query(`DROP INDEX IF EXISTS idx_pages_route_slug`);
    await client.query(`DROP INDEX IF EXISTS idx_pages_is_live`);
    await client.query(`
      ALTER TABLE sol_products
        DROP COLUMN IF EXISTS categories,
        DROP COLUMN IF EXISTS stock_status
    `);
    await client.query(`
      ALTER TABLE pages
        DROP COLUMN IF EXISTS route_slug,
        DROP COLUMN IF EXISTS version_label,
        DROP COLUMN IF EXISTS is_live
    `);
  },
};
