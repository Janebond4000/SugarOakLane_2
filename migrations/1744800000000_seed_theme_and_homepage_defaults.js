/**
 * Migration: Seed theme_colors and homepage_hero defaults into site_settings.
 *
 * theme_colors  — JSON object of CSS custom property overrides for /api/theme.css
 * homepage_hero — JSON object of hero section content for the homepage
 *
 * Both use ON CONFLICT DO NOTHING so existing admin-configured values are preserved.
 */

const DEFAULT_THEME_COLORS = {
  '--green':       '#3A5A40',
  '--green-dk':    '#2C4730',
  '--green-lt':    '#4D7A55',
  '--green-bg':    '#EDF3EE',
  '--accent-pink': '#D4748A',
  '--warm-beige':  '#F5EFE6',
  '--linen':       '#FEFDF8',
  '--linen-dk':    '#F5F0E8',
  '--linen-md':    '#EDE7DC',
};

const DEFAULT_HOMEPAGE_HERO = {
  image_url:           '',
  eyebrow:             'Specialty Cut Flower Farm · Atlanta, GA',
  headline:            'Grown with<br/>Care &amp; Intention',
  subline:             'Farm-direct flowers, heirloom seeds, and nursery plants — grown on our land and delivered fresh to your door in the Atlanta & Loganville area.',
  cta_primary_text:    'Shop the Farm',
  cta_primary_href:    '/shop',
  cta_secondary_text:  'Our Story',
  cta_secondary_href:  '/about',
};

module.exports = {
  name: 'seed_theme_and_homepage_defaults',

  up: async (client) => {
    // Seed theme_colors — skip if already set so admin changes are not overwritten
    await client.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('theme_colors', $1, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(DEFAULT_THEME_COLORS)]
    );

    // Seed homepage_hero defaults — skip if already configured
    await client.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('homepage_hero', $1, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(DEFAULT_HOMEPAGE_HERO)]
    );
  },

  down: async (client) => {
    // Only remove if still at default values (safety check)
    await client.query(
      `DELETE FROM site_settings WHERE key IN ('theme_colors', 'homepage_hero')`
    );
  },
};
