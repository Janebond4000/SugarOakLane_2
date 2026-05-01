/**
 * Sugar Oak Lane — Blog Posts schema upgrade
 * Adds category (growing-guides/farm-stories/seasonal/wedding) and meta_description columns.
 */
module.exports = {
  name: 'add_blog_category_meta',
  up: async (client) => {
    await client.query(`
      ALTER TABLE blog_posts
        ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'farm-stories',
        ADD COLUMN IF NOT EXISTS meta_description TEXT
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON blog_posts (category)
    `);
  },
  down: async (client) => {
    await client.query(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS category`);
    await client.query(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS meta_description`);
  }
};
