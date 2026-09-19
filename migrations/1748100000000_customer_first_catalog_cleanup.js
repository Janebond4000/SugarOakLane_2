/**
 * Customer-first catalog cleanup.
 *
 * Keeps verified variety facts while removing region-specific and grower-to-grower
 * language from the public catalog. Product pages should read like an accessible
 * flower library: beautiful description first, concise details second, practical
 * growing notes last.
 */
module.exports = {
  name: 'customer_first_catalog_cleanup',
  up: async (client) => {
    // Remove zone/regional fields from structured product details so they cannot
    // be surfaced by current or future storefront templates.
    await client.query(`
      UPDATE sol_products
      SET seed_details = (
            COALESCE(seed_details, '{}'::jsonb)
            - 'hardiness_zones'
            - 'hardiness_zone'
            - 'usda_zone'
            - 'usda_zones'
            - 'zone'
            - 'zones'
            - 'zone_notes'
            - 'regional_notes'
            - 'regional_growing_notes'
            - 'grower_notes'
          ) || jsonb_build_object(
            'content_style', 'consumer_flower_library',
            'customer_audience', 'home_gardeners_and_flower_lovers'
          ),
          updated_at = NOW()
      WHERE is_active = TRUE
    `);

    // Clean customer-facing text without flattening genuine variety facts.
    await client.query(`
      UPDATE sol_products
      SET short_description = BTRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REPLACE(REPLACE(REPLACE(REPLACE(
                  COALESCE(short_description,''),
                  'professional growers','gardeners'),
                  'professional grower','gardener'),
                  'flower farmers','gardeners'),
                  'flower farmer','gardener'),
                '(USDA\\s+)?[Hh]ardiness\\s+[Zz]ones?[^.;]*[.;]?', '', 'gi'
              ),
              '[Zz]ones?\\s+[0-9][0-9A-Ba-b,–\\- ]*', '', 'g'
            )
          ),
          description = BTRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                  COALESCE(description,''),
                  'professional growers','gardeners'),
                  'professional grower','gardener'),
                  'flower farmers','gardeners'),
                  'flower farmer','gardener'),
                  'from our Georgia flower farm','from Sugar Oak Lane'),
                '(USDA\\s+)?[Hh]ardiness\\s+[Zz]ones?[^.;]*[.;]?', '', 'gi'
              ),
              '[Zz]ones?\\s+[0-9][0-9A-Ba-b,–\\- ]*', '', 'g'
            )
          ),
          seo_description = BTRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                  COALESCE(seo_description,''),
                  'professional growers','gardeners'),
                  'professional grower','gardener'),
                  'flower farmers','gardeners'),
                  'flower farmer','gardener'),
                  'from our Georgia flower farm','from Sugar Oak Lane'),
                '(USDA\\s+)?[Hh]ardiness\\s+[Zz]ones?[^.;]*[.;]?', '', 'gi'
              ),
              '[Zz]ones?\\s+[0-9][0-9A-Ba-b,–\\- ]*', '', 'g'
            )
          ),
          updated_at = NOW()
      WHERE is_active = TRUE
    `);

    // Replace unfinished internal/staging prose with clean customer-facing
    // family copy, while leaving source-backed variety copy untouched.
    await client.query(`
      UPDATE sol_products
      SET short_description = CASE
            WHEN subcategory = 'flower-seeds'
              THEN CONCAT(name, ' flower seed for colorful gardens and fresh-cut bouquets.')
            WHEN subcategory = 'dahlias'
              THEN CONCAT(name, ' dahlia tuber for distinctive summer blooms and beautiful bouquets.')
            WHEN subcategory = 'ranunculus-corms'
              THEN CONCAT(name, ' ranunculus corms for layered spring color and elegant cut flowers.')
            ELSE short_description
          END,
          description = CASE
            WHEN subcategory = 'flower-seeds'
              THEN CONCAT(name, ' is part of the Sugar Oak Lane flower seed collection. This listing focuses on the variety itself, with practical sowing, spacing, maturity, and garden notes included as verified.')
            WHEN subcategory = 'dahlias'
              THEN CONCAT(name, ' is part of the Sugar Oak Lane dahlia collection. Cultivar details such as color, flower form, bloom size, height, and growing notes are included as verified.')
            WHEN subcategory = 'ranunculus-corms'
              THEN CONCAT(name, ' is part of the Sugar Oak Lane ranunculus collection, chosen for richly layered spring blooms. Variety details and practical planting notes are included as verified.')
            ELSE description
          END,
          seed_details = COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object(
            'content_status','consumer_family_copy',
            'content_style','consumer_flower_library'
          ),
          updated_at = NOW()
      WHERE is_active = TRUE
        AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
        AND COALESCE(seed_details->>'content_status','') IN (
          '',
          'working_copy',
          'family_copy_complete_variety_facts_pending'
        )
    `);

    // Mark products that still need photography; the storefront now renders a
    // branded wireframe placeholder for these records.
    await client.query(`
      UPDATE sol_products
      SET seed_details = COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object(
            'image_status','wireframe_placeholder'
          ),
          updated_at = NOW()
      WHERE is_active = TRUE
        AND (
          images IS NULL
          OR images = '[]'::jsonb
          OR jsonb_array_length(COALESCE(images,'[]'::jsonb)) = 0
        )
    `);

    const report = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_products,
        COUNT(*) FILTER (
          WHERE is_active = TRUE
            AND (images IS NULL OR images = '[]'::jsonb OR jsonb_array_length(COALESCE(images,'[]'::jsonb)) = 0)
        )::int AS wireframe_products,
        COUNT(*) FILTER (
          WHERE is_active = TRUE
            AND (
              COALESCE(short_description,'') ILIKE '%professional grower%'
              OR COALESCE(description,'') ILIKE '%professional grower%'
              OR COALESCE(short_description,'') ILIKE '%flower farmer%'
              OR COALESCE(description,'') ILIKE '%flower farmer%'
            )
        )::int AS grower_language_remaining
      FROM sol_products
    `);
    console.log('[migration] customer-first catalog cleanup', report.rows[0]);
  },
  down: async () => {}
};
