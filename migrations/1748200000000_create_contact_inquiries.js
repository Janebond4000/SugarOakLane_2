/**
 * Persist customer contact messages so inquiries are never lost if outbound
 * email is temporarily unavailable.
 */
module.exports = {
  name: 'create_contact_inquiries',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_contact_inquiries (
        id          BIGSERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        email       VARCHAR(320) NOT NULL,
        subject     VARCHAR(80)  NOT NULL DEFAULT 'general',
        message     TEXT         NOT NULL,
        status      VARCHAR(30)  NOT NULL DEFAULT 'new',
        source      VARCHAR(80)  NOT NULL DEFAULT 'website',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_contact_inquiries_created_idx ON sol_contact_inquiries(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_contact_inquiries_status_idx ON sol_contact_inquiries(status)`);
  },
  down: async () => {}
};
