/**
 * Sugar Oak Lane — Add flower_name, flower_type, dahlia_type columns to sol_products.
 * Enables the Floret-style sidebar filtering on the main /shop page.
 */
module.exports = {
  name: 'add_sol_product_filter_fields',
  up: async (client) => {
    await client.query(`
      ALTER TABLE sol_products
        ADD COLUMN IF NOT EXISTS flower_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS flower_type VARCHAR(100),
        ADD COLUMN IF NOT EXISTS dahlia_type VARCHAR(100)
    `);

    // Seed & Bulb products — set flower_name + flower_type
    await client.query(`UPDATE sol_products SET flower_name='Sweet Peas', flower_type='Annual' WHERE slug='sweet-pea-seeds'`);
    await client.query(`UPDATE sol_products SET flower_name='Zinnias', flower_type='Annual' WHERE slug='zinnia-seeds-benarys-giant'`);
    await client.query(`UPDATE sol_products SET flower_name='Cosmos', flower_type='Annual' WHERE slug='cosmos-seeds-double-click'`);
    await client.query(`UPDATE sol_products SET flower_name='Ranunculus', flower_type='Annual' WHERE slug='ranunculus-corms-pastel'`);
    await client.query(`UPDATE sol_products SET flower_name='Dahlias', flower_type='Focal Flower', dahlia_type='Mixed' WHERE slug='dahlia-tubers-mixed'`);

    // Plant nursery products
    await client.query(`UPDATE sol_products SET flower_name='Snapdragons', flower_type='Annual' WHERE slug='snapdragon-starts'`);
    await client.query(`UPDATE sol_products SET flower_name='Dahlias', flower_type='Focal Flower', dahlia_type='Mixed' WHERE slug='dahlia-plugs'`);
    await client.query(`UPDATE sol_products SET flower_name='Zinnias', flower_type='Annual' WHERE slug='zinnia-starts-6-pack'`);
  },

  down: async (client) => {
    await client.query(`
      ALTER TABLE sol_products
        DROP COLUMN IF EXISTS flower_name,
        DROP COLUMN IF EXISTS flower_type,
        DROP COLUMN IF EXISTS dahlia_type
    `);
  }
};
