const zlib = require('zlib');

const DATA = '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';

module.exports = {
  name: 'refine_dahlia_batch01',
  up: async (client) => {
    const items = JSON.parse(zlib.gunzipSync(Buffer.from(DATA, 'base64')).toString('utf8'));
    for (const p of items) {
      const seo = `Shop ${p.name} dahlia tuber from Sugar Oak Lane. ${p.color_notes}; ${p.form} form with ${p.bloom_size} blooms for home and cutting gardens.`.slice(0, 220);
      const details = {
        botanical_reference_status: 'source-backed',
        color_family: p.color_family,
        color_notes: p.color_notes,
        dahlia_form: p.form,
        bloom_size: p.bloom_size,
        site: 'full sun',
        days_to_maturity: '80–100 days',
        plant_spacing: '12–18 in',
        pinch: 'when plants reach about 12 in tall',
        source_reference_url: p.source_url,
        source_reference_image: p.source_image,
        source_reference_price: p.source_price,
        source_reference_only: true,
        image_prompt_reference: `${p.color_notes}; ${p.form}; ${p.bloom_size}; white studio botanical portrait`,
        content_status: 'variety_copy_ready',
        pricing_status: 'working_price_review_required'
      };
      await client.query(`
        UPDATE sol_products
        SET short_description = $1,
            description = $2,
            dahlia_type = $3,
            seo_title = $4,
            seo_description = $5,
            seed_details = COALESCE(seed_details,'{}'::jsonb) || $6::jsonb,
            updated_at = NOW()
        WHERE slug = $7
          AND seed_details->>'catalog_status' = 'staging_ready'
      `, [
        p.short,
        p.description,
        p.form,
        `${p.name} Dahlia Tuber | Sugar Oak Lane`.slice(0,120),
        seo,
        JSON.stringify(details),
        p.slug
      ]);
    }

    const check = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM sol_products
      WHERE seed_details->>'content_status' = 'variety_copy_ready'
        AND seed_details->>'image_batch' = 'DAH-01'
    `);
    console.log('[migration] dahlia batch 01 source-backed copy ready:', check.rows[0]?.count);
  },
  down: async (client) => {
    await client.query(`
      UPDATE sol_products
      SET seed_details = seed_details
        - 'botanical_reference_status' - 'color_family' - 'color_notes'
        - 'dahlia_form' - 'bloom_size' - 'site' - 'days_to_maturity'
        - 'plant_spacing' - 'pinch' - 'source_reference_url'
        - 'source_reference_image' - 'source_reference_price'
        - 'source_reference_only' - 'image_prompt_reference',
          updated_at = NOW()
      WHERE seed_details->>'image_batch' = 'DAH-01'
    `);
  }
};
