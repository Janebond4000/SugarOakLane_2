/**
 * Add data_base64 column to media_uploads for DB-backed image storage.
 * Workaround for R2 proxy failures — stores image data in PostgreSQL.
 */
module.exports = {
  name: 'add_media_data_column',
  up: async (client) => {
    await client.query(`
      ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS data_base64 TEXT
    `);
  },
  down: async (client) => {
    await client.query(`ALTER TABLE media_uploads DROP COLUMN IF EXISTS data_base64`);
  }
};
