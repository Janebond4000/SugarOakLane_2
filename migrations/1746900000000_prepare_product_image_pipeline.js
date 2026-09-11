/**
 * Queue all 403 staging-ready Farm & Garden products for original imagery.
 * No images are published by this migration; it only assigns deterministic
 * media keys/styles/batches so image production can be automated safely.
 */
module.exports = {
  name: 'prepare_product_image_pipeline',
  up: async (client) => {
    await client.query(`
      WITH ranked AS (
        SELECT id, sku, name, subcategory,
               ROW_NUMBER() OVER (PARTITION BY subcategory ORDER BY name, id) AS rn
        FROM sol_products
        WHERE seed_details->>'catalog_status' = 'staging_ready'
          AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
      )
      UPDATE sol_products sp
      SET seed_details = COALESCE(sp.seed_details,'{}'::jsonb) || jsonb_build_object(
            'image_status','queued',
            'image_style', CASE
              WHEN r.subcategory = 'dahlias' THEN 'white-studio-botanical'
              WHEN r.subcategory = 'ranunculus-corms' THEN 'white-studio-botanical'
              WHEN LOWER(r.name) LIKE '%sunflower%' THEN 'sunflower-natural-garden-approved-style'
              ELSE 'natural-garden-catalog'
            END,
            'image_target_key', CONCAT('catalog/', LOWER(r.sku), '/primary.webp'),
            'image_batch', CASE
              WHEN r.subcategory = 'dahlias' THEN CONCAT('DAH-', LPAD(CEIL(r.rn / 20.0)::int::text, 2, '0'))
              WHEN r.subcategory = 'flower-seeds' THEN CONCAT('SEED-', LPAD(CEIL(r.rn / 20.0)::int::text, 2, '0'))
              ELSE 'RAN-01'
            END,
            'image_rights','original-ai-or-owned-only',
            'image_review','required-before-publish'
          ),
          updated_at = NOW()
      FROM ranked r
      WHERE sp.id = r.id
    `);

    const check = await client.query(`
      SELECT
        seed_details->>'image_style' AS image_style,
        COUNT(*)::int AS count,
        COUNT(DISTINCT seed_details->>'image_batch')::int AS batches
      FROM sol_products
      WHERE seed_details->>'catalog_status' = 'staging_ready'
        AND seed_details->>'image_status' = 'queued'
      GROUP BY 1 ORDER BY 1
    `);
    console.log('[migration] product image pipeline queued', check.rows);
  },
  down: async (client) => {
    await client.query(`
      UPDATE sol_products
      SET seed_details = seed_details
        - 'image_style'
        - 'image_target_key'
        - 'image_batch'
        - 'image_rights'
        - 'image_review'
        || jsonb_build_object('image_status','original_image_needed'),
        updated_at = NOW()
      WHERE seed_details->>'catalog_status' = 'staging_ready'
    `);
  }
};
