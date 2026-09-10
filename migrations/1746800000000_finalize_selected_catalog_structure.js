/**
 * Finalize the selected Sugar Oak Lane Farm & Garden catalog structure.
 *
 * This migration does NOT claim cultivar-specific color/form facts we have not
 * independently verified. It makes the 403 selected products usable in staging:
 * stable SKUs, sell units, working retail prices, clean original copy, and
 * visible-but-unavailable status so no product can be purchased prematurely.
 */
module.exports = {
  name: 'finalize_selected_catalog_structure',
  up: async (client) => {
    await client.query(`
      ALTER TABLE sol_products
        ADD COLUMN IF NOT EXISTS sku VARCHAR(80),
        ADD COLUMN IF NOT EXISTS unit_label VARCHAR(80),
        ADD COLUMN IF NOT EXISTS pack_quantity INTEGER,
        ADD COLUMN IF NOT EXISTS product_family VARCHAR(80),
        ADD COLUMN IF NOT EXISTS publish_ready BOOLEAN DEFAULT FALSE
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS sol_products_sku_unique ON sol_products(sku) WHERE sku IS NOT NULL`);

    // Seeds — consumer-facing packet price. Exact seed counts remain a variety-level
    // specification to fill only where supplier/lot information supports it.
    await client.query(`
      UPDATE sol_products
      SET sku = COALESCE(sku, 'SOL-SEED-' || UPPER(SUBSTRING(MD5(slug),1,8))),
          unit_label = 'seed packet',
          pack_quantity = 1,
          product_family = 'Flower Seeds',
          price = 3.95,
          price_label = '$3.95',
          availability = 'coming_soon',
          stock_status = 'sold_out',
          track_inventory = TRUE,
          low_stock_threshold = 5,
          is_active = TRUE,
          publish_ready = FALSE,
          short_description = CONCAT(name, ' is a curated Sugar Oak Lane flower seed for home gardens and cutting gardens.'),
          description = CONCAT(
            name,
            ' is part of the Sugar Oak Lane Farm & Garden seed collection. We select varieties for gardeners who want beautiful flowers without needing professional-grower experience. Each packet will ship with clear variety-specific sowing and growing guidance once the final seed lot is assigned.'
          ),
          seo_title = LEFT(CONCAT(name, ' Seeds | Sugar Oak Lane'),120),
          seo_description = LEFT(CONCAT('Shop ', name, ' flower seed from Sugar Oak Lane. Curated for home and cutting gardens with practical growing guidance from our Georgia flower farm.'),220),
          seed_details = COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object(
            'catalog_status','staging_ready',
            'content_status','family_copy_complete_variety_facts_pending',
            'image_status','original_image_needed',
            'pricing_status','base_price_set',
            'pricing_tier','seed_standard',
            'unit','packet',
            'pack_quantity',1,
            'inventory_status','awaiting_lot_assignment',
            'rights_review','required_before_live_sale'
          ),
          updated_at = NOW()
      WHERE seed_details->>'catalog_status' IN ('selected_draft','staging_ready')
        AND subcategory = 'flower-seeds'
    `);

    // Dahlias — $9.95 is the staging/base retail tier. Cost/rarity review may move
    // individual cultivars to specialty/premium tiers before public launch.
    await client.query(`
      UPDATE sol_products
      SET sku = COALESCE(sku, 'SOL-DAH-' || UPPER(SUBSTRING(MD5(slug),1,8))),
          unit_label = '1 tuber',
          pack_quantity = 1,
          product_family = 'Dahlia Tubers',
          price = 9.95,
          price_label = '$9.95',
          availability = 'coming_soon',
          stock_status = 'sold_out',
          track_inventory = TRUE,
          low_stock_threshold = 3,
          is_active = TRUE,
          publish_ready = FALSE,
          flower_name = COALESCE(flower_name,'Dahlias'),
          flower_type = 'Dahlia',
          short_description = CONCAT(name, ' is a curated Sugar Oak Lane dahlia tuber for home and cutting gardens.'),
          description = CONCAT(
            name,
            ' is part of the Sugar Oak Lane dahlia collection. Sold as one viable tuber once inventory is received and inspected. We will add verified variety-specific bloom form, color, height and growing notes before this cultivar is released for purchase.'
          ),
          seo_title = LEFT(CONCAT(name, ' Dahlia Tuber | Sugar Oak Lane'),120),
          seo_description = LEFT(CONCAT('Shop ', name, ' dahlia tubers from Sugar Oak Lane. Curated for beautiful home and cutting gardens with practical growing guidance.'),220),
          seed_details = COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object(
            'catalog_status','staging_ready',
            'content_status','family_copy_complete_variety_facts_pending',
            'image_status','original_image_needed',
            'pricing_status','base_tier_set_cost_review_required',
            'pricing_tier','dahlia_standard',
            'unit','tuber',
            'pack_quantity',1,
            'inventory_status','awaiting_tuber_inventory',
            'rights_review','required_before_live_sale'
          ),
          updated_at = NOW()
      WHERE seed_details->>'catalog_status' IN ('selected_draft','staging_ready')
        AND subcategory = 'dahlias'
    `);

    // Ranunculus — user-approved working price retained as a 10-corm pack.
    await client.query(`
      UPDATE sol_products
      SET sku = COALESCE(sku, 'SOL-RAN-' || UPPER(SUBSTRING(MD5(slug),1,8))),
          unit_label = '10-corm pack',
          pack_quantity = 10,
          product_family = 'Ranunculus Corms',
          price = 14.95,
          price_label = '$14.95',
          availability = 'coming_soon',
          stock_status = 'sold_out',
          track_inventory = TRUE,
          low_stock_threshold = 3,
          is_active = TRUE,
          publish_ready = FALSE,
          flower_name = COALESCE(flower_name,'Ranunculus'),
          flower_type = 'Corm',
          short_description = CONCAT(name, ' is a curated Sugar Oak Lane ranunculus selection sold as a 10-corm pack.'),
          description = CONCAT(
            name,
            ' is part of the Sugar Oak Lane ranunculus collection. Each retail unit is planned as a 10-corm pack for spring color and cutting gardens. Variety-specific planting timing and verified characteristics will be added before release.'
          ),
          seo_title = LEFT(CONCAT(name, ' Ranunculus Corms | Sugar Oak Lane'),120),
          seo_description = LEFT(CONCAT('Shop ', name, ' ranunculus corms from Sugar Oak Lane in a planned 10-corm pack, with practical growing guidance for home gardeners.'),220),
          seed_details = COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object(
            'catalog_status','staging_ready',
            'content_status','family_copy_complete_variety_facts_pending',
            'image_status','original_image_needed',
            'pricing_status','pack_price_set_cost_review_required',
            'pricing_tier','ranunculus_10_pack',
            'unit','corm',
            'pack_quantity',10,
            'inventory_status','awaiting_corm_inventory',
            'rights_review','required_before_live_sale'
          ),
          updated_at = NOW()
      WHERE seed_details->>'catalog_status' IN ('selected_draft','staging_ready')
        AND subcategory = 'ranunculus-corms'
    `);

    const check = await client.query(`
      SELECT subcategory,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE sku IS NOT NULL)::int AS with_sku,
             COUNT(*) FILTER (WHERE is_active = TRUE)::int AS visible_in_staging,
             COUNT(*) FILTER (WHERE publish_ready = TRUE)::int AS publish_ready
      FROM sol_products
      WHERE seed_details->>'catalog_status' = 'staging_ready'
      GROUP BY subcategory ORDER BY subcategory
    `);
    console.log('[migration] finalized staging catalog', check.rows);
  },
  down: async (client) => {
    await client.query(`
      UPDATE sol_products
      SET is_active=FALSE,
          availability='out_of_stock',
          stock_status='sold_out',
          publish_ready=FALSE,
          seed_details=COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object('catalog_status','selected_draft')
      WHERE seed_details->>'catalog_status' = 'staging_ready'
    `);
  }
};
