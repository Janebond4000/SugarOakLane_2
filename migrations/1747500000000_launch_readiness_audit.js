/**
 * One-time launch-readiness audit. No customer data is changed.
 * The migration only reports the exact catalog state in Railway deploy logs.
 */
module.exports = {
  name: 'launch_readiness_audit',
  up: async (client) => {
    const q = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE sku IS NOT NULL)::int AS with_sku,
        COUNT(*) FILTER (WHERE price IS NOT NULL)::int AS with_price,
        COUNT(*) FILTER (WHERE COALESCE(images,'[]'::jsonb) <> '[]'::jsonb)::int AS with_public_image,
        COUNT(*) FILTER (WHERE seed_details->>'image_status' IN ('approved','complete','published'))::int AS image_complete,
        COUNT(*) FILTER (WHERE seed_details->>'image_status'='queued')::int AS image_queued,
        COUNT(*) FILTER (WHERE seed_details->>'source_sync_status'='matched')::int AS source_matched,
        COUNT(*) FILTER (WHERE seed_details->>'source_sync_status'='unmatched')::int AS source_unmatched,
        COUNT(*) FILTER (WHERE seed_details->>'content_status'='variety_copy_ready')::int AS variety_copy_ready,
        COUNT(*) FILTER (WHERE seed_details->>'content_status'='family_copy_complete_variety_facts_pending')::int AS family_copy_only,
        COUNT(*) FILTER (WHERE COALESCE(publish_ready,false)=true)::int AS publish_ready,
        COUNT(*) FILTER (WHERE track_inventory=true AND stock_quantity IS NOT NULL)::int AS inventory_assigned,
        COUNT(*) FILTER (WHERE description ILIKE '%Georgia%' OR seo_description ILIKE '%Georgia%')::int AS georgia_product_mentions,
        COUNT(*) FILTER (WHERE description ILIKE '%flower farmer%' OR description ILIKE '%professional grower%' OR seo_description ILIKE '%flower farmer%' OR seo_description ILIKE '%professional grower%')::int AS buyer_profile_mentions
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
    `);
    const byType = await client.query(`
      SELECT subcategory,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE seed_details->>'content_status'='variety_copy_ready')::int AS variety_copy_ready,
             COUNT(*) FILTER (WHERE COALESCE(images,'[]'::jsonb) <> '[]'::jsonb)::int AS with_public_image,
             COUNT(*) FILTER (WHERE COALESCE(publish_ready,false)=true)::int AS publish_ready
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
      GROUP BY subcategory ORDER BY subcategory
    `);
    console.log('[launch-audit] catalog', q.rows[0]);
    console.log('[launch-audit] by type', byType.rows);
  },
  down: async () => {}
};
