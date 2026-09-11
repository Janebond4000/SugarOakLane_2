const { Pool } = require('pg');

const SOURCES={
  floret:'https://library.floretflowers.com',
  farmhouse:'https://thefarmhouseflowerfarm.com'
};
const collections=[
  {source:'Floret',base:SOURCES.floret,handle:'seeds',type:'Seed'},
  {source:'Floret',base:SOURCES.floret,handle:'dahlias-a-z',type:'Dahlia'},
  {source:'Floret',base:SOURCES.floret,handle:'ranunculus',type:'Ranunculus/Corm'},
  {source:'Farmhouse Flower Farm',base:SOURCES.farmhouse,handle:'seeds',type:'Seed'},
  {source:'Farmhouse Flower Farm',base:SOURCES.farmhouse,handle:'dahlias',type:'Dahlia'},
  {source:'Farmhouse Flower Farm',base:SOURCES.farmhouse,handle:'speciality-bulbs',type:'Ranunculus/Corm'}
];
const COLORS=[
  ['near-black','near-black'],['black','black'],['burgundy','burgundy'],['maroon','maroon'],['wine','wine'],
  ['scarlet','scarlet'],['crimson','crimson'],['red','red'],['coral','coral'],['salmon','salmon'],['peach','peach'],
  ['apricot','apricot'],['orange','orange'],['gold','gold'],['golden','golden'],['yellow','yellow'],['lemon','lemon'],
  ['chartreuse','chartreuse'],['lime','lime'],['green','green'],['ivory','ivory'],['cream','cream'],['white','white'],
  ['blush','blush'],['rose','rose'],['pink','pink'],['magenta','magenta'],['fuchsia','fuchsia'],['lavender','lavender'],
  ['lilac','lilac'],['purple','purple'],['plum','plum'],['violet','violet'],['bronze','bronze'],['copper','copper'],
  ['terracotta','terracotta'],['brown','brown']
];
const FORMS=['formal decorative','informal decorative','waterlily','ball','miniature ball','pompon','pom pom','cactus','semi-cactus','laciniated','anemone','collarette','single','orchid','stellar','peony'];

