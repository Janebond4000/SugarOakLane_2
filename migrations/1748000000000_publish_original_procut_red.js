module.exports = {
  name: 'publish_original_procut_red_photograph',
  up: async client => {
    await client.query(`UPDATE sol_products SET
      images = $1::jsonb,
      seed_details = COALESCE(seed_details, '{}'::jsonb) || jsonb_build_object(
        'previous_image_urls', images, 'image_status', 'approved',
        'image_rights', 'original-ai', 'image_background_rule', 'soft blurred farm/garden only',
        'image_asset_version', '2026-10-10'),
      updated_at = NOW()
      WHERE slug = 'sunflower-procut-red'
      AND COALESCE(seed_details->>'image_status','') NOT IN ('approved','complete','published')`,
      [JSON.stringify(['https://sugar-oak-lane-web-production.up.railway.app/assets/products/sunflowers/procut-red.webp'])]);
  },
  down: async () => {}
};
