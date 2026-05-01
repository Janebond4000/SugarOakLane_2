/**
 * Migration: Seed active_theme default into site_settings.
 *
 * active_theme controls which color palette is served by /api/theme.css:
 *   'default'   — green, white, and soft pastel pink (current brand palette)
 *   'alternate' — warm taupe / linen (Warm Taupe #C7B8A9 · Linen #FFFDF9)
 *
 * Uses ON CONFLICT DO NOTHING so an existing admin selection is preserved.
 */
module.exports = {
  name: 'add_active_theme_setting',

  up: async (client) => {
    await client.query(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('active_theme', 'default', NOW())
      ON CONFLICT (key) DO NOTHING
    `);
  },

  down: async (client) => {
    await client.query(`DELETE FROM site_settings WHERE key = 'active_theme'`);
  },
};
