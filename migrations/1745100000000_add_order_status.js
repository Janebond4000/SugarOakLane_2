/**
 * Add order_status column for fulfillment pipeline: new → processing → shipped → delivered
 * Separate from tracker_stage (delivery pipeline) and status (payment status).
 */
module.exports = {
  name: 'add_order_status',
  up: async (client) => {
    await client.query(`
      ALTER TABLE sol_orders
        ADD COLUMN IF NOT EXISTS order_status VARCHAR(30) DEFAULT 'new'
    `);

    // Back-fill: confirmed/pending orders get 'new', delivered get 'delivered'
    await client.query(`
      UPDATE sol_orders SET order_status = 'delivered' WHERE status = 'delivered' AND order_status = 'new'
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS sol_orders_order_status_idx ON sol_orders (order_status)`);
  },

  down: async (client) => {
    await client.query(`DROP INDEX IF EXISTS sol_orders_order_status_idx`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS order_status`);
  },
};
