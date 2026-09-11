/**
 * Refine Sugar Oak Lane Farm & Garden shop taxonomy.
 *
 * - Keeps the existing seeds-bulbs root slug for backwards compatibility.
 * - Adds customer-friendly child categories suitable for a later WooCommerce migration.
 * - Assigns all 402 selected catalog products to a primary category.
 * - Stores exact dahlia form where source tags expose it.
 * - Creates deterministic category-based image batch IDs (12 SKUs max per batch).
 */
module.exports = {
  name: 'refine_shop_categories_and_image_batches',
  up: async (client) => {
    const root = await client.query(`SELECT id FROM categories WHERE slug='seeds-bulbs' LIMIT 1`);
    if (!root.rows.length) throw new Error('Missing seeds-bulbs root category');
    const rootId = root.rows[0].id;

    await client.query(`
      UPDATE categories
      SET name='Seeds, Tubers & Corms',
          description='Flower seeds, dahlia tubers and ranunculus corms selected for beautiful gardens and cutting.'
      WHERE id=$1
    `,[rootId]);

    // Retire the old example-only seed hierarchy so the public sidebar is not cluttered.
    await client.query(`
      UPDATE categories SET is_active=FALSE, sidebar_visible=FALSE
      WHERE slug IN ('annuals','perennials','herbs','focal-flowers','filler-flowers')
    `);

    async function upsertCategory({name,slug,description,icon,sort,parentId,level}) {
      await client.query(`
        INSERT INTO categories(name,slug,description,icon,sort_order,is_active,sidebar_visible,parent_id,level)
        VALUES($1,$2,$3,$4,$5,TRUE,TRUE,$6,$7)
        ON CONFLICT(slug) DO UPDATE SET
          name=EXCLUDED.name, description=EXCLUDED.description, icon=EXCLUDED.icon,
          sort_order=EXCLUDED.sort_order, is_active=TRUE, sidebar_visible=TRUE,
          parent_id=EXCLUDED.parent_id, level=EXCLUDED.level
      `,[name,slug,description,icon,sort,parentId,level]);
      const r=await client.query(`SELECT id FROM categories WHERE slug=$1`,[slug]);
      return r.rows[0].id;
    }

    const flowerSeedsId = await upsertCategory({name:'Flower Seeds',slug:'flower-seeds',description:'Flower seeds organized by the way customers naturally shop for them.',icon:'🌱',sort:1,parentId:rootId,level:1});
    const dahliaTubersId = await upsertCategory({name:'Dahlia Tubers',slug:'dahlia-tubers',description:'Dahlia tubers organized by bloom form.',icon:'🌸',sort:2,parentId:rootId,level:1});
    await upsertCategory({name:'Ranunculus Corms',slug:'ranunculus-corms',description:'Ranunculus corms for layered spring color.',icon:'🌷',sort:3,parentId:rootId,level:1});

    const seedCats=[
      ['Sunflowers','sunflower-seeds','Bright focal flowers and classic sunflower forms.','🌻'],
      ['Zinnias','zinnia-seeds','Color-rich zinnias for long-season bloom.','🌸'],
      ['Cosmos','cosmos-seeds','Airy cosmos for movement and easy color.','🌼'],
      ['Scabiosa & Pincushion','scabiosa-seeds','Textural pincushion blooms and seed heads.','🪻'],
      ['Marigolds','marigold-seeds','Warm, saturated marigolds and gem types.','🌼'],
      ['Amaranth & Celosia','amaranth-celosia-seeds','Architectural plumes, tassels and textured blooms.','🌾'],
      ['Lace Flowers','lace-flower-seeds','Fine-textured lace flowers for airy layers.','☁️'],
      ['Cottage Garden Flowers','cottage-garden-seeds','Romantic, familiar flowers with an old-garden feel.','🏡'],
      ['Foliage, Fillers & Texture','foliage-filler-seeds','Greens, grasses, fillers and textural ingredients.','🌿'],
      ['Specialty Flower Seeds','specialty-flower-seeds','Distinctive flower varieties that sit outside the larger families.','✿']
    ];
    for (let i=0;i<seedCats.length;i++) {
      const [name,slug,description,icon]=seedCats[i];
      await upsertCategory({name,slug,description,icon,sort:i+1,parentId:flowerSeedsId,level:2});
    }

    const dahliaCats=[
      ['Decorative Dahlias','decorative-dahlias','Formal and informal decorative dahlias.'],
      ['Ball & Pompon Dahlias','ball-pompon-dahlias','Rounded ball and pompon forms.'],
      ['Waterlily Dahlias','waterlily-dahlias','Soft, open waterlily forms.'],
      ['Cactus & Laciniated Dahlias','cactus-laciniated-dahlias','Spiky cactus, semi-cactus and laciniated forms.'],
      ['Collarette, Anemone & Orchid Dahlias','collarette-anemone-orchid-dahlias','Open-centered and specialty petal forms.'],
      ['Stellar Dahlias','stellar-dahlias','Star-shaped stellar forms.'],
      ['Specialty Dahlias','specialty-dahlias','Distinctive forms that do not fit the larger groups.']
    ];
    for (let i=0;i<dahliaCats.length;i++) {
      const [name,slug,description]=dahliaCats[i];
      await upsertCategory({name,slug,description,icon:'🌸',sort:i+1,parentId:dahliaTubersId,level:2});
    }

    const seedRows=(await client.query(`
      SELECT id,name,slug,seed_details FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready' AND subcategory='flower-seeds'
      ORDER BY name
    `)).rows;

    function family(name='') {
      const rules=[
        ['Sunflowers','sunflower-seeds',/sunflower/i],
        ['Zinnias','zinnia-seeds',/zinnia/i],
        ['Cosmos','cosmos-seeds',/cosmos/i],
        ['Scabiosa','scabiosa-seeds',/scabiosa|pincushion/i],
        ['Marigolds','marigold-seeds',/marigold/i],
        ['Amaranth','amaranth-celosia-seeds',/amaranth/i],
        ['Celosia','amaranth-celosia-seeds',/celosia|cockscomb/i],
        ['Lace Flower','lace-flower-seeds',/lace flower|didiscus|dara/i],
        ['Bachelor Buttons','cottage-garden-seeds',/bachelor|cornflower/i],
        ['Nigella','cottage-garden-seeds',/nigella|love-in-a-mist/i],
        ['Poppies','cottage-garden-seeds',/poppy/i],
        ['Snapdragons','cottage-garden-seeds',/snapdragon/i],
        ['Rudbeckia','cottage-garden-seeds',/rudbeckia|black-eyed susan/i],
        ['Canterbury Bells','cottage-garden-seeds',/canterbury bells/i],
        ['Carnations','cottage-garden-seeds',/carnation/i],
        ['Agrostemma','cottage-garden-seeds',/agrostemma|corn cockle/i],
        ['Sweet William','cottage-garden-seeds',/sweet william/i],
        ['Forget-Me-Nots','cottage-garden-seeds',/forget[- ]?me[- ]?not/i],
        ['Bee Balm','cottage-garden-seeds',/bee balm|monarda/i],
        ['Clary Sage','cottage-garden-seeds',/clary sage/i],
        ['Chamomile','cottage-garden-seeds',/chamomile/i],
        ['Xeranthemum','cottage-garden-seeds',/xeranthemum/i],
        ['Baby’s Breath','foliage-filler-seeds',/baby.?s breath/i],
        ['Eucalyptus','foliage-filler-seeds',/eucalyptus/i],
        ['Basil','foliage-filler-seeds',/basil/i],
        ['Cress','foliage-filler-seeds',/cress/i],
        ['Dill','foliage-filler-seeds',/dill/i],
        ['Bupleurum','foliage-filler-seeds',/bupleur/i],
        ['Statice','foliage-filler-seeds',/statice|limonium/i],
        ['Bunny Tails','foliage-filler-seeds',/bunny tails/i],
        ['Foxtail Millet','foliage-filler-seeds',/foxtail millet/i],
        ['Dusty Miller','foliage-filler-seeds',/dusty miller/i],
        ['Echinops','foliage-filler-seeds',/echinops/i],
        ['Honeywort','foliage-filler-seeds',/honeywort/i],
        ['Oregano','foliage-filler-seeds',/oregano/i],
        ['Shiso','foliage-filler-seeds',/shiso/i],
        ['Silver Lace','foliage-filler-seeds',/silver lace/i],
        ['Apple of Peru','foliage-filler-seeds',/apple of peru/i],
        ['Bee’s Friend','foliage-filler-seeds',/bee.?s friend/i]
      ];
      for(const [flowerName,category,re] of rules) if(re.test(name)) return {flowerName,category};
      return {flowerName:name.split(/[–—-]/)[0].trim(),category:'specialty-flower-seeds'};
    }

    const allAssignments=[];
    for(const row of seedRows){
      const f=family(row.name);
      allAssignments.push({id:row.id,name:row.name,kind:'seed',primary:f.category,flowerName:f.flowerName,exactForm:null});
    }

    const dahliaRows=(await client.query(`
      SELECT id,name,slug,dahlia_type,seed_details FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready' AND subcategory='dahlias'
      ORDER BY name
    `)).rows;

    function exactDahliaForm(row){
      const d=row.seed_details||{};
      const refs=Array.isArray(d.source_references)?d.source_references:[];
      const tags=refs.flatMap(r=>Array.isArray(r.tags)?r.tags:[]).map(x=>String(x).toLowerCase());
      const tag=tags.find(t=>t.startsWith('form-'));
      if(tag) return tag.replace(/^form-/,'').replace(/-/g,' ');
      return String(d.extracted_form||d.bloom_form||d.dahlia_form||row.dahlia_type||'').toLowerCase().trim() || 'unclassified';
    }
    function dahliaCategory(form){
      if(['formal decorative','informal decorative','decorative'].includes(form)) return 'decorative-dahlias';
      if(['ball','miniature ball','pompon','pom pom'].includes(form)) return 'ball-pompon-dahlias';
      if(form==='waterlily') return 'waterlily-dahlias';
      if(['cactus','semi cactus','semi-cactus','laciniated'].includes(form)) return 'cactus-laciniated-dahlias';
      if(['collarette','anemone','orchid','single','peony'].includes(form)) return 'collarette-anemone-orchid-dahlias';
      if(form==='stellar') return 'stellar-dahlias';
      return 'specialty-dahlias';
    }
    for(const row of dahliaRows){
      const form=exactDahliaForm(row);
      allAssignments.push({id:row.id,name:row.name,kind:'dahlia',primary:dahliaCategory(form),flowerName:'Dahlias',exactForm:form});
    }

    const ranRows=(await client.query(`
      SELECT id,name,slug,seed_details FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready' AND subcategory='ranunculus-corms'
      ORDER BY name
    `)).rows;
    for(const row of ranRows) allAssignments.push({id:row.id,name:row.name,kind:'ranunculus',primary:'ranunculus-corms',flowerName:'Ranunculus',exactForm:null});

    // Deterministic image batches by primary shop category, max 12 products each.
    const grouped={};
    for(const a of allAssignments) (grouped[a.primary] ||= []).push(a);
    for(const items of Object.values(grouped)) items.sort((a,b)=>a.name.localeCompare(b.name));

    const batchIndexById=new Map();
    for(const [category,items] of Object.entries(grouped)){
      items.forEach((a,i)=>{
        const seq=Math.floor(i/12)+1;
        batchIndexById.set(a.id,`${category}-${String(seq).padStart(2,'0')}`);
      });
    }

    for(const a of allAssignments){
      const parent=a.kind==='seed'?'flower-seeds':a.kind==='dahlia'?'dahlia-tubers':'ranunculus-corms';
      const cats=['seeds-bulbs',parent];
      if(a.primary!==parent) cats.push(a.primary);
      const details={
        shop_taxonomy_status:'assigned',
        primary_shop_category:a.primary,
        image_batch_category:a.primary,
        image_batch_id:batchIndexById.get(a.id),
        image_batch_size_max:12,
        wordpress_category_path:cats,
        exact_dahlia_form:a.exactForm||null
      };
      await client.query(`
        UPDATE sol_products
        SET categories=$1::jsonb,
            flower_name=$2,
            flower_type=$3,
            dahlia_type=CASE WHEN $4::text IS NOT NULL THEN $4 ELSE dahlia_type END,
            seed_details=COALESCE(seed_details,'{}'::jsonb)||$5::jsonb,
            updated_at=NOW()
        WHERE id=$6
      `,[JSON.stringify(cats),a.flowerName,a.kind==='seed'?'Flower Seed':a.kind==='dahlia'?'Dahlia Tuber':'Ranunculus Corm',a.exactForm,JSON.stringify(details),a.id]);
    }

    const verify=await client.query(`
      SELECT
        COUNT(*)::int total,
        COUNT(*) FILTER(WHERE seed_details->>'shop_taxonomy_status'='assigned')::int assigned,
        COUNT(*) FILTER(WHERE seed_details->>'image_batch_id' IS NOT NULL)::int batched
      FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready'
    `);
    const counts=await client.query(`
      SELECT seed_details->>'primary_shop_category' category, COUNT(*)::int count
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
      GROUP BY 1 ORDER BY 1
    `);
    const batches=await client.query(`
      SELECT seed_details->>'image_batch_id' batch_id, seed_details->>'primary_shop_category' category, COUNT(*)::int count
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
      GROUP BY 1,2 ORDER BY 2,1
    `);
    console.log('[shop-taxonomy]',verify.rows[0]);
    console.log('[shop-taxonomy] category_counts',counts.rows);
    console.log('[shop-taxonomy] image_batches',batches.rows);
  },
  down: async () => {}
};
