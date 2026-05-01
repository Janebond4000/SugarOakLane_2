module.exports = {
  name: 'add_seed_product_fields',
  up: async (client) => {
    await client.query(`
      ALTER TABLE sol_products
        ADD COLUMN IF NOT EXISTS packet_quantity INTEGER,
        ADD COLUMN IF NOT EXISTS seed_details JSONB
    `);
    console.log('Added packet_quantity and seed_details columns to sol_products');
  },
  down: async (client) => {
    await client.query(`
      ALTER TABLE sol_products
        DROP COLUMN IF EXISTS packet_quantity,
        DROP COLUMN IF EXISTS seed_details
    `);
  }
};
