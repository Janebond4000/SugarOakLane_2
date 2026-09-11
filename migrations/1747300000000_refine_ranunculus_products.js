const ITEMS = [
  {
    name: 'Ranunculus Amandine Barby', slug: 'ranunculus-amandine-barby',
    short: 'A premium bubblegum-pink ranunculus with large, wavy blooms on strong spring stems.',
    description: 'Amandine Barby is a high-impact pink ranunculus with layered, crepe-like petals and a clear bubblegum tone. The Amandine series is valued for larger flowers, sturdy stems, and improved tolerance of warming spring weather.',
    color_notes: 'clear bubblegum to warm pink, often with a pale creamy center', height: '10–15 in',
    source_url: 'https://library.floretflowers.com/products/ranunculus-amandine-barby',
    source_image: 'https://cdn.shopify.com/s/files/1/0645/7933/8468/products/Ranunclulus-AmadineBarbie_V3A5549-2_b51df2cf-9f11-45ce-bdec-f7baa42cf612.jpg?v=1671751436'
  },
  {
    name: 'Ranunculus Amandine Black', slug: 'ranunculus-amandine-black',
    short: 'A dramatic near-black ranunculus with velvety maroon petals and finely serrated edges.',
    description: 'Amandine Black brings extraordinary depth to the spring garden. Its rich maroon flowers can read nearly black, while lightly serrated petals soften the dark color with a delicate, textural edge.',
    color_notes: 'velvety deep maroon to near-black', height: '10–15 in',
    source_url: 'https://library.floretflowers.com/products/ranunculus-amandine-black',
    source_image: 'https://cdn.shopify.com/s/files/1/0645/7933/8468/products/Ranunclulus-AmadineBlack_V3A5534-2_7400a366-eb9a-42bd-8b37-975edc0a87d0.jpg?v=1671751440'
  },
  {
    name: 'Ranunculus Amandine Bonbon', slug: 'ranunculus-amandine-bonbon',
    short: 'A vivid magenta Amandine ranunculus with large, fully double, camellia-like blooms.',
    description: 'Amandine Bonbon is made for gardeners who want saturated spring color. Large, fully double blooms open in a glowing magenta tone, creating a rounded, camellia-like flower that stands out in both beds and cut arrangements.',
    color_notes: 'rich glowing magenta', height: '10–15 in',
    source_url: 'https://library.floretflowers.com/products/ranunculus-amandine-bonbon',
    source_image: 'https://cdn.shopify.com/s/files/1/0645/7933/8468/products/Ranunclulus-Bonbon_V3A5570_0c4a1f1b-6307-4596-b1da-7573007ec65e.jpg?v=1671751443'
  },
  {
    name: 'Ranunculus Amandine Chamallow', slug: 'ranunculus-amandine-chamallow',
    short: 'A romantic ranunculus blending blush, cream, and ballet-slipper pink in large fluffy blooms.',
    description: 'Amandine Chamallow has the soft, nuanced palette that makes ranunculus so useful for weddings and pastel gardens. Flowers range through blush, cream, and pale ballet pink on vigorous plants with strong stems.',
    color_notes: 'blush, cream, pale pink and ballet-slipper pink', height: '10–15 in',
    source_url: 'https://library.floretflowers.com/products/ranunculus-amandine-chamallow',
    source_image: 'https://cdn.shopify.com/s/files/1/0645/7933/8468/products/Ranunclulus-Chamallow_V3A6687-3_2a6d63f5-0187-47a0-9cfc-5e5e86cec064.jpg?v=1671751447'
  },
  {
    name: 'Ranunculus Amandine White', slug: 'ranunculus-amandine-white',
    short: 'A clean snow-white Amandine ranunculus with abundant, larger blooms for refined spring gardens.',
    description: 'Amandine White is an elegant pure-white ranunculus selected for abundant flowering and the larger bloom size associated with the Amandine series. Its crisp neutral color makes it especially versatile for cutting gardens and event-inspired plantings.',
    color_notes: 'clean snow white', height: '10–15 in',
    source_url: 'https://library.floretflowers.com/products/ranunculus-amandine-white',
    source_image: 'https://cdn.shopify.com/s/files/1/0645/7933/8468/products/Ranunclulus-White_V3A5603-2_5462935f-48c9-45da-84b2-65934a2ab3a3.jpg?v=1671751511'
  },
  {
    name: 'Ranunculus White', slug: 'ranunculus-white',
    short: 'A classic pure-white ranunculus with layered rose-like blooms and excellent spring cutting potential.',
    description: 'White ranunculus brings layer after layer of crisp white petals to the early garden, creating the look of a small garden rose on a slender stem. It is a versatile neutral for home cutting gardens, spring containers, and wedding-inspired palettes.',
    color_notes: 'pure white', height: '10–20 in',
    source_url: 'https://thefarmhouseflowerfarm.com/products/ranunculus-white',
    source_image: 'https://cdn.shopify.com/s/files/1/0840/9078/1990/products/IMG_7503.jpg?v=1705479413'
  }
];

module.exports = {
  name: 'refine_ranunculus_products',
  up: async (client) => {
    for (const p of ITEMS) {
      const details = {
        botanical_reference_status: 'source-backed',
        product_unit: '10 corm pack',
        pack_quantity: 10,
        site: 'full sun',
        days_to_bloom: 'about 90 days after planting under suitable conditions',
        plant_height: p.height,
        vase_life: 'typically 7–12 days when cut at the colored, soft-bud stage',
        color_notes: p.color_notes,
        source_reference_url: p.source_url,
        source_reference_image: p.source_image,
        source_reference_only: true,
        content_status: 'variety_copy_ready',
        pricing_status: 'working_price_review_required',
        image_prompt_reference: `${p.color_notes}; layered ranunculus bloom; white studio botanical portrait`
      };
      const seo = `Grow ${p.name} from Sugar Oak Lane. 10-corm pack; ${p.color_notes}; selected for spring containers, home gardens and beautiful cut flowers.`.slice(0,220);
      await client.query(`
        UPDATE sol_products
        SET short_description=$1,
            description=$2,
            price=14.95,
            price_label='$14.95 · 10 corms',
            seo_title=$3,
            seo_description=$4,
            seed_details=COALESCE(seed_details,'{}'::jsonb) || $5::jsonb,
            updated_at=NOW()
        WHERE slug=$6
          AND seed_details->>'catalog_status'='staging_ready'
      `,[p.short,p.description,`${p.name} Corms | Sugar Oak Lane`.slice(0,120),seo,JSON.stringify(details),p.slug]);
    }
    const check=await client.query(`
      SELECT COUNT(*)::int AS count
      FROM sol_products
      WHERE subcategory='ranunculus-corms'
        AND seed_details->>'content_status'='variety_copy_ready'
    `);
    console.log('[migration] ranunculus products refined:',check.rows[0]?.count);
  },
  down: async () => {}
};
