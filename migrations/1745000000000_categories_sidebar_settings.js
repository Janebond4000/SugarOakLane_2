/**
 * Add sidebar_visible to categories + create sidebar_settings in site_settings
 */
module.exports = {
  name: 'categories_sidebar_settings',
  up: async (client) => {
    // Add sidebar_visible column to categories (controls which appear in shop filter)
    await client.query(`
      ALTER TABLE categories
      ADD COLUMN IF NOT EXISTS sidebar_visible BOOLEAN DEFAULT TRUE
    `);

    // Seed default categories if table is empty
    await client.query(`
      INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible)
      VALUES
        ('Flower Shop',    'flower-shop',  'Fresh cut flowers and arrangements', '🌸', 1, TRUE, TRUE),
        ('Seeds & Bulbs',  'seeds-bulbs',  'Seeds, bulbs, and bare roots',        '🌱', 2, TRUE, TRUE),
        ('Plants & Plugs', 'plant-nursery','Live plants and plug starts',          '🪴', 3, TRUE, TRUE),
        ('Farm Goods',     'farm-goods',   'Farm-fresh produce and goods',         '🏡', 4, TRUE, TRUE)
      ON CONFLICT (slug) DO UPDATE SET
        sidebar_visible = EXCLUDED.sidebar_visible
    `);
  }
};
