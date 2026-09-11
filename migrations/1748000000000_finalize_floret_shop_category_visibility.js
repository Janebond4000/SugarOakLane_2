module.exports = {
  name: 'finalize_floret_shop_category_visibility',
  up: async (client) => {
    // The old combined root is no longer used after moving to Seeds / Dahlias / Specialty Bulbs.
    await client.query(`UPDATE categories SET is_active=FALSE, sidebar_visible=FALSE WHERE slug='seeds-bulbs'`);

    // Keep public copy Sugar Oak Lane-branded even though the taxonomy structure follows the Floret Library.
    await client.query(`UPDATE categories SET description='Flower seeds organized into useful plant and growing collections.' WHERE slug='seeds'`);
    await client.query(`UPDATE categories SET description='Dahlia tubers organized by bloom form.' WHERE slug='dahlias'`);
    await client.query(`UPDATE categories SET description='Specialty bulbs and corms selected for beautiful seasonal gardens.' WHERE slug='specialty-bulbs'`);

    const roots = (await client.query(`SELECT id,slug FROM categories WHERE slug IN ('seeds','dahlias','specialty-bulbs')`)).rows;
    const rootIds = roots.map(r=>r.id);
    if (rootIds.length) {
      // Hide empty child categories from the staging sidebar while preserving them for WooCommerce migration.
      await client.query(`
        UPDATE categories c
        SET sidebar_visible = EXISTS (
          SELECT 1 FROM sol_products p
          WHERE p.seed_details->>'catalog_status'='staging_ready'
            AND COALESCE(p.categories,'[]'::jsonb) ? c.slug
        )
        WHERE c.parent_id = ANY($1::int[])
      `,[rootIds]);
      await client.query(`UPDATE categories SET sidebar_visible=TRUE,is_active=TRUE WHERE id=ANY($1::int[])`,[rootIds]);
    }

    const report = await client.query(`
      SELECT p.name parent, c.name child, c.slug, c.sidebar_visible,
             (SELECT COUNT(*)::int FROM sol_products sp WHERE sp.seed_details->>'catalog_status'='staging_ready' AND COALESCE(sp.categories,'[]'::jsonb) ? c.slug) product_count
      FROM categories c JOIN categories p ON p.id=c.parent_id
      WHERE p.slug IN ('seeds','dahlias','specialty-bulbs')
      ORDER BY p.sort_order,c.sort_order,c.name
    `);
    console.log('[floret-category-visibility]', report.rows);
  },
  down: async () => {}
};
