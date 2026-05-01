/**
 * Category hierarchy support + florist junk cleanup
 *
 * 1. Add parent_id, level, sort_order to categories for tree hierarchy
 * 2. Delete old florist products + categories (Loganville Flowers leftovers)
 * 3. Seed example hierarchy categories for Sugar Oak Lane
 */
module.exports = {
  name: 'category_hierarchy_and_cleanup',

  up: async (client) => {
    // ── Step 1: Add hierarchy columns ────────────────────────────────────────
    await client.query(`
      ALTER TABLE categories
        ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES categories(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS level INT DEFAULT 0
    `);

    // Ensure sort_order exists (it should, but be safe)
    await client.query(`
      ALTER TABLE categories
        ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0
    `);

    // Index for parent lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)
    `);

    // ── Step 2: Purge florist junk ───────────────────────────────────────────
    // First remove FK references from old products table
    await client.query(`UPDATE products SET category_id = NULL WHERE category_id IS NOT NULL`);

    // Delete old florist categories (IDs 1-8 from seed_flower_products migration)
    await client.query(`
      DELETE FROM categories WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8)
    `);

    // Also clean the "Annuals" and "Focal Flowers" categories that were created
    // flat (no parent) — they'll be re-created in the hierarchy below
    await client.query(`
      DELETE FROM categories WHERE slug IN ('annuals', 'focal-flowers') AND parent_id IS NULL
    `);

    // ── Step 3: Ensure SOL root categories exist, add level=0 ────────────────
    // Update existing SOL categories to be level 0 (root)
    await client.query(`
      UPDATE categories SET level = 0, parent_id = NULL
      WHERE slug IN ('flower-shop', 'seeds-bulbs', 'plant-nursery', 'farm-goods')
    `);

    // ── Step 4: Seed example child categories ────────────────────────────────
    // Get the parent IDs
    const seedsParent = await client.query(`SELECT id FROM categories WHERE slug = 'seeds-bulbs'`);
    const farmParent = await client.query(`SELECT id FROM categories WHERE slug = 'farm-goods'`);

    if (seedsParent.rows.length) {
      const pid = seedsParent.rows[0].id;
      // Level 1 children under Seeds & Bulbs
      await client.query(`
        INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, level)
        VALUES
          ('Annuals',    'annuals',    'Annual flower seeds',         '🌻', 1, TRUE, TRUE, $1, 1),
          ('Perennials', 'perennials', 'Perennial flower seeds',     '🌿', 2, TRUE, TRUE, $1, 1),
          ('Herbs',      'herbs',      'Herb seeds and starts',      '🌿', 3, TRUE, TRUE, $1, 1)
        ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, level = EXCLUDED.level
      `, [pid]);

      // Level 2 grandchildren under Annuals
      const annualsRow = await client.query(`SELECT id FROM categories WHERE slug = 'annuals'`);
      if (annualsRow.rows.length) {
        const annId = annualsRow.rows[0].id;
        await client.query(`
          INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, level)
          VALUES
            ('Focal Flowers', 'focal-flowers', 'Statement blooms — sunflowers, zinnias, cosmos', '🌸', 1, TRUE, TRUE, $1, 2),
            ('Filler Flowers', 'filler-flowers', 'Baby''s breath, statice, and more',              '🌾', 2, TRUE, TRUE, $1, 2)
          ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, level = EXCLUDED.level
        `, [annId]);
      }
    }

    if (farmParent.rows.length) {
      const pid = farmParent.rows[0].id;
      await client.query(`
        INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, level)
        VALUES
          ('Dried Herbs',   'dried-herbs',   'Farm-dried culinary herbs',   '🌿', 1, TRUE, TRUE, $1, 1),
          ('Dried Teas',    'dried-teas',    'Herbal tea blends',           '🍵', 2, TRUE, TRUE, $1, 1),
          ('Dried Flowers', 'dried-flowers', 'Preserved and dried blooms',  '💐', 3, TRUE, TRUE, $1, 1)
        ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, level = EXCLUDED.level
      `, [pid]);
    }

    console.log('[migration] category_hierarchy_and_cleanup: done');
  },

  down: async (client) => {
    // Remove hierarchy columns
    await client.query(`
      DROP INDEX IF EXISTS idx_categories_parent_id
    `);
    await client.query(`
      ALTER TABLE categories
        DROP COLUMN IF EXISTS parent_id,
        DROP COLUMN IF EXISTS level
    `);
  }
};
