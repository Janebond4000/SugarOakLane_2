const { Pool } = require('pg');

const BASE='https://library.floretflowers.com';

const SEED_COLLECTIONS=[
  {name:'Biennials',slug:'biennials',handle:'biennials'},
  {name:'Celosia',slug:'celosia',handle:'celosia'},
  {name:'China Asters',slug:'china-asters',handle:'china-asters'},
  {name:'Cosmos',slug:'cosmos',handle:'cosmos'},
  {name:'Dahlia Seeds',slug:'dahlia-seeds',handle:'dahlia-seeds'},
  {name:'Dryables',slug:'dryables',handle:'driables'},
  {name:'Edibles',slug:'edibles',handle:'edibles'},
  {name:'Foliage & Fillers',slug:'foliage-fillers',handle:'foliage-and-fillers'},
  {name:'Grasses & Pods',slug:'grasses-pods',handle:'grasses-pods'},
  {name:'Hardy Annuals',slug:'hardy-annuals',handle:'hardy-annuals'},
  {name:'Heat-loving',slug:'heat-loving',handle:'heat-loving'},
  {name:'Ornamental Squash',slug:'ornamental-squash',handle:'ornamental-squash'},
  {name:'Pansies & Violas',slug:'pansies-violas',handle:'pansies'},
  {name:'Poppies',slug:'poppies',handle:'poppies'},
  {name:'Snapdragons',slug:'snapdragons',handle:'snapdragons'},
  {name:'Sunflowers',slug:'sunflowers',handle:'sunflowers'},
  {name:'Sweet Peas',slug:'sweet-peas',handle:'sweet-peas'},
  {name:'Zinnias',slug:'zinnias',handle:'zinnia'}
];

const DAHLIA_COLLECTIONS=[
  {name:'Anemone',slug:'anemone',handle:'anemone'},
  {name:'Ball',slug:'ball',handle:'ball'},
  {name:'Cactus Types',slug:'cactus-types',handle:'cactus-types'},
  {name:'Formal Decorative',slug:'formal-decorative',handle:'formal-decorative'},
  {name:'Informal Decorative',slug:'informal-decorative',handle:'informal-decorative'},
  {name:'Laciniated',slug:'laciniated',handle:'laciniated'},
  {name:'Miniature Ball',slug:'miniature-ball',handle:'miniature-ball'},
  {name:'Novelty',slug:'novelty',handle:'novelty'},
  {name:'Pompon',slug:'pompon',handle:'pompon'},
  {name:'Single-flowered Types',slug:'single-flowered-types',handle:'single-flowered-types'},
  {name:'Stellar',slug:'stellar',handle:'stellar'},
  {name:'Waterlily',slug:'waterlily',handle:'waterlily'}
];

