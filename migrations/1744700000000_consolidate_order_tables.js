/**
 * Consolidate orders + sol_orders into a single table (sol_orders).
 *
 * 1. Add missing columns to sol_orders so it can hold all order data.
 * 2. Migrate all rows from the old `orders` table into sol_orders.
 * 3. The `orders` table is kept (not dropped) so existing Stripe webhooks
 *    or external references continue to resolve — it just receives no new rows.
 */
module.exports = {
  name: 'consolidate_order_tables',

  up: async (client) => {
    // ── 1. Extend sol_orders with delivery-specific fields ─────────────────
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS tracker_stage   VARCHAR(50)  DEFAULT 'order_received'`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS recipient_name  VARCHAR(255)`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS delivery_date   DATE`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS delivery_window VARCHAR(40)`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS card_message    TEXT`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS product_name    VARCHAR(255)`);
    await client.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS tier            VARCHAR(50)`);

    await client.query(`CREATE INDEX IF NOT EXISTS sol_orders_tracker_stage_idx ON sol_orders (tracker_stage)`);

    // ── 2. Migrate rows from orders → sol_orders ───────────────────────────
    //    Rows that already exist in sol_orders (same order_number) are skipped.
    await client.query(`
      INSERT INTO sol_orders (
        order_number,
        status,
        fulfillment_type,
        tracker_stage,
        customer_name,
        customer_email,
        customer_phone,
        recipient_name,
        shipping_address,
        shipping_city,
        shipping_state,
        shipping_zip,
        delivery_zip,
        delivery_fee,
        total_price,
        delivery_date,
        delivery_window,
        card_message,
        product_name,
        tier,
        items,
        notes,
        metadata,
        created_at,
        updated_at
      )
      SELECT
        o.order_number,
        -- map status: 'pending' → 'pending_payment', keep others
        CASE WHEN o.status = 'pending' THEN 'pending_payment' ELSE o.status END,
        'delivery',
        COALESCE(o.tracker_stage, 'order_received'),
        o.sender_name,
        o.sender_email,
        o.sender_phone,
        o.recipient_name,
        o.delivery_address,
        o.delivery_city,
        COALESCE(o.delivery_state, 'GA'),
        o.delivery_zip,
        o.delivery_zip,
        COALESCE(o.delivery_fee, 0),
        COALESCE(o.total_price, 0),
        o.delivery_date,
        o.delivery_window,
        o.card_message,
        o.product_name,
        o.tier,
        -- wrap the single product as a cart item
        jsonb_build_array(
          jsonb_build_object(
            'name',      COALESCE(o.product_name, o.arrangement, 'Custom Arrangement'),
            'price',     COALESCE(o.price_product, o.total_price, 0),
            'quantity',  1,
            'slug',      COALESCE(o.product_slug, ''),
            'tier',      COALESCE(o.tier, 'standard')
          )
        ),
        o.notes,
        -- merge original metadata, add legacy flag
        COALESCE(o.metadata, '{}'::jsonb) || jsonb_build_object(
          '_legacy_orders_id', o.id,
          'express_fee',       COALESCE(o.express_fee, 0),
          'forwarding_address', o.forwarding_address
        ),
        o.created_at,
        o.updated_at
      FROM orders o
      WHERE o.order_number IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM sol_orders s WHERE s.order_number = o.order_number
        )
    `);
  },

  down: async (client) => {
    // Remove migrated legacy rows (identified by _legacy_orders_id metadata key)
    await client.query(`DELETE FROM sol_orders WHERE metadata ? '_legacy_orders_id'`);

    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS tracker_stage`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS recipient_name`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS delivery_date`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS delivery_window`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS card_message`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS product_name`);
    await client.query(`ALTER TABLE sol_orders DROP COLUMN IF EXISTS tier`);

    await client.query(`DROP INDEX IF EXISTS sol_orders_tracker_stage_idx`);
  },
};
