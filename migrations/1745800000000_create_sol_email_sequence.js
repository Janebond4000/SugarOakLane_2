module.exports = {
  name: '1745800000000_create_sol_email_sequence',

  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_email_sequence (
        id               SERIAL PRIMARY KEY,
        subscriber_email VARCHAR(320) NOT NULL REFERENCES sol_subscribers(email) ON DELETE CASCADE,
        sequence_step    SMALLINT NOT NULL CHECK (sequence_step IN (1, 2, 3)),
        scheduled_for    TIMESTAMPTZ NOT NULL,
        sent_at          TIMESTAMPTZ,
        status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sol_email_sequence_pending_idx
      ON sol_email_sequence (scheduled_for, status)
      WHERE status = 'pending'`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS sol_email_sequence_unique_step_idx
      ON sol_email_sequence (subscriber_email, sequence_step)`);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_email_sequence`);
  },
};