function norm(s=''){
  return String(s).toLowerCase().replace(/[’‘]/g,"'").replace(/®|™/g,'').replace(/^dahlia\s+/,'').replace(/^ranunculus\s+/,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
async function fetchCollection(handle){
  const all=[];
  for(let page=1;page<=8;page++){
    const r=await fetch(`${BASE}/collections/${handle}/products.json?limit=250&page=${page}`,{headers:{'user-agent':'SugarOakLaneFloretTaxonomy/1.0','accept':'application/json'}});
    if(!r.ok) throw new Error(`${r.status} ${handle}`);
    const d=await r.json(); const a=d.products||[]; all.push(...a); if(a.length<250)break;
  }
  return all;
}
function primarySeedCategory(cats,name){
  const priority=['celosia','china-asters','cosmos','dahlia-seeds','pansies-violas','poppies','snapdragons','sunflowers','sweet-peas','zinnias','biennials','foliage-fillers','grasses-pods','dryables','edibles','hardy-annuals','heat-loving','ornamental-squash'];
  for(const p of priority) if(cats.includes(p)) return p;
  const n=name.toLowerCase();
  if(/sunflower/.test(n)) return 'sunflowers';
  if(/zinnia/.test(n)) return 'zinnias';
  if(/cosmos/.test(n)) return 'cosmos';
  if(/celosia|cockscomb/.test(n)) return 'celosia';
  if(/aster/.test(n)) return 'china-asters';
  if(/poppy/.test(n)) return 'poppies';
  if(/snapdragon/.test(n)) return 'snapdragons';
  if(/sweet pea/.test(n)) return 'sweet-peas';
  if(/pansy|viola/.test(n)) return 'pansies-violas';
  if(/basil|dill|oregano|shiso/.test(n)) return 'edibles';
  if(/eucalyptus|bupleur|cress|dusty miller|baby.?s breath|apple of peru|bee.?s friend|honeywort/.test(n)) return 'foliage-fillers';
  if(/bunny tails|millet|grass/.test(n)) return 'grasses-pods';
  if(/amaranth|statice|xeranthemum/.test(n)) return 'dryables';
  if(/marigold/.test(n)) return 'heat-loving';
  return 'hardy-annuals';
}
function fallbackSeedCategories(name){
  const n=name.toLowerCase(), out=[];
  const add=x=>{if(!out.includes(x))out.push(x)};
  if(/sunflower/.test(n)) add('sunflowers');
  if(/zinnia/.test(n)) add('zinnias');
  if(/cosmos/.test(n)) add('cosmos');
  if(/celosia|cockscomb/.test(n)) add('celosia');
  if(/aster/.test(n)) add('china-asters');
  if(/poppy/.test(n)) add('poppies');
  if(/snapdragon/.test(n)) add('snapdragons');
  if(/sweet pea/.test(n)) add('sweet-peas');
  if(/pansy|viola/.test(n)) add('pansies-violas');
  if(/basil|dill|oregano|shiso/.test(n)) add('edibles');
  if(/eucalyptus|bupleur|cress|dusty miller|baby.?s breath|apple of peru|bee.?s friend|honeywort/.test(n)) add('foliage-fillers');
  if(/bunny tails|millet|grass/.test(n)) add('grasses-pods');
  if(/amaranth|celosia|statice|xeranthemum/.test(n)) add('dryables');
  if(/marigold|amaranth|celosia|zinnia|sunflower|cosmos/.test(n)) add('heat-loving');
  if(/sweet william|foxglove|iceland poppy/.test(n)) add('biennials');
  if(/bachelor|corn cockle|canterbury|carnation|nigella|scabiosa|pincushion|rudbeckia|black-eyed susan|clary sage|chamomile|forget[- ]?me[- ]?not|monarda|bee balm|lace flower|didiscus/.test(n)) add('hardy-annuals');
  if(!out.length) add('hardy-annuals');
  return out;
}
function fallbackDahliaCategory(row){
  const d=row.seed_details||{};
  const form=String(d.exact_dahlia_form||d.extracted_form||d.bloom_form||d.dahlia_form||row.dahlia_type||'').toLowerCase();
  if(form.includes('miniature ball')) return 'miniature-ball';
  if(form==='ball') return 'ball';
  if(form.includes('pompon')||form.includes('pom pom')) return 'pompon';
  if(form.includes('formal decorative')) return 'formal-decorative';
  if(form.includes('informal decorative')) return 'informal-decorative';
  if(form.includes('laciniated')) return 'laciniated';
  if(form.includes('cactus')) return 'cactus-types';
  if(form.includes('waterlily')) return 'waterlily';
  if(form.includes('stellar')) return 'stellar';
  if(form.includes('anemone')) return 'anemone';
  if(form.includes('single')||form.includes('collarette')||form.includes('orchid')||form.includes('peony')) return 'single-flowered-types';
  if(form.includes('novelty')) return 'novelty';
  return 'novelty';
}

async function main(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const client=await pool.connect();
  try{
    const existing=(await client.query(`SELECT id,slug FROM categories`)).rows;
    const bySlug=new Map(existing.map(x=>[x.slug,x.id]));
    async function upsert(name,slug,description,parentId,level,sort){
      await client.query(`INSERT INTO categories(name,slug,description,icon,sort_order,is_active,sidebar_visible,parent_id,level)
        VALUES($1,$2,$3,'✿',$4,TRUE,TRUE,$5,$6)
        ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sort_order=EXCLUDED.sort_order,is_active=TRUE,sidebar_visible=TRUE,parent_id=EXCLUDED.parent_id,level=EXCLUDED.level`,[name,slug,description,sort,parentId,level]);
      const r=await client.query(`SELECT id FROM categories WHERE slug=$1`,[slug]); bySlug.set(slug,r.rows[0].id); return r.rows[0].id;
    }

    // Retire the custom taxonomy created in the prior pass.
    const custom=['flower-seeds','dahlia-tubers','ranunculus-corms','sunflower-seeds','zinnia-seeds','cosmos-seeds','scabiosa-seeds','marigold-seeds','amaranth-celosia-seeds','lace-flower-seeds','cottage-garden-seeds','foliage-filler-seeds','specialty-flower-seeds','decorative-dahlias','ball-pompon-dahlias','waterlily-dahlias','cactus-laciniated-dahlias','collarette-anemone-orchid-dahlias','stellar-dahlias','specialty-dahlias'];
    await client.query(`UPDATE categories SET is_active=FALSE,sidebar_visible=FALSE WHERE slug=ANY($1::text[])`,[custom]);

    const seedsId=await upsert('Seeds','seeds','Flower seed collections organized using the same collection names used in the Floret Library.',null,0,1);
    for(let i=0;i<SEED_COLLECTIONS.length;i++){
      const c=SEED_COLLECTIONS[i]; await upsert(c.name,c.slug,`${c.name} flower seeds.`,seedsId,1,i+1);
    }
    const dahliasId=await upsert('Dahlias','dahlias','Dahlia tubers organized by bloom form.',null,0,2);
    for(let i=0;i<DAHLIA_COLLECTIONS.length;i++){
      const c=DAHLIA_COLLECTIONS[i]; await upsert(c.name,c.slug,`${c.name} dahlia varieties.`,dahliasId,1,i+1);
    }
    const bulbsId=await upsert('Specialty Bulbs','specialty-bulbs','Specialty bulbs and corms.',null,0,3);
    await upsert('Ranunculus','ranunculus','Ranunculus corms.',bulbsId,1,1);

    // Build exact Floret collection membership by product handle/name.
    const seedMembership=new Map();
    for(const c of SEED_COLLECTIONS){
      try{
        const ps=await fetchCollection(c.handle);
        for(const p of ps){
          const key=norm(p.title); if(!seedMembership.has(key))seedMembership.set(key,[]); if(!seedMembership.get(key).includes(c.slug))seedMembership.get(key).push(c.slug);
        }
        console.log('[floret-taxonomy] loaded seed collection',c.name,ps.length);
      }catch(e){console.warn('[floret-taxonomy] seed collection failed',c.name,e.message)}
    }
    const dahliaMembership=new Map();
    for(const c of DAHLIA_COLLECTIONS){
      try{
        const ps=await fetchCollection(c.handle);
        for(const p of ps){
          const key=norm(p.title); if(!dahliaMembership.has(key))dahliaMembership.set(key,[]); if(!dahliaMembership.get(key).includes(c.slug))dahliaMembership.get(key).push(c.slug);
        }
        console.log('[floret-taxonomy] loaded dahlia collection',c.name,ps.length);
      }catch(e){console.warn('[floret-taxonomy] dahlia collection failed',c.name,e.message)}
    }

    const rows=(await client.query(`SELECT id,name,subcategory,dahlia_type,seed_details FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready' ORDER BY subcategory,name`)).rows;
    const assignments=[];
    for(const row of rows){
      if(row.subcategory==='flower-seeds'){
        let cats=[...(seedMembership.get(norm(row.name))||[])];
        if(!cats.length) cats=fallbackSeedCategories(row.name);
        const primary=primarySeedCategory(cats,row.name);
        assignments.push({row,parent:'seeds',cats,primary});
      }else if(row.subcategory==='dahlias'){
        let cats=[...(dahliaMembership.get(norm(row.name))||[])];
        const primary=cats[0]||fallbackDahliaCategory(row);
        if(!cats.includes(primary))cats.unshift(primary);
        assignments.push({row,parent:'dahlias',cats,primary});
      }else if(row.subcategory==='ranunculus-corms'){
        assignments.push({row,parent:'specialty-bulbs',cats:['ranunculus'],primary:'ranunculus'});
      }
    }

    const grouped={};
    for(const a of assignments)(grouped[a.primary] ||= []).push(a);
    for(const list of Object.values(grouped))list.sort((a,b)=>a.row.name.localeCompare(b.row.name));
    const batchById=new Map();
    for(const [cat,list] of Object.entries(grouped))list.forEach((a,i)=>batchById.set(a.row.id,`${cat}-${String(Math.floor(i/12)+1).padStart(2,'0')}`));

    for(const a of assignments){
      const categoryPath=[a.parent,...a.cats];
      const details={
        shop_taxonomy_status:'floret_library_assigned',
        taxonomy_source:'Floret Library collection structure',
        floret_collection_categories:a.cats,
        primary_shop_category:a.primary,
        image_batch_category:a.primary,
        image_batch_id:batchById.get(a.row.id),
        image_batch_size_max:12,
        wordpress_category_path:categoryPath
      };
      await client.query(`UPDATE sol_products SET categories=$1::jsonb,seed_details=COALESCE(seed_details,'{}'::jsonb)||$2::jsonb,updated_at=NOW() WHERE id=$3`,[JSON.stringify(categoryPath),JSON.stringify(details),a.row.id]);
    }

    const verify=await client.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE seed_details->>'shop_taxonomy_status'='floret_library_assigned')::int assigned,COUNT(*) FILTER(WHERE seed_details->>'image_batch_id' IS NOT NULL)::int batched FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready'`);
    const counts=await client.query(`SELECT seed_details->>'primary_shop_category' category,COUNT(*)::int count FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready' GROUP BY 1 ORDER BY 1`);
    const batchCount=await client.query(`SELECT COUNT(DISTINCT seed_details->>'image_batch_id')::int batches FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready'`);
    console.log('[floret-taxonomy] verify',verify.rows[0]);
    console.log('[floret-taxonomy] primary_counts',counts.rows);
    console.log('[floret-taxonomy] batches',batchCount.rows[0]);
  } finally { client.release(); await pool.end(); }
}
main().catch(e=>{console.error('[floret-taxonomy] failed',e.stack||e.message);process.exit(1)});
