/**
 * Sugar Oak Lane — Seed farm products from existing static shop pages
 * Note: season_tags and type_tags are TEXT[] — pass as JS arrays (pg auto-converts).
 *       images is JSONB — pass as JSON string.
 */
module.exports = {
  name: 'seed_sol_products',
  up: async (client) => {
    const products = [
      /* ── FLOWER SHOP ─────────────────────────────────────────────── */
      {
        name: 'Farm Bouquet',
        slug: 'farm-bouquet',
        sol_category: 'flower-shop',
        subcategory: 'bouquets',
        short_description: 'A loose, garden-style mix of whatever\'s at peak. No two are ever identical.',
        description: 'This is our most popular offering — pure farm, pure season. Each bouquet is assembled the morning of your pickup or delivery using whatever is hitting its absolute peak in our fields that week. You might get dahlias and cosmos in September, sweet peas and ranunculus in April, or a riot of zinnias and sunflowers in July. No two bouquets are ever identical. That\'s the point.\n\nAll stems are cut, conditioned, and arranged by hand. We wrap in kraft paper with a seasonal tag and include a card with care instructions.',
        price: 45.00,
        price_label: 'From $45',
        images: JSON.stringify(['https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&q=80', 'https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&q=80']),
        availability: 'in_stock',
        season_tags: ['spring', 'summer', 'fall'],
        type_tags: ['bouquet', 'mixed', 'seasonal'],
        is_featured: true,
        sort_order: 1
      },
      {
        name: 'Dahlia Feature',
        slug: 'dahlia-feature',
        sol_category: 'flower-shop',
        subcategory: 'bouquets',
        short_description: 'Built around our showstopper dahlias — dinnerplate, pompom, or waterlily varieties.',
        description: 'Available July through November, this arrangement is built around the queen of the cutting garden. We grow 50+ dahlia varieties on the farm, and this bouquet features 3–5 dinner plate or decorative dahlias as the star, surrounded by complementary seasonal filler (cosmos, grasses, herbs, zinnias).\n\nYou can specify a color palette preference at checkout — we\'ll do our best to match from what\'s blooming. Popular requests: warm tones (amber, rust, gold), blush and cream, or deep jewel tones.',
        price: 60.00,
        price_label: 'From $60',
        images: JSON.stringify(['https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800&q=80', 'https://images.unsplash.com/photo-1567696911980-2eed69a46042?w=800&q=80']),
        availability: 'seasonal',
        season_tags: ['summer', 'fall'],
        type_tags: ['bouquet', 'dahlia', 'feature'],
        is_featured: true,
        sort_order: 2
      },
      {
        name: 'Wrapped Stem Bundle',
        slug: 'wrapped-stem-bundle',
        sol_category: 'flower-shop',
        subcategory: 'bundles',
        short_description: '12–20 mixed stems, field-wrapped in kraft paper. Perfect for gifting.',
        description: 'A curated bundle of 12–20 mixed stems, field-wrapped in kraft paper with a seasonal tag. Stems are selected at their peak and wrapped loosely so you can arrange them yourself at home — or give them exactly as they are.\n\nThis is our most giftable format: easy to carry, beautiful to receive, no vase required at the moment of gifting.',
        price: 38.00,
        price_label: 'From $38',
        images: JSON.stringify(['https://images.unsplash.com/photo-1490750967868-88df5691cc45?w=800&q=80']),
        availability: 'in_stock',
        season_tags: ['spring', 'summer', 'fall'],
        type_tags: ['bundle', 'gift', 'stems'],
        is_featured: false,
        sort_order: 3
      },
      {
        name: 'Sweet Pea Collection',
        slug: 'sweet-pea-collection',
        sol_category: 'flower-shop',
        subcategory: 'seasonal',
        short_description: 'Spring-only (March–May). Fragrant, delicate, impossibly pretty.',
        description: 'Our sweet peas are spring-only — they go into the ground as seeds in November, overwinter as tiny plants, and bloom their hearts out from late March through May. This is our most fragrant offering; a jar of sweet peas in a room is like wearing perfume, but better.\n\nAvailable in mixed pastel (pinks, lavenders, whites, blushes) or single-color bundles (contact us to request a specific shade). Bundle contains 15–25 stems.\n\nOnce sweet pea season is over, it\'s over — they can\'t survive Georgia\'s summer heat. Order early.',
        price: 42.00,
        price_label: 'From $42',
        images: JSON.stringify(['https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?w=800&q=80']),
        availability: 'seasonal',
        season_tags: ['spring'],
        type_tags: ['bouquet', 'sweet pea', 'fragrant', 'seasonal'],
        is_featured: false,
        sort_order: 4
      },
      {
        name: 'Sunflower Arrangement',
        slug: 'sunflower-arrangement',
        sol_category: 'flower-shop',
        subcategory: 'arrangements',
        short_description: 'Succession-planted from April through August. Big, joyful, long-lasting.',
        description: 'We succession-plant sunflowers every 10 days from April through early August, which means we\'re harvesting fresh sunflowers continuously from June through October. Available in compact single-variety vases or mixed with cosmos, zinnias, and grasses for a looser garden feel.\n\nSunflowers last 7–12 days with proper care — they\'re one of the best-value cut flowers you can buy.',
        price: 36.00,
        price_label: 'From $36',
        images: JSON.stringify(['https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=800&q=80']),
        availability: 'seasonal',
        season_tags: ['summer', 'fall'],
        type_tags: ['arrangement', 'sunflower', 'summer'],
        is_featured: false,
        sort_order: 5
      },
      /* ── SEEDS + BULBS ────────────────────────────────────────────── */
      {
        name: 'Dahlia Tubers — Mixed',
        slug: 'dahlia-tubers-mixed',
        sol_category: 'seeds-bulbs',
        subcategory: 'tubers',
        short_description: 'Field-grown tubers from our own stock. Mixed varieties, all premium performers.',
        description: 'These are the exact same tubers we plant in our own fields. We grow 50+ varieties and have personally trialed every one in Georgia\'s Zone 7b/8a climate. The varieties we sell are the ones that performed best: good stem length, excellent vase life, and stunning blooms.\n\nEach order includes 1 tuber from our mixed selection. We curate the mix each season based on what we have available and what we\'ve found to be most reliable for home gardeners.\n\nIncluded with every order: a planting guide specific to the Southeast (when to plant in Georgia, how to water, how to dig and store).',
        price: 18.00,
        price_label: '$18 each',
        images: JSON.stringify(['https://images.unsplash.com/photo-1560800452-f2d475982b96?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 80,
        season_tags: ['spring'],
        type_tags: ['tuber', 'dahlia', 'perennial'],
        is_featured: true,
        sort_order: 1
      },
      {
        name: 'Sweet Pea Seeds',
        slug: 'sweet-pea-seeds',
        sol_category: 'seeds-bulbs',
        subcategory: 'seeds',
        short_description: 'Heirloom mixed pastel. Plant in fall for spring blooms in Georgia.',
        description: 'Our seed sweet peas are an heirloom mixed pastel selection we\'ve been growing and saving from for years. In Zone 7b/8a, plant in October–November for the best results — they overwinter as small plants and bloom in March–May.\n\nPacket contains approximately 25 seeds with a detailed planting guide. Germination rate from our current stock: 92%.',
        price: 6.00,
        price_label: '$6 per packet',
        images: JSON.stringify(['https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 120,
        season_tags: ['fall', 'winter'],
        type_tags: ['seeds', 'annual', 'fragrant'],
        is_featured: false,
        sort_order: 2
      },
      {
        name: "Zinnia Seeds — Benary's Giant Mix",
        slug: 'zinnia-seeds-benarys-giant',
        sol_category: 'seeds-bulbs',
        subcategory: 'seeds',
        short_description: "The best zinnia for cutting gardens. Large blooms, long stems, reliable.",
        description: "Benary's Giant is the gold standard zinnia for cut flower growers. Large 4-5 inch blooms on strong, upright stems. In Georgia, direct sow after last frost (mid-April) and succession plant every 3 weeks through July for continuous harvest.\n\nMixed colors include coral, orange, red, white, lavender, and yellow. About 100 seeds per packet. Germination in 5-7 days.",
        price: 5.00,
        price_label: '$5 per packet',
        images: JSON.stringify(['https://images.unsplash.com/photo-1490750967868-88df5691cc45?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 200,
        season_tags: ['spring', 'summer'],
        type_tags: ['seeds', 'annual', 'easy'],
        is_featured: false,
        sort_order: 3
      },
      {
        name: 'Ranunculus Corms — Pastel Mix',
        slug: 'ranunculus-corms-pastel',
        sol_category: 'seeds-bulbs',
        subcategory: 'bulbs',
        short_description: 'Pre-sprouted corms. The most luxurious spring flower you can grow.',
        description: 'Ranunculus is the flower everyone assumes is difficult to grow — it\'s not. Plant the claw-shaped corms in fall (October–November in Georgia) or early spring in the greenhouse. They bloom in late March–May and look like roses but with hundreds of tissue-paper petals.\n\nThis listing includes 10 corms in a pastel mix: cream, blush, peach, soft pink, and lavender. All corms are pre-dried and ready to plant.',
        price: 24.00,
        price_label: '$24 for 10 corms',
        images: JSON.stringify(['https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 50,
        season_tags: ['fall', 'spring'],
        type_tags: ['bulbs', 'annual', 'premium'],
        is_featured: true,
        sort_order: 4
      },
      {
        name: 'Cosmos Seeds — Double Click Mix',
        slug: 'cosmos-seeds-double-click',
        sol_category: 'seeds-bulbs',
        subcategory: 'seeds',
        short_description: 'Double-flowering cosmos with incredible movement and volume.',
        description: 'Double Click cosmos have fuller, more double flowers than standard cosmos, making them exceptional for arrangements. They add movement and airiness that no other flower provides. Direct sow in Georgia after last frost — they self-seed and return year after year.\n\nMixed colors: bicolor pinks, burgundy, white, and rose. About 75 seeds per packet.',
        price: 4.00,
        price_label: '$4 per packet',
        images: JSON.stringify(['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 180,
        season_tags: ['spring', 'summer'],
        type_tags: ['seeds', 'annual', 'easy'],
        is_featured: false,
        sort_order: 5
      },
      /* ── PLANT NURSERY ────────────────────────────────────────────── */
      {
        name: 'Snapdragon Starts',
        slug: 'snapdragon-starts',
        sol_category: 'plant-nursery',
        subcategory: 'starts',
        short_description: 'Ready to transplant. Cold-hardy, blooms March–June in Georgia.',
        description: 'Our snapdragon starts are grown under lights from seed in January and ready to transplant by March. They\'re cold-hardy and can go into the garden 2–3 weeks before your last frost date.\n\nEach 4" pot contains one healthy snapdragon start ready to transplant into your garden or a larger container. Variety: butterfly snapdragon mix (more open, airy form than standard varieties — better for arrangements).\n\nPickup only — live plants cannot be shipped.',
        price: 8.00,
        price_label: '$8 each',
        images: JSON.stringify(['https://images.unsplash.com/photo-1490750967868-88df5691cc45?w=800&q=80']),
        availability: 'seasonal',
        inventory_count: 40,
        season_tags: ['spring'],
        type_tags: ['starts', 'transplant', 'cool-season'],
        is_featured: false,
        sort_order: 1
      },
      {
        name: 'Dahlia Plugs',
        slug: 'dahlia-plugs',
        sol_category: 'plant-nursery',
        subcategory: 'plugs',
        short_description: 'Pre-sprouted dahlia plugs. Skip the wait — ready 4–6 weeks ahead of tubers.',
        description: 'Our dahlia plugs are started 6 weeks before tubers would normally sprout, giving you blooms weeks ahead of schedule. Each plug is a rooted cutting in a 2.5" cell, ready to pot up or transplant after your last frost date.\n\nMixed varieties. We can\'t guarantee specific varieties in plugs, but they\'re all from our best-performing stock.\n\nPickup only — live plants cannot be shipped.',
        price: 12.00,
        price_label: '$12 each',
        images: JSON.stringify(['https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800&q=80']),
        availability: 'seasonal',
        inventory_count: 30,
        season_tags: ['spring'],
        type_tags: ['plugs', 'dahlia', 'transplant'],
        is_featured: true,
        sort_order: 2
      },
      {
        name: 'Zinnia Starts — 6-Pack',
        slug: 'zinnia-starts-6-pack',
        sol_category: 'plant-nursery',
        subcategory: 'starts',
        short_description: 'Six zinnia starts in a cell tray, ready to transplant after last frost.',
        description: "Mixed variety zinnias (Benary's Giant series and Queen Lime) in a 6-pack cell tray. Ready to go directly into the garden or raised bed after last frost (mid-April in Georgia).\n\nZinnias are the most productive cut flower you can grow — the more you cut, the more they bloom. A 6-pack gives you 6 plants that will each produce 20+ stems over the season.\n\nPickup only — live plants cannot be shipped.",
        price: 6.00,
        price_label: '$6 per 6-pack',
        images: JSON.stringify(['https://images.unsplash.com/photo-1490750967868-88df5691cc45?w=800&q=80']),
        availability: 'seasonal',
        inventory_count: 25,
        season_tags: ['spring'],
        type_tags: ['starts', 'zinnia', 'transplant'],
        is_featured: false,
        sort_order: 3
      },
      /* ── FARM GOODS + MERCH ───────────────────────────────────────── */
      {
        name: 'Sugar Oak Lane Canvas Tote',
        slug: 'sugar-oak-lane-tote',
        sol_category: 'farm-goods',
        subcategory: 'merch',
        short_description: 'Heavy-duty canvas tote with the Sugar Oak Lane logo. Perfect for farmers markets.',
        description: 'Heavy natural canvas tote with the Sugar Oak Lane leaf logo screenprinted in forest green. Large enough for a full CSA share or a week of grocery shopping. Reinforced handles, flat bottom.\n\nDimensions: 15" wide x 14" tall x 5" deep. Made in the USA from 12oz natural canvas.',
        price: 28.00,
        price_label: '$28',
        images: JSON.stringify(['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 25,
        season_tags: [],
        type_tags: ['merch', 'tote', 'gift'],
        is_featured: false,
        sort_order: 1
      },
      {
        name: 'Farm Apron',
        slug: 'farm-apron',
        sol_category: 'farm-goods',
        subcategory: 'merch',
        short_description: 'Waxed canvas farm apron. Practical and beautiful for florists and gardeners.',
        description: 'The apron we wear every day in the field and the studio. Made from waxed canvas with three front pockets (two large, one narrow for snips or a phone) and adjustable crossback straps that sit comfortably without neck strain.\n\nForest green. One size fits most. Snips not included (but we recommend them).',
        price: 45.00,
        price_label: '$45',
        images: JSON.stringify(['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 12,
        season_tags: [],
        type_tags: ['merch', 'apron', 'gift'],
        is_featured: true,
        sort_order: 2
      },
      {
        name: 'Flower Food Packets — 10-Pack',
        slug: 'flower-food-packets',
        sol_category: 'farm-goods',
        subcategory: 'supplies',
        short_description: 'Professional Floralife flower food. What we use in our studio.',
        description: 'The exact same Floralife flower food packets we use for all of our arrangements. Each packet treats one quart of water. One packet per bouquet, per fresh water change (every 2–3 days).\n\n10 individual-use packets per order. Keeps cut flowers 2–3 days longer than plain water.',
        price: 8.00,
        price_label: '$8 for 10',
        images: JSON.stringify(['https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 60,
        season_tags: [],
        type_tags: ['supplies', 'care', 'practical'],
        is_featured: false,
        sort_order: 3
      },
      {
        name: 'Flower Frog (Kenzan)',
        slug: 'flower-frog-kenzan',
        sol_category: 'farm-goods',
        subcategory: 'supplies',
        short_description: 'Japanese pin frog for Ikebana-style and low bowl arrangements.',
        description: 'A kenzan (Japanese pin frog) is the secret weapon of florists who create low, lush arrangements in shallow bowls and compotes. Place it in the bottom of any vessel and it holds stems at any angle with no foam, no wires, no tape.\n\nThis 3" round kenzan is the size we use most in our studio. It\'s heavy enough to stay put without adhesive for most arrangements. Brass pins, heavy zinc base.',
        price: 18.00,
        price_label: '$18',
        images: JSON.stringify(['https://images.unsplash.com/photo-1490750967868-88df5691cc45?w=800&q=80']),
        availability: 'in_stock',
        inventory_count: 20,
        season_tags: [],
        type_tags: ['supplies', 'frog', 'tools'],
        is_featured: false,
        sort_order: 4
      }
    ];

    for (const p of products) {
      await client.query(`
        INSERT INTO sol_products
          (name, slug, sol_category, subcategory, short_description, description,
           price, price_label, images, availability, inventory_count,
           season_tags, type_tags, is_featured, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (slug) DO NOTHING
      `, [
        p.name, p.slug, p.sol_category, p.subcategory || null,
        p.short_description, p.description,
        p.price, p.price_label,
        p.images,
        p.availability, p.inventory_count || null,
        p.season_tags,
        p.type_tags,
        p.is_featured, p.sort_order
      ]);
    }
  },

  down: async (client) => {
    await client.query(`DELETE FROM sol_products WHERE slug IN (
      'farm-bouquet','dahlia-feature','wrapped-stem-bundle','sweet-pea-collection','sunflower-arrangement',
      'dahlia-tubers-mixed','sweet-pea-seeds','zinnia-seeds-benarys-giant','ranunculus-corms-pastel','cosmos-seeds-double-click',
      'snapdragon-starts','dahlia-plugs','zinnia-starts-6-pack',
      'sugar-oak-lane-tote','farm-apron','flower-food-packets','flower-frog-kenzan'
    )`);
  }
};
