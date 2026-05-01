module.exports = {
  name: '1745600000000_create_sol_workshop_inquiries',

  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_workshop_inquiries (
        id               SERIAL PRIMARY KEY,
        name             VARCHAR(255) NOT NULL,
        email            VARCHAR(320) NOT NULL,
        phone            VARCHAR(50),
        workshop_type    VARCHAR(50) NOT NULL,
        preferred_month  VARCHAR(50),
        group_size       INTEGER,
        occasion         VARCHAR(255),
        message          TEXT,
        status           VARCHAR(30) NOT NULL DEFAULT 'new',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sol_wi_status_created_idx
        ON sol_workshop_inquiries (status, created_at DESC)
    `);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_workshop_inquiries`);
  },
};