/**
 * Add email tracking columns and tracking_number to sol_orders
 *
 * - confirmation_email_sent: true after customer confirmation email is sent
 * - status_email_sent: true after shipped/ready status email is sent
 * - tracking_number: carrier tracking number for shipped orders
 */
module.exports = {
  name: 'add_order_email_tracking',
  up: async (client) => {
    await client.query(`
      ALTER TABLE sol_orders
        ADD COLUMN IF NOT EXISTS confirmation_email_sent BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS status_email_sent        BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS tracking_number         VARCHAR(100)
    `);
  },
  down: async (client) => {
    await client.query(`
      ALTER TABLE sol_orders
        DROP COLUMN IF EXISTS tracking_number,
        DROP COLUMN IF EXISTS status_email_sent,
        DROP COLUMN IF EXISTS confirmation_email_sent
    `);
  },
};