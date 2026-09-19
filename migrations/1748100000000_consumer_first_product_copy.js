/**
 * Sugar Oak Lane consumer-first catalog cleanup.
 *
 * Keeps verified variety facts while removing audience assumptions and
 * region-specific/B2B phrasing from public product copy. Detailed horticultural
 * facts remain in seed_details for internal use; customer-facing templates decide
 * which fields to display.
 */
module.exports = {
  name: 'consumer_first_product_copy',
  up: async (client) => {
    // Remove recurring staging language and grower-to-grower phrasing without
    // flattening the useful variety-specific descriptions already written.
    await client.query(`
      UPDATE sol_products
      SET
        short_description = TRIM(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(COALESCE(short_description,''), '\\s+for professional growers\\b', '', 'gi'),
                '\\s+for flower farmers\\b', '', 'gi'
              ),
              '\\s+for growers\\b', '', 'gi'
            ),
            '\\s+from our Georgia flower farm\\b', '', 'gi'
          )
        ),
        description = TRIM(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(COALESCE(description,''), 'Georgia[’''s]*\\s+(Zone\\s*)?7b\\s*[/&-]\\s*8a', '', 'gi'),
                  'for professional growers', 'for gardeners', 'gi'
                ),
                'for flower farmers', 'for gardeners', 'gi'
              ),
              'professional-grower experience', 'specialized growing experience', 'gi'
            ),
            'from our Georgia flower farm', 'from Sugar Oak Lane', 'gi'
          )
        ),
        seo_description = TRIM(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(COALESCE(seo_description,''), 'Georgia[’''s]*\\s+(Zone\\s*)?7b\\s*[/&-]\\s*8a', '', 'gi'),
                'for professional growers', 'for gardeners', 'gi'
              ),
              'for flower farmers', 'for gardeners', 'gi'
            ),
            'from our Georgia flower farm', 'from Sugar Oak Lane', 'gi'
          )
        ),
        updated_at = NOW()
      WHERE is_active = TRUE
    `);

    // Remove customer-facing hardiness-zone prose stored in the generic growing
    // instruction text. The structured hardiness_zones value is intentionally
    // retained in seed_details for internal reference but is not rendered publicly.
    await client.query(`
      UPDATE sol_products
      SET
        seed_details = CASE
          WHEN COALESCE(seed_details->>'growing_instructions','') <> '' THEN
            jsonb_set(
              COALESCE(seed_details,'{}'::jsonb),
              '{growing_instructions}',
              to_jsonb(TRIM(
                regexp_replace(
                  seed_details->>'growing_instructions',
                  '([^.]*\\b(?:hardiness\\s+zone|zone\\s+[0-9])[^^.]*\\.?\\s*)',
                  '',
                  'gi'
                )
              )),
              true
            )
          ELSE COALESCE(seed_details,'{}'::jsonb)
        END,
        updated_at = NOW()
      WHERE is_active = TRUE
    `);

    const audit = await client.query(`
      SELECT
        COUNT(*)::int AS active_products,
        COUNT(*) FILTER (
          WHERE description ~* '(flower farmers|professional growers|Georgia.{0,20}Zone|Zone 7b|Zone 8a)'
             OR seo_description ~* '(flower farmers|professional growers|Georgia.{0,20}Zone|Zone 7b|Zone 8a)'
        )::int AS customer_copy_flags
      FROM sol_products
      WHERE is_active = TRUE
    `);
    console.log('[migration] consumer-first product copy audit', audit.rows[0]);
  },
  down: async () => {}
};