function norm(s='') {return String(s).toLowerCase().replace(/[’‘]/g,"'").replace(/®|™/g,'').replace(/^dahlia\s+/,'').replace(/^ranunculus\s+/,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function canonicalTitle(title,type){title=String(title||'').replace(/\s+/g,' ').trim().replace(/\s*[-–—]\s*LIMIT\s*\d+.*$/i,'').trim();if(type==='Dahlia'&&!/^dahlia\b/i.test(title))title='Dahlia '+title;if(type==='Ranunculus/Corm'&&!/^ranunculus\b/i.test(title))title='Ranunculus '+title;return title}
function stripHtml(html=''){return String(html).replace(/<br\s*\/?\s*>/gi,'. ').replace(/<\/p>/gi,'. ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim()}
function first(arr){return arr.find(Boolean)||null}
function uniq(a){return [...new Set(a.filter(Boolean))]}
function colors(text){const t=text.toLowerCase();return uniq(COLORS.filter(([needle])=>new RegExp(`\\b${needle.replace('-','[- ]')}\\b`,'i').test(t)).map(x=>x[1])).slice(0,4)}
function form(text){const t=text.toLowerCase();return first(FORMS.map(f=>t.includes(f)?f:null))}
function height(text){
  const pats=[/(?:height|plants? (?:grow|reach)|grows?)[^\d]{0,20}(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:inches|inch|in\b|")/i,/(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:inches|inch|in\b|")\s*(?:tall|height)?/i,/(\d(?:\.\d)?)\s*(?:-|–|to)\s*(\d(?:\.\d)?)\s*(?:feet|foot|ft\b|')\s*(?:tall|height)?/i];
  for(const p of pats){const m=text.match(p);if(m){if(/feet|foot|ft|'/i.test(m[0]))return `${m[1]}–${m[2]} ft`;return `${m[1]}–${m[2]} in`;}}
  return null;
}
function bloomSize(text){const pats=[/(?:blooms?|flowers?|flower heads?)[^\d]{0,18}(\d(?:\.\d)?)\s*(?:-|–|to)\s*(\d(?:\.\d)?)\s*(?:inches|inch|in\b|")/i,/(\d(?:\.\d)?)\s*(?:-|–|to)\s*(\d(?:\.\d)?)\s*(?:inches|inch|in\b|")\s*(?:blooms?|flowers?)/i,/(\d(?:\.\d)?)\s*(?:inch|in\b|")\s*(?:blooms?|flowers?)/i];for(const p of pats){const m=text.match(p);if(m)return m[2]?`${m[1]}–${m[2]} in`:`${m[1]} in`;}return null}
function maturity(text){const m=text.match(/(?:days? to (?:maturity|bloom)|matures? in|bloom(?:s|ing)? in)[^\d]{0,15}(\d{2,3})(?:\s*(?:-|–|to)\s*(\d{2,3}))?\s*days?/i);return m?(m[2]?`${m[1]}–${m[2]} days`:`${m[1]} days`):null}
function spacing(text){const m=text.match(/(?:space|spacing)[^\d]{0,15}(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*(?:inches|inch|in\b|")/i);return m?(m[2]?`${m[1]}–${m[2]} in`:`${m[1]} in`):null}
function sun(text){if(/full sun/i.test(text))return 'full sun';if(/part(?:ial)? sun|part(?:ial)? shade/i.test(text))return 'part sun';return null}
function lifeCycle(text){if(/\bannual\b/i.test(text))return 'annual';if(/\bperennial\b/i.test(text))return 'perennial';if(/\bbiennial\b/i.test(text))return 'biennial';return null}
function joinColors(c){if(!c.length)return '';if(c.length===1)return c[0];if(c.length===2)return `${c[0]} and ${c[1]}`;return `${c.slice(0,-1).join(', ')}, and ${c[c.length-1]}`}
function chooseRef(refs){return refs.find(r=>r.source==='Floret')||refs[0]}
async function fetchJson(url){const r=await fetch(url,{headers:{'user-agent':'SugarOakLaneFactSync/1.0','accept':'application/json'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
async function fetchCollection(base,handle){let all=[];for(let page=1;page<=8;page++){const d=await fetchJson(`${base}/collections/${handle}/products.json?limit=250&page=${page}`);const a=d.products||[];all.push(...a);if(a.length<250)break}return all}
function typeForSub(s){return s==='dahlias'?'Dahlia':s==='ranunculus-corms'?'Ranunculus/Corm':'Seed'}
function buildCopy(name,type,f){
  const color=joinColors(f.colors);
  const typeWord=type==='Dahlia'?'dahlia':type==='Ranunculus/Corm'?'ranunculus':'flower';
  let short='';
  if(color&&f.form)short=`A ${color} ${typeWord} with ${f.form} blooms${f.bloom_size?` measuring about ${f.bloom_size}`:''}.`;
  else if(color)short=`A ${color} ${typeWord}${f.bloom_size?` with blooms measuring about ${f.bloom_size}`:''}.`;
  else if(f.form)short=`A ${f.form} ${typeWord}${f.bloom_size?` with blooms measuring about ${f.bloom_size}`:''}.`;
  else short=`A distinctive ${typeWord} variety from the Sugar Oak Lane collection.`;
  const parts=[];
  if(color||f.form||f.bloom_size){
    let p=`${name} produces`;
    if(color)p+=` ${color}`;
    if(f.form)p+=` ${f.form}`;
    p+=` blooms`;
    if(f.bloom_size)p+=` measuring about ${f.bloom_size}`;
    parts.push(p+'.');
  }else parts.push(`${name} is a distinctive selection in the Sugar Oak Lane ${typeWord} collection.`);
  const grow=[];if(f.height)grow.push(`Plants reach approximately ${f.height}`);if(f.sun)grow.push(`perform best in ${f.sun}`);if(f.life_cycle)grow.push(`are grown as an ${f.life_cycle}`);if(grow.length)parts.push(grow.join(', ')+'.');
  const timing=[];if(f.maturity)timing.push(`maturity is approximately ${f.maturity}`);if(f.spacing)timing.push(`suggested spacing is about ${f.spacing}`);if(timing.length)parts.push(timing.join('; ')+'.');
  return {short,description:parts.join(' ')};
}

async function main(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
  let originalHandles=new Set();
  try{originalHandles=new Set((await fetchCollection(SOURCES.floret,'floret-originals')).map(p=>p.handle).filter(Boolean))}catch{}
  const map=new Map();
  for(const c of collections){
    let ps=[];try{ps=await fetchCollection(c.base,c.handle)}catch(e){console.warn('[fact-sync] collection failed',c.source,c.handle,e.message);continue}
    if(c.source==='Floret'&&c.type==='Seed'&&originalHandles.size)ps=ps.filter(p=>!originalHandles.has(p.handle));
    if(c.type==='Ranunculus/Corm')ps=ps.filter(p=>/ranunculus/i.test(p.title||''));
    for(const p of ps){const name=canonicalTitle(p.title,c.type),key=c.type+'|'+norm(name);if(!map.has(key))map.set(key,[]);map.get(key).push({source:c.source,body:stripHtml(p.body_html||''),tags:Array.isArray(p.tags)?p.tags.join(' '):String(p.tags||''),product_type:p.product_type||'',vendor:p.vendor||'',url:`${c.base}/products/${p.handle}`});}
  }
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
  let updated=0,insufficient=0,unmatched=0;
  try{
    const rows=(await client.query(`SELECT id,name,slug,subcategory,seed_details FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready' AND COALESCE(seed_details->>'content_status','') <> 'variety_copy_ready' ORDER BY subcategory,name`)).rows;
    for(const row of rows){const type=typeForSub(row.subcategory),refs=map.get(type+'|'+norm(row.name))||[];if(!refs.length){unmatched++;continue}const ref=chooseRef(refs),text=[ref.body,ref.tags,ref.product_type].join(' ');const facts={colors:colors(text),form:form(text),height:height(text),bloom_size:bloomSize(text),maturity:maturity(text),spacing:spacing(text),sun:sun(text),life_cycle:lifeCycle(text)};const factCount=[facts.colors.length?1:0,facts.form,facts.height,facts.bloom_size,facts.maturity,facts.spacing,facts.sun,facts.life_cycle].filter(Boolean).length;if(factCount<2){insufficient++;await client.query(`UPDATE sol_products SET seed_details=COALESCE(seed_details,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2`,[JSON.stringify({fact_extraction_status:'insufficient',fact_extraction_source:ref.url}),row.id]);continue}const copy=buildCopy(row.name,type,facts);const detail={fact_extraction_status:'ready',fact_extraction_source:ref.url,extracted_color_terms:facts.colors,extracted_form:facts.form,extracted_height:facts.height,extracted_bloom_size:facts.bloom_size,extracted_maturity:facts.maturity,extracted_spacing:facts.spacing,extracted_light:facts.sun,extracted_life_cycle:facts.life_cycle,content_status:'variety_copy_ready',copy_method:'original_template_from_structured_source_facts'};const seo=(type==='Dahlia'?`${row.name} dahlia tuber from Sugar Oak Lane. ${copy.short}`:type==='Seed'?`${row.name} flower seeds from Sugar Oak Lane. ${copy.short}`:`${row.name} ranunculus corms from Sugar Oak Lane. ${copy.short}`).slice(0,220);await client.query(`UPDATE sol_products SET short_description=$1,description=$2,seo_description=$3,seed_details=COALESCE(seed_details,'{}'::jsonb)||$4::jsonb,updated_at=NOW() WHERE id=$5`,[copy.short,copy.description,seo,JSON.stringify(detail),row.id]);updated++}
    console.log('[fact-sync] complete',JSON.stringify({candidates:rows.length,updated,insufficient,unmatched}));
    const counts=await client.query(`SELECT subcategory,COUNT(*)::int total,COUNT(*) FILTER(WHERE seed_details->>'content_status'='variety_copy_ready')::int ready FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready' GROUP BY subcategory ORDER BY subcategory`);console.log('[fact-sync] content',JSON.stringify(counts.rows));
  }finally{client.release();await pool.end()}
}
main().catch(e=>{console.error('[fact-sync] failed',e.stack||e.message);process.exit(1)});
