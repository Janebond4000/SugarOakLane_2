/**
 * Normalize customer-facing product copy and imagery direction.
 *
 * Goals:
 * - Keep product copy about the variety, not about a presumed buyer.
 * - Remove Georgia-specific language from product/SEO copy.
 * - Preserve legitimate product-use language such as strong stems or cutting quality.
 * - Change the entire product-image system to sharply focused botanical portraits
 *   with soft, blurred farm/garden backgrounds instead of white studio backdrops.
 */
module.exports = {
  name: 'neutralize_product_copy_and_image_style',
  up: async (client) => {
    // 1) Replace generic family-level staging copy with neutral product-first text.
    await client.query(`
      UPDATE sol_products
      SET short_description = CASE
            WHEN subcategory='flower-seeds' THEN CONCAT(name, ' flower seed from the Sugar Oak Lane collection.')
            WHEN subcategory='dahlias' THEN CONCAT(name, ' dahlia tuber from the Sugar Oak Lane collection.')
            WHEN subcategory='ranunculus-corms' THEN CONCAT(name, ' ranunculus corms from the Sugar Oak Lane collection.')
            ELSE short_description
          END,
          description = CASE
            WHEN subcategory='flower-seeds' THEN CONCAT(
              name,
              ' is part of the Sugar Oak Lane flower seed collection. Verified variety-specific characteristics, packet details, sowing guidance, spacing, maturity, and harvest notes will be included before release.'
            )
            WHEN subcategory='dahlias' THEN CONCAT(
              name,
              ' is part of the Sugar Oak Lane dahlia collection. Each retail unit is planned as one viable tuber. Verified cultivar-specific color, bloom form, bloom size, height, and growing notes will be included before release.'
            )
            WHEN subcategory='ranunculus-corms' THEN CONCAT(
              name,
              ' is part of the Sugar Oak Lane ranunculus collection. Each retail unit is planned as a 10-corm pack. Verified variety-specific color, height, planting, and growing details will be included before release.'
            )
            ELSE description
          END,
          updated_at = NOW()
      WHERE seed_details->>'catalog_status'='staging_ready'
        AND COALESCE(seed_details->>'content_status','')='family_copy_complete_variety_facts_pending'
    `);

    // 2) Scrub audience/location assumptions from any refined copy already loaded.
    await client.query(`
      UPDATE sol_products
      SET short_description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            COALESCE(short_description,''),
            ' for home and cutting gardens',''),
            ' for home gardens',''),
            ' for gardeners',''),
            ' for professional growers',''),
            ' from our Georgia flower farm',''),
          description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            COALESCE(description,''),
            'home and cutting gardens','gardens and fresh cutting'),
            'home cutting gardens','cutting gardens'),
            'home gardens','gardens'),
            'professional growers','growers'),
            'professional-grower experience','specialized experience'),
            'our Georgia flower farm','Sugar Oak Lane'),
            'flower farmers','growers'),
          updated_at = NOW()
      WHERE seed_details->>'catalog_status'='staging_ready'
    `);

    // 3) Make SEO product-first and location-neutral for every staging-ready product.
    await client.query(`
      UPDATE sol_products
      SET seo_title = CASE
            WHEN subcategory='flower-seeds' THEN LEFT(CONCAT(name, ' Seeds | Sugar Oak Lane'),120)
            WHEN subcategory='dahlias' THEN LEFT(CONCAT(name, ' Dahlia Tuber | Sugar Oak Lane'),120)
            WHEN subcategory='ranunculus-corms' THEN LEFT(CONCAT(name, ' Ranunculus Corms | Sugar Oak Lane'),120)
            ELSE seo_title
          END,
          seo_description = CASE
            WHEN subcategory='flower-seeds' THEN LEFT(CONCAT(
              name,
              ' flower seeds from Sugar Oak Lane. See verified color, plant height, bloom details, sowing, germination, spacing, maturity, and harvest information.'
            ),220)
            WHEN subcategory='dahlias' THEN LEFT(CONCAT(
              name,
              ' dahlia tuber from Sugar Oak Lane. See verified color, bloom form, bloom size, plant height, growing details, and cultivar notes.'
            ),220)
            WHEN subcategory='ranunculus-corms' THEN LEFT(CONCAT(
              name,
              ' ranunculus corms from Sugar Oak Lane. 10-corm pack with verified color, plant height, planting, growing, and harvest details.'
            ),220)
            ELSE seo_description
          END,
          updated_at = NOW()
      WHERE seed_details->>'catalog_status'='staging_ready'
    `);

    // 4) Apply the approved catalog-wide photographic direction.
    await client.query(`
      UPDATE sol_products
      SET seed_details = COALESCE(seed_details,'{}'::jsonb) || jsonb_build_object(
            'image_style', CASE
              WHEN LOWER(name) LIKE '%sunflower%' THEN 'bright-blurred-farm-garden-botanical'
              ELSE 'soft-blurred-farm-garden-botanical'
            END,
            'image_background','softly blurred flower farm or garden; natural depth of field',
            'image_subject','variety bloom sharply focused; botanically faithful; natural light; no text; no hands; no packaging',
            'image_review','required-before-publish'
          ) || CASE
            WHEN seed_details ? 'image_prompt_reference' THEN
              jsonb_build_object(
                'image_prompt_reference',
                REPLACE(REPLACE(REPLACE(
                  seed_details->>'image_prompt_reference',
                  'white studio botanical portrait',
                  'sharp botanical portrait with a softly blurred flower-farm or garden background, natural light, shallow depth of field'),
                  'natural cutting-garden catalog photograph',
                  'natural botanical portrait with a softly blurred flower-farm or garden background, shallow depth of field'),
                  'white studio',
                  'softly blurred flower-farm or garden background'
                )
              )
            ELSE '{}'::jsonb
          END,
          updated_at = NOW()
      WHERE seed_details->>'catalog_status'='staging_ready'
        AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
    `);

    const check = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE seo_description ILIKE '%Georgia%')::int AS seo_georgia_mentions,
        COUNT(*) FILTER (WHERE description ILIKE '%flower farmer%')::int AS flower_farmer_mentions,
        COUNT(*) FILTER (WHERE description ILIKE '%professional grower%')::int AS professional_grower_mentions,
        COUNT(*) FILTER (WHERE seed_details->>'image_style' LIKE '%blurred-farm-garden%')::int AS blurred_background_ready
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
    `);
    console.log('[migration] neutral product copy + image style applied', check.rows[0]);
  },
  down: async () => {}
};
