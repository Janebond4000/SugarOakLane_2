const zlib = require('zlib');

// 403 approved catalog selections: 399 selector choices + 4 manual sunflower additions.
// Compact payload contains [name, typeCode, workingPrice].
// Type codes: S=Seed, D=Dahlia tuber, R=Ranunculus corm.
const DATA = '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';

function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'").toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 240);
}

function shape(entry, index) {
  const [name, code, priceRaw] = entry;
  const price = Number(priceRaw || 0);
  const isSeed = code === 'S';
  const isDahlia = code === 'D';
  const subcategory = isSeed ? 'flower-seeds' : isDahlia ? 'dahlias' : 'ranunculus-corms';
  const typeLabel = isSeed ? 'Flower Seed' : isDahlia ? 'Dahlia Tuber' : 'Ranunculus Corm';
  const collection = isSeed ? 'flower seed' : isDahlia ? 'dahlia' : 'ranunculus';
  const shortDescription = isSeed
    ? `${name} is part of Sugar Oak Lane's curated flower seed collection for home and cutting gardens.`
    : isDahlia
      ? `${name} is part of the Sugar Oak Lane dahlia collection, selected for beautiful home and cutting gardens.`
      : `${name} is part of Sugar Oak Lane's curated ranunculus collection for layered spring color and beautiful cut flowers.`;
  return {
    name, slug: slugify(name), price, subcategory, typeLabel,
    flowerName: isDahlia ? 'Dahlias' : (code === 'R' ? 'Ranunculus' : null),
    flowerType: isSeed ? 'Seed' : (isDahlia ? 'Dahlia' : 'Corm'),
    shortDescription,
    description: `${shortDescription} Final variety-specific growing notes, pack details and original Sugar Oak Lane photography are being prepared before launch.`,
    seoTitle: `${name} | Sugar Oak Lane`,
    seoDescription: `Shop ${name} from Sugar Oak Lane's curated ${collection} collection. Availability and final product details will be confirmed before launch.`.slice(0, 220),
    sortOrder: 1000 + index
  };
}

module.exports = {
  name: 'seed_selected_master_catalog',
  up: async (client) => {
    const catalog = JSON.parse(zlib.gunzipSync(Buffer.from(DATA, 'base64')).toString('utf8'));
    if (!Array.isArray(catalog) || catalog.length !== 403) {
      throw new Error(`Catalog payload validation failed: expected 403 records, received ${Array.isArray(catalog) ? catalog.length : 'non-array'}`);
    }

    const parent = await client.query(`SELECT id FROM categories WHERE slug = 'seeds-bulbs' LIMIT 1`);
    if (parent.rows.length) {
      const pid = parent.rows[0].id;
      await client.query(`
        INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, level)
        VALUES
          ('Flower Seeds', 'flower-seeds', 'Flower seeds for home gardens and cutting gardens', '🌱', 1, TRUE, TRUE, $1, 1),
          ('Dahlias', 'dahlias', 'Dahlia tubers and dahlia collections', '🌸', 2, TRUE, TRUE, $1, 1),
          ('Ranunculus Corms', 'ranunculus-corms', 'Ranunculus corms for spring gardens and cutting', '🌼', 3, TRUE, TRUE, $1, 1)
        ON CONFLICT (slug) DO UPDATE SET
          parent_id = EXCLUDED.parent_id,
          level = EXCLUDED.level,
          is_active = TRUE,
          sidebar_visible = TRUE
      `, [pid]);
    }

    for (let i = 0; i < catalog.length; i++) {
      const p = shape(catalog[i], i);
      const metadata = JSON.stringify({
        catalog_status: 'selected_draft',
        content_status: 'working_copy',
        image_status: 'original_image_needed',
        pricing_status: 'working_price'
      });
      await client.query(`
        INSERT INTO sol_products (
          name, slug, sol_category, subcategory, description, short_description,
          price, price_label, availability, categories, stock_status, type_tags,
          flower_name, flower_type, seo_title, seo_description, sort_order,
          is_active, seed_details
        ) VALUES (
          $1,$2,'seeds-bulbs',$3,$4,$5,$6,$7,'out_of_stock',$8::jsonb,'sold_out',$9::text[],
          $10,$11,$12,$13,$14,FALSE,$15::jsonb
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          sol_category = EXCLUDED.sol_category,
          subcategory = EXCLUDED.subcategory,
          price = EXCLUDED.price,
          price_label = EXCLUDED.price_label,
          categories = EXCLUDED.categories,
          type_tags = EXCLUDED.type_tags,
          flower_name = COALESCE(sol_products.flower_name, EXCLUDED.flower_name),
          flower_type = COALESCE(sol_products.flower_type, EXCLUDED.flower_type),
          seed_details = COALESCE(sol_products.seed_details, '{}'::jsonb) || EXCLUDED.seed_details,
          short_description = COALESCE(NULLIF(sol_products.short_description, ''), EXCLUDED.short_description),
          description = COALESCE(NULLIF(sol_products.description, ''), EXCLUDED.description),
          seo_title = COALESCE(NULLIF(sol_products.seo_title, ''), EXCLUDED.seo_title),
          seo_description = COALESCE(NULLIF(sol_products.seo_description, ''), EXCLUDED.seo_description),
          updated_at = NOW()
      `, [
        p.name, p.slug, p.subcategory, p.description, p.shortDescription,
        p.price, `$${p.price.toFixed(2)}`, JSON.stringify(['seeds-bulbs', p.subcategory]),
        [p.typeLabel], p.flowerName, p.flowerType, p.seoTitle, p.seoDescription,
        p.sortOrder, metadata
      ]);
    }

    const counts = await client.query(`
      SELECT subcategory, COUNT(*)::int AS count
      FROM sol_products
      WHERE seed_details->>'catalog_status' = 'selected_draft'
      GROUP BY subcategory ORDER BY subcategory
    `);
    const total = counts.rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
    console.log(`[migration] selected master catalog ready: ${total} draft-tagged products`, counts.rows);
  },
  down: async (client) => {
    await client.query(`DELETE FROM sol_products WHERE seed_details->>'catalog_status' = 'selected_draft' AND is_active = FALSE`);
  }
};
