/**
 * Site-wide key/value settings table.
 * Used for admin-editable content: message bar text, toggle, link, etc.
 */
module.exports = {
  name: 'add_site_settings',

  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key         VARCHAR(100) PRIMARY KEY,
        value       TEXT NOT NULL DEFAULT '',
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed defaults — match the current hardcoded promo bar text
    await client.query(`
      INSERT INTO site_settings (key, value) VALUES
        ('message_bar_enabled', 'true'),
        ('message_bar_text',    '🌸 Same-day delivery available — order by 2PM! Free delivery on orders over $75'),
        ('message_bar_link',    '')
      ON CONFLICT (key) DO NOTHING
    `);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS site_settings`);
  },
};
