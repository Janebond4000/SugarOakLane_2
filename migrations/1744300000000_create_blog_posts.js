/**
 * Sugar Oak Lane — Blog Posts
 * Allows admin to create/edit/publish blog content from the dashboard.
 */
module.exports = {
  name: 'create_blog_posts',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id           SERIAL PRIMARY KEY,
        title        VARCHAR(255)  NOT NULL,
        slug         VARCHAR(255)  NOT NULL UNIQUE,
        excerpt      TEXT,
        content      TEXT,
        image_url    TEXT,
        author       VARCHAR(120)  DEFAULT 'Sugar Oak Lane',
        tags         TEXT[]        DEFAULT '{}',
        is_published BOOLEAN       DEFAULT FALSE,
        published_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ   DEFAULT NOW(),
        updated_at   TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS blog_posts_slug_idx ON blog_posts (slug)`);
    await client.query(`CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts (is_published, published_at DESC)`);
  },
  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS blog_posts`);
  }
};
