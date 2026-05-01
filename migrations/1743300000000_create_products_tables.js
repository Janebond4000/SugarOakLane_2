/**
 * Create categories and products tables for Sugar Oak Lane storefront
 */
module.exports = {
  name: 'create_products_tables',
  up: async (client) => {
    // Categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        icon VARCHAR(20) DEFAULT '💐',
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Products
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        category_id INT REFERENCES categories(id),
        description TEXT,
        short_description VARCHAR(500),
        price_standard DECIMAL(10,2),
        price_deluxe DECIMAL(10,2),
        price_premium DECIMAL(10,2),
        image_url TEXT,
        occasion_tags TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        is_featured BOOLEAN DEFAULT FALSE,
        sort_order INT DEFAULT 0,
        seo_title VARCHAR(120),
        seo_description VARCHAR(220),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Index for category-based filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS products_category_id_idx ON products (category_id)
      WHERE is_active = TRUE
    `);

    // Index for slug lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS products_slug_idx ON products (slug)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS categories_slug_idx ON categories (slug)
    `);
  }
};
