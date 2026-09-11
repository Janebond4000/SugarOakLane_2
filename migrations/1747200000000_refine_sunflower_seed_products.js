const zlib = require('zlib');

const DATA = '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';

module.exports = {
  name: 'refine_sunflower_seed_products',
  up: async (client) => {
    const items = JSON.parse(zlib.gunzipSync(Buffer.from(DATA,'base64')).toString('utf8'));
    for (const p of items) {
      const details = {
        botanical_reference_status: 'source-backed',
        botanical_name: 'Helianthus annuus',
        life_cycle: 'annual',
        light: 'full sun',
        seed_packet_quantity: 30,
        sow_depth: '1/2 in',
        germination: 'generally 7–14 days around 70–75°F',
        days_to_maturity: p.days,
        plant_height: p.height,
        bloom_size: p.bloom_size,
        growth_habit: p.habit,
        pollen: p.pollen,
        color_notes: p.color_notes,
        source_reference_url: p.source_url,
        source_reference_only: true,
        content_status: 'variety_copy_ready',
        pricing_status: 'working_price_review_required',
        image_prompt_reference: `${p.color_notes}; ${p.bloom_size}; ${p.habit}; natural cutting-garden catalog photograph`
      };
      const seo = `Grow ${p.name} from Sugar Oak Lane. 30-seed packet; ${p.color_notes}; ${p.days}; selected for beautiful home and cutting gardens.`.slice(0,220);
      await client.query(`
        UPDATE sol_products
        SET short_description=$1,
            description=$2,
            price=3.95,
            price_label='$3.95 · 30 seeds',
            seo_title=$3,
            seo_description=$4,
            seed_details=COALESCE(seed_details,'{}'::jsonb) || $5::jsonb,
            updated_at=NOW()
        WHERE slug=$6
          AND seed_details->>'catalog_status'='staging_ready'
      `,[p.short,p.description,`${p.name} Seeds | Sugar Oak Lane`.slice(0,120),seo,JSON.stringify(details),p.slug]);
    }
    const check=await client.query(`
      SELECT COUNT(*)::int AS count
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
        AND LOWER(name) LIKE '%sunflower%'
        AND seed_details->>'content_status'='variety_copy_ready'
    `);
    console.log('[migration] unique sunflower seed products refined:',check.rows[0]?.count);
  },
  down: async () => {}
};
