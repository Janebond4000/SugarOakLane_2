/**
 * Add delivery_date, delivery_window, service_date, payment_session_id, payment_status
 * to the orders table for tiered delivery + Stripe payment support.
 */
module.exports = {
  name: 'update_orders_schema',
  up: async (client) => {
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date      DATE`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_window    VARCHAR(20)`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_date       DATE`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_session_id VARCHAR(255)`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status     VARCHAR(50) DEFAULT 'unpaid'`);
  },
  down: async (client) => {
    await client.query(`ALTER TABLE orders DROP COLUMN IF EXISTS delivery_date`);
    await client.query(`ALTER TABLE orders DROP COLUMN IF EXISTS delivery_window`);
    await client.query(`ALTER TABLE orders DROP COLUMN IF EXISTS service_date`);
    await client.query(`ALTER TABLE orders DROP COLUMN IF EXISTS payment_session_id`);
    await client.query(`ALTER TABLE orders DROP COLUMN IF EXISTS payment_status`);
  },
};
