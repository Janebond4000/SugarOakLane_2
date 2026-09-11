/**
 * Merge the one manual/source duplicate discovered after the 399 selector items
 * were combined with the four manual sunflower additions.
 * Canonical consumer-facing name retained: ProCut White Nite Sunflower.
 */
module.exports = {
  name: 'dedupe_procut_white_nite',
  up: async (client) => {
    const keep = await client.query(`SELECT * FROM sol_products WHERE name = 'ProCut White Nite Sunflower' LIMIT 1`);
    const dup = await client.query(`SELECT * FROM sol_products WHERE name = 'Sunflower ProCut White Nite' LIMIT 1`);

    if (keep.rows.length && dup.rows.length) {
      const k = keep.rows[0];
      const d = dup.rows[0];
      await client.query(`
        UPDATE sol_products
        SET images = CASE
              WHEN (images IS NULL OR images = '[]'::jsonb) AND $1::jsonb IS NOT NULL THEN $1::jsonb
              ELSE images
            END,
            short_description = COALESCE(NULLIF(short_description,''), $2),
            description = COALESCE(NULLIF(description,''), $3),
            seed_details = COALESCE(seed_details,'{}'::jsonb) || COALESCE($4::jsonb,'{}'::jsonb),
            updated_at = NOW()
        WHERE id = $5
      `, [JSON.stringify(d.images || []), d.short_description || null, d.description || null, JSON.stringify(d.seed_details || {}), k.id]);
      await client.query(`DELETE FROM sol_products WHERE id = $1`, [d.id]);
    }

    const count = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM sol_products
      WHERE seed_details->>'catalog_status' = 'staging_ready'
        AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
    `);
    console.log('[migration] unique staging catalog count after White Nite dedupe:', count.rows[0]?.count);
  },
  down: async () => {
    // Intentional no-op. Reintroducing a known duplicate is not desirable.
  }
};
