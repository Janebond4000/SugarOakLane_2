const zlib = require('zlib');

const DATA = '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';

function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'").toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 240);
}

function productShape(item, index) {
  const type = item.type;
  const isSeed = type === 'Seed';
  const isDahlia = type === 'Dahlia';
  const subcategory = isSeed ? 'flower-seeds' : isDahlia ? 'dahlias' : 'ranunculus-corms';
  const typeLabel = isSeed ? 'flower seed' : isDahlia ? 'dahlia tuber' : 'ranunculus corm';
  const collectionLabel = isSeed ? 'flower seed collection' : isDahlia ? 'dahlia collection' : 'ranunculus collection';
  const shortDescription = isSeed
    ? `${item.name} is part of Sugar Oak Lane's curated flower seed collection for home gardens and cutting gardens.`
    : isDahlia
      ? `${item.name} is part of the Sugar Oak Lane dahlia collection, selected for beautiful home gardens and cutting gardens.`
      : `${item.name} is part of Sugar Oak Lane's curated ranunculus collection for layered spring color and beautiful cut flowers.`;
  const description = `${shortDescription} Final variety-specific growing notes, pack details and original Sugar Oak Lane photography are being prepared before launch.`;
  return {
    name: item.name,
    slug: slugify(item.name),
    sol_category: 'seeds-bulbs',
    subcategory,
    description,
    short_description: shortDescription,
    price: Number(item.working_price || 0),
    price_label: `$${Number(item.working_price || 0).toFixed(2)}`,
    availability: 'out_of_stock',
    categories: ['seeds-bulbs', subcategory],
    stock_status: 'sold_out',
    type_tags: [typeLabel],
    flower_name: isDahlia ? 'Dahlias' : (type === 'Ranunculus/Corm' ? 'Ranunculus' : null),
    flower_type: isSeed ? 'Seed' : (isDahlia ? 'Dahlia' : 'Corm'),
    seo_title: `${item.name} | Sugar Oak Lane`,
    seo_description: `Shop ${item.name} from Sugar Oak Lane's ${collectionLabel}. Final availability and product details will be confirmed before launch.`.slice(0, 220),
    sort_order: 1000 + index,
    is_active: false,
    seed_details: {
      catalog_status: 'selected_draft',
      content_status: 'working_copy',
      image_status: 'original_image_needed',
      pricing_status: 'working_price',
      source_reference: item.source,
      reference_urls: item.reference_urls || [],
      manual_addition: !!item.manual_addition
    }
  };
}

module.exports = {
  name: 'seed_selected_master_catalog',
  up: async (client) => {
    const catalog = JSON.parse(zlib.gunzipSync(Buffer.from(DATA, 'base64')).toString('utf8'));

    const parent = await client.query(`SELECT id FROM categories WHERE slug = 'seeds-bulbs' LIMIT 1`);
    if (parent.rows.length) {
      const pid = parent.rows[0].id;
      await client.query(`
        INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, level)
        VALUES
          ('Flower Seeds', 'flower-seeds', 'Flower seeds for home gardens and cutting gardens', '🌱', 1, TRUE, TRUE, $1, 1),
          ('Dahlias', 'dahlias', 'Dahlia tubers and future dahlia collections', '🌸', 2, TRUE, TRUE, $1, 1),
          ('Ranunculus Corms', 'ranunculus-corms', 'Ranunculus corms for spring gardens and cutting', '🌼', 3, TRUE, TRUE, $1, 1)
        ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, is_active = TRUE, sidebar_visible = TRUE
      `, [pid]);
    }

    for (let i = 0; i < catalog.length; i += 50) {
      const batch = catalog.slice(i, i + 50).map((item, j) => productShape(item, i + j));
      await client.query(`
        INSERT INTO sol_products (
          name, slug, sol_category, subcategory, description, short_description,
          price, price_label, availability, categories, stock_status, type_tags,
          flower_name, flower_type, seo_title, seo_description, sort_order,
          is_active, seed_details
        )
        SELECT
          x.name, x.slug, x.sol_category, x.subcategory, x.description, x.short_description,
          x.price, x.price_label, x.availability, x.categories, x.stock_status, x.type_tags,
          x.flower_name, x.flower_type, x.seo_title, x.seo_description, x.sort_order,
          x.is_active, x.seed_details
        FROM jsonb_to_recordset($1::jsonb) AS x(
          name text, slug text, sol_category text, subcategory text, description text,
          short_description text, price numeric, price_label text, availability text,
          categories jsonb, stock_status text, type_tags text[], flower_name text,
          flower_type text, seo_title text, seo_description text, sort_order int,
          is_active boolean, seed_details jsonb
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
      `, [JSON.stringify(batch)]);
    }

    const counts = await client.query(`
      SELECT subcategory, COUNT(*)::int AS count
      FROM sol_products
      WHERE (seed_details->>'catalog_status') = 'selected_draft'
      GROUP BY subcategory ORDER BY subcategory
    `);
    console.log(`[migration] seeded ${catalog.length} selected catalog records as drafts`, counts.rows);
  },
  down: async (client) => {
    await client.query(`DELETE FROM sol_products WHERE (seed_details->>'catalog_status') = 'selected_draft' AND is_active = FALSE`);
  }
};
