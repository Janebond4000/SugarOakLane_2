/**
 * Modular content block system.
 * Allows building flexible page layouts via the admin panel
 * by composing reusable blocks in any order.
 *
 * Block types: hero, text_image, gallery_grid, cta_banner, card_grid,
 *   testimonial, feature_icons, rich_text, contact_form, listing,
 *   pricing_table, sidebar_content
 */
module.exports = {
  name: 'create_page_blocks',

  up: async (client) => {
    // Custom pages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pages (
        id          SERIAL PRIMARY KEY,
        slug        VARCHAR(100) UNIQUE NOT NULL,
        title       VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        is_published BOOLEAN DEFAULT false,
        seo_title   VARCHAR(255) DEFAULT '',
        seo_desc    VARCHAR(500) DEFAULT '',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Content blocks table — one row per block on a page
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_blocks (
        id            SERIAL PRIMARY KEY,
        page_id       INTEGER REFERENCES pages(id) ON DELETE CASCADE,
        block_type    VARCHAR(50) NOT NULL,
        config        JSONB NOT NULL DEFAULT '{}',
        display_order INTEGER NOT NULL DEFAULT 0,
        is_visible    BOOLEAN DEFAULT true,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_blocks_page_id ON page_blocks(page_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_blocks_order ON page_blocks(page_id, display_order)`);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS page_blocks`);
    await client.query(`DROP TABLE IF EXISTS pages`);
  },
};
