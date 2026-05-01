module.exports = {
  name: '1746500000000_create_sol_subscription_inquiries',

  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sol_subscription_inquiries (
        id               SERIAL PRIMARY KEY,
        plan_type        TEXT NOT NULL CHECK (plan_type IN ('weekly', 'biweekly', 'monthly')),
        customer_name    TEXT NOT NULL,
        customer_email   TEXT NOT NULL,
        customer_phone   TEXT,
        recipient_name   TEXT,
        recipient_phone  TEXT,
        delivery_address TEXT,
        delivery_day     TEXT CHECK (delivery_day IN ('tuesday', 'thursday')),
        start_date       DATE,
        delivery_notes   TEXT,
        is_gift          BOOLEAN NOT NULL DEFAULT false,
        card_message     TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sol_si_plan_created_idx
        ON sol_subscription_inquiries (plan_type, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sol_si_email_idx
        ON sol_subscription_inquiries (customer_email)
    `);
  },

  down: async (client) => {
    await client.query(`DROP TABLE IF EXISTS sol_subscription_inquiries`);
  },
};
