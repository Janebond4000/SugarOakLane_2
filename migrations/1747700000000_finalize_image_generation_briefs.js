/**
 * Final production briefs for original catalog photography.
 * Public imagery must be original AI/owned imagery; supplier photography remains reference-only.
 */
module.exports={
  name:'finalize_image_generation_briefs',
  up:async(client)=>{
    await client.query(`
      UPDATE sol_products
      SET seed_details=COALESCE(seed_details,'{}'::jsonb)||jsonb_build_object(
        'image_generation_prompt',
          CONCAT(
            'Create an original photorealistic square ecommerce botanical portrait of ',name,'. ',
            CASE WHEN COALESCE(seed_details->>'color_notes','')<>'' THEN CONCAT('Color reference: ',seed_details->>'color_notes','. ') ELSE '' END,
            CASE WHEN jsonb_array_length(COALESCE(seed_details->'extracted_color_terms','[]'::jsonb))>0 THEN CONCAT('Verified colors: ',TRIM(BOTH '[]"' FROM (seed_details->'extracted_color_terms')::text),'. ') ELSE '' END,
            CASE WHEN COALESCE(seed_details->>'dahlia_form',seed_details->>'extracted_form','')<>'' THEN CONCAT('Bloom form: ',COALESCE(seed_details->>'dahlia_form',seed_details->>'extracted_form'),'. ') ELSE '' END,
            CASE WHEN COALESCE(seed_details->>'bloom_size',seed_details->>'extracted_bloom_size','')<>'' THEN CONCAT('Bloom size: ',COALESCE(seed_details->>'bloom_size',seed_details->>'extracted_bloom_size'),'. ') ELSE '' END,
            'The bloom must be sharply focused and botanically plausible, photographed in natural light against a soft, heavily blurred flower-farm or garden background with shallow depth of field. ',
            CASE WHEN LOWER(name) LIKE '%sunflower%' THEN 'Use a slightly brighter, sunny garden atmosphere while preserving the same premium catalog style. ' ELSE 'Use a refined, natural farm-garden atmosphere. ' END,
            'No text, labels, hands, people, packaging, vases, borders, logos, collages, or white studio backdrop. Center the variety as the clear subject with enough breathing room for consistent ecommerce cropping.'
          ),
        'image_format','square 1:1',
        'image_delivery_format','webp',
        'image_background_rule','soft blurred farm/garden only',
        'image_public_rights_rule','original-ai-or-owned-only',
        'image_status',CASE WHEN seed_details->>'image_status' IN ('approved','complete','published') THEN seed_details->>'image_status' ELSE 'queued' END
      ),updated_at=NOW()
      WHERE seed_details->>'catalog_status'='staging_ready'
        AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
    `);
    const r=await client.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE COALESCE(seed_details->>'image_generation_prompt','')<>'')::int with_brief,COUNT(*) FILTER(WHERE seed_details->>'image_background_rule'='soft blurred farm/garden only')::int correct_style FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready'`);
    console.log('[image-briefs]',r.rows[0]);
  },
  down:async()=>{}
};
