const { Pool } = require('pg');

function familyFromName(name='') {
  const n = String(name).replace(/^[“”"']|[“”"']$/g,'').trim();
  const rules = [
    ['Sunflowers', /sunflower/i], ['Zinnias', /zinnia/i], ['Cosmos', /cosmos/i], ['Sweet Peas', /sweet pea/i],
    ['Snapdragons', /snapdragon/i], ['Celosia', /celosia|cockscomb/i], ['Amaranth', /amaranth/i], ['Poppies', /poppy/i],
    ['Scabiosa', /scabiosa|pincushion/i], ['Asters', /aster/i], ['Larkspur', /larkspur/i], ['Delphinium', /delphinium/i],
    ['Stock', /stock\b/i], ['Bachelor Buttons', /bachelor|cornflower/i], ['Calendula', /calendula/i], ['Marigolds', /marigold/i],
    ['Nasturtiums', /nasturtium/i], ['Nigella', /nigella|love-in-a-mist/i], ['Orlaya', /orlaya/i], ['Phlox', /phlox/i],
    ['Strawflowers', /strawflower/i], ['Statice', /statice|limonium/i], ['Yarrow', /yarrow|achillea/i], ['Feverfew', /feverfew/i],
    ['Dill', /dill/i], ['Basil', /basil/i], ['Cress', /cress/i], ['Bupluerum', /bupleurum/i], ['Bells of Ireland', /bells of ireland/i],
    ['Agrostemma', /agrostemma/i], ['Ageratum', /ageratum/i], ['Cerinthe', /cerinthe/i], ['Cynoglossum', /cynoglossum|chinese forget-me-not/i],
    ['Dianthus', /dianthus/i], ['Eucalyptus', /eucalyptus/i], ['Gomphrena', /gomphrena/i], ['Lace Flower', /lace flower|didiscus/i],
    ['Lisianthus', /lisianthus/i], ['Mignonette', /mignonette/i], ['Nicandra', /nicandra/i], ['Rudbeckia', /rudbeckia/i],
    ['Salvia', /salvia/i], ['Saponaria', /saponaria/i], ['Verbena', /verbena/i]
  ];
  for (const [label,re] of rules) if (re.test(n)) return label;
  return 'Other Specialty Seeds';
}

async function main(){
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  try {
    const rows=(await pool.query(`SELECT name,slug,subcategory,dahlia_type,flower_name,seed_details FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready' ORDER BY subcategory,name`)).rows;
    const seeds=rows.filter(r=>r.subcategory==='flower-seeds');
    const seedGroups={};
    for(const r of seeds){const f=familyFromName(r.name);(seedGroups[f] ||= []).push(r.name)}
    console.log('[category-report] seed_groups',JSON.stringify(Object.entries(seedGroups).sort((a,b)=>b[1].length-a[1].length).map(([category,names])=>({category,count:names.length,names}))));
    const dahlias=rows.filter(r=>r.subcategory==='dahlias');
    const forms={};
    for(const r of dahlias){
      const d=r.seed_details||{};
      const form=(d.extracted_form||d.bloom_form||d.dahlia_form||r.dahlia_type||'Unclassified').toString();
      (forms[form] ||= []).push(r.name);
    }
    console.log('[category-report] dahlia_forms',JSON.stringify(Object.entries(forms).sort((a,b)=>b[1].length-a[1].length).map(([category,names])=>({category,count:names.length,names}))));
    const ran=rows.filter(r=>r.subcategory==='ranunculus-corms').map(r=>r.name);
    console.log('[category-report] ranunculus',JSON.stringify(ran));
    console.log('[category-report] totals',JSON.stringify({total:rows.length,seeds:seeds.length,dahlias:dahlias.length,ranunculus:ran.length}));
  } finally { await pool.end(); }
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1)});
