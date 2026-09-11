const { Pool } = require('pg');

const SOURCES = {
  floret: 'https://library.floretflowers.com',
  farmhouse: 'https://thefarmhouseflowerfarm.com'
};
const collections = [
  { source:'Floret', base:SOURCES.floret, handle:'seeds', type:'Seed' },
  { source:'Floret', base:SOURCES.floret, handle:'dahlias-a-z', type:'Dahlia' },
  { source:'Floret', base:SOURCES.floret, handle:'ranunculus', type:'Ranunculus/Corm' },
  { source:'Farmhouse Flower Farm', base:SOURCES.farmhouse, handle:'seeds', type:'Seed' },
  { source:'Farmhouse Flower Farm', base:SOURCES.farmhouse, handle:'dahlias', type:'Dahlia' },
  { source:'Farmhouse Flower Farm', base:SOURCES.farmhouse, handle:'speciality-bulbs', type:'Ranunculus/Corm' }
];

function norm(s='') {
  return String(s).toLowerCase()
    .replace(/[’‘]/g,"'").replace(/[“”]/g,'"')
    .replace(/\s*[-–—]\s*limit\s*\d+.*$/i,'')
    .replace(/^dahlia\s+/i,'').replace(/^ranunculus\s+/i,'')
    .replace(/®|™/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function canonicalTitle(title,type){
  title=String(title||'').replace(/\s+/g,' ').trim().replace(/\s*[-–—]\s*LIMIT\s*\d+.*$/i,'').trim();
  if(type==='Dahlia' && !/^dahlia\b/i.test(title)) title='Dahlia '+title;
  if(type==='Ranunculus/Corm' && !/^ranunculus\b/i.test(title)) title='Ranunculus '+title;
  return title;
}
function imgOf(p){
  const x=(p.images&&p.images[0])||p.image||null;
  if(!x) return '';
  if(typeof x==='string') return x.startsWith('//')?'https:'+x:x;
  const u=x.src||x.url||''; return u.startsWith('//')?'https:'+u:u;
}
function priceOf(p){
  const nums=(p.variants||[]).map(v=>Number(v.price)).filter(n=>Number.isFinite(n)&&n>0);
  return nums.length ? Math.min(...nums) : null;
}
async function fetchJson(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 SugarOakLaneCatalogReferenceSync/1.0','accept':'application/json,text/plain,*/*'}});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}
async function fetchCollection(base,handle){
  const all=[];
  for(let page=1;page<=8;page++){
    const data=await fetchJson(`${base}/collections/${handle}/products.json?limit=250&page=${page}`);
    const arr=data.products||[]; all.push(...arr); if(arr.length<250) break;
  }
  return all;
}
function typeForSubcategory(s){
  if(s==='dahlias') return 'Dahlia';
  if(s==='ranunculus-corms') return 'Ranunculus/Corm';
  return 'Seed';
}

async function main(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const client=await pool.connect();
  try{
    let floretOriginals=new Set();
    try{
      const originals=await fetchCollection(SOURCES.floret,'floret-originals');
      floretOriginals=new Set(originals.map(p=>p.handle).filter(Boolean));
      console.log(`[source-sync] excluding ${floretOriginals.size} Floret Original handles`);
    }catch(e){ console.warn('[source-sync] originals lookup failed:',e.message); }

    const map=new Map();
    for(const c of collections){
      try{
        let products=await fetchCollection(c.base,c.handle);
        if(c.source==='Floret' && c.type==='Seed' && floretOriginals.size)
          products=products.filter(p=>!floretOriginals.has(p.handle));
        if(c.type==='Ranunculus/Corm') products=products.filter(p=>/ranunculus/i.test(p.title||''));
        for(const p of products){
          const name=canonicalTitle(p.title,c.type); if(!name) continue;
          const key=c.type+'|'+norm(name);
          const rec={
            source:c.source,
            url:`${c.base}/products/${p.handle}`,
            handle:p.handle||'',
            image:imgOf(p),
            price:priceOf(p),
            product_type:String(p.product_type||'').slice(0,160),
            vendor:String(p.vendor||'').slice(0,160),
            tags:Array.isArray(p.tags)?p.tags.slice(0,40):[]
          };
          if(!map.has(key)) map.set(key,[]);
          if(!map.get(key).some(x=>x.url===rec.url)) map.get(key).push(rec);
        }
        console.log(`[source-sync] loaded ${c.source} ${c.handle}: ${products.length}`);
      }catch(e){ console.warn(`[source-sync] ${c.source} ${c.handle} failed:`,e.message); }
    }

    const rows=(await client.query(`
      SELECT id,name,subcategory,seed_details
      FROM sol_products
      WHERE seed_details->>'catalog_status'='staging_ready'
        AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
      ORDER BY subcategory,name
    `)).rows;

    let matched=0,unmatched=0,multi=0;
    for(const row of rows){
      const type=typeForSubcategory(row.subcategory);
      const refs=map.get(type+'|'+norm(row.name))||[];
      if(refs.length){ matched++; if(refs.length>1) multi++; } else unmatched++;
      const prices=refs.map(x=>x.price).filter(n=>Number.isFinite(n));
      const details={
        source_sync_status: refs.length?'matched':'unmatched',
        source_sync_at: new Date().toISOString(),
        source_reference_count: refs.length,
        source_references: refs,
        source_price_min: prices.length?Math.min(...prices):null,
        source_price_max: prices.length?Math.max(...prices):null,
        source_reference_private_only: true
      };
      await client.query(`
        UPDATE sol_products
        SET seed_details=COALESCE(seed_details,'{}'::jsonb) || $1::jsonb,
            updated_at=NOW()
        WHERE id=$2
      `,[JSON.stringify(details),row.id]);
    }
    console.log('[source-sync] complete',{total:rows.length,matched,unmatched,multiple_sources:multi});
  } finally {
    client.release(); await pool.end();
  }
}
main().catch(e=>{console.error('[source-sync] failed:',e.stack||e.message);process.exit(1);});
