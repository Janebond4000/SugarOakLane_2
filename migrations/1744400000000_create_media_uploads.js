/**
 * Sugar Oak Lane — Media Uploads
 * Tracks all images/files uploaded via the admin dashboard image manager.
 */
module.exports = {
  name: 'create_media_uploads',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_uploads (
        id            SERIAL PRIMARY KEY,
        filename      VARCHAR(512)  NOT NULL,
        original_name VARCHAR(512)  NOT NULL,
        url           TEXT          NOT NULL,
        mime_type     VARCHAR(100),
        file_size     INTEGER,
        alt_text      TEXT,
        created_at    TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS media_uploads_created_idx ON media_uploads (created_at DESC)`);
  },
  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS media_uploads`);
  }
};
