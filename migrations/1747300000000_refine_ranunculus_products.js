const zlib = require('zlib');

const DATA = 'H4sIAI5po2oC/72X247rNBSGX8Wa66ZNmlOLhNAGCYQENwixLxAaOfZKY8axI9tpd0FIvANvyJOwbCc9zEw7EtLsqx7sLK/l9fn3n1//fFC0h4cvHn6ialRslKMlHqquFBAvqamOT4sHqwcdzjFnKYkdJqSNPOUThuHcz6QwUAvxp40Y9NI2I19Mgj1RM4Pk4NwHZHU7GBBDnR/JI3UurdEK2Kd0WpH7GCE/3DQ2yVG52CZEYMTWvk1rvIjwhJKOrHrEtEPlDlyY70jGOALwgwMkEjxBGQARyU+rThGYBKoOWdNnFawJD93cN4PC0aA9QvuqRyBk1abWIghrdQHMHaBSY+GH2PuixAb0zJ6j9OdloB5MSC6xcpNL861HoC6DoyvlmmpzaPSDixW+zKv8GiocoGBHKhYISUDleDro/2RMFAODEbrALfGtyZL//37n6wkQvl+6dEweByNxJHOucF+sVpJ0RhqjkusxYCbKloy3a+wAD4yZ1d3GYgxRU93cBGVcbVEPAbRHkMsu2qFBLvKVmlVlKt6m+erTVFtzotEFmVYBTffL+JbLeDxl/xDWRbbZP3YlBlv16xNtm2WJUXJMA8OLGnrhtICB6psvfx92H21/zKr6qwusyKvHv5a3AdeUvb0BvDzlBPw3OCgE4wobFQcf0HfHuQe3JH01GjE/AK8FoPKo0fLUIeMAN/BXeZD/MYzYwl8coZqgwPYNsJhwKWQDwRpxmpHDQe1JN87S4xg3ZzB1FzCqCIIDA/JS38UMTweyw5bRKQn5zK5KW8bqfPLcGqeSAB2hpCDFAxnL4jD9EZDZajpJdjznnCAYU4Lkz/v4ueBd+7ne8Lr14js5gWyWxdpSvOqSqDZ0qRYNzzZNHmdbOsSOEvppubpM3aL9E12tWq0egPe05wTvXuxF5z4qpWj52g35LodJfLA9YhihFKK2UgpaFTTqOL30A2re/nEbYEgnhFPD+Kh87qmHLHUQ+NpmxAO1CzJDy8zOF0cA9IoFMK3w7b7Z+Z6vIgHyccDin9TYvSoeLgGrnKPuCDRFBNwmC8GHZ2P2WisvgEeTyvDPykeBrWDHhewL6kOh+xZGp8H5FNv34Pk2LvIcJ0+pqygWZs1SZWnNarvtkqajNOkLus8TWtgVQnPCc7fIvibDouRWO99iNnltBPHRuO4V+ELchER/8gOv4y2ixz08U5uMAK4xEoxDNj4YBmw2wFzpGFs2+PbQJ8SJh21UXVRGRdEjf6S5+E+dg4iVj19Qu9wkZ3VZLSAPIeTcADOg6b77AaK9kFOp8MuybeTWgfwMBxSvOteqSoYgFhaLAmP217sNM63ZJC4QdNxnn3WbLCuGb4OHIKGaDc27rPgfdX19yD81EwPeVVt6iR/XNOKV3lbJmmGv4uapsmWtSwpoYRNxYBh4OeY129h/rETDu4jfpinnPD2LhDtsdKHOHhbqWmDCoedXszOdBJJD5kBbzf4tTm4R3jINThsRQD9pxfoYTRThlc04zBzkyeec5h0NUgvsuNPyGVSxIo/gFBrNRNB8UMB7qXljv4FE7QD+oPReVMRTUc8VcIRsANgFH857BEo1HsZrxiUbHdRbEgE9ijLiVB2EMafU38y/OF73X3HfSdzU96f9VP734Pz0NIg5FWaoxkpi2q9zcs2KTZsi1KOKr4pmnVSldu8oGva5DS/ZrzMshuM30b7NaKx8ajXr+N0+c6G2m7h0mPEHn5ieIGDdwyTT5gaPWDrsJ1UvuT64/NlJh8dFiIUXa2ZvuMLWsQtZjYZ38lbR6scgbpwFwFvrZ/8w5RYrybTpFCBF2P8299JuICXXo91fH09Izvj7dHtdA/P+V2cbRE6C6HCO6ffj+kCuaA63j6vQO23/AbO6/QOzlhgi6+enfb3VoDZ/7zJ8//HeFOkq21ab1bZdpueY3//43ePdZmecKzTsqi3RYbO4rf/AP06tcLKEAAA';

module.exports = {
  name: 'refine_ranunculus_products',
  up: async (client) => {
    const items = JSON.parse(zlib.gunzipSync(Buffer.from(DATA,'base64')).toString('utf8'));
    for (const p of items) {
      const details = {
        botanical_reference_status: 'source-backed',
        product_unit: '10 corm pack',
        pack_quantity: 10,
        site: 'full sun',
        days_to_bloom: 'about 90 days after planting under suitable conditions',
        plant_height: p.height,
        vase_life: 'typically 7–12 days when cut at the colored, soft-bud stage',
        color_notes: p.color_notes,
        source_reference_url: p.source_url,
        source_reference_image: p.source_image,
        source_reference_only: true,
        content_status: 'variety_copy_ready',
        pricing_status: 'working_price_review_required',
        image_prompt_reference: `${p.color_notes}; layered ranunculus bloom; white studio botanical portrait`
      };
      const seo = `Grow ${p.name} from Sugar Oak Lane. 10-corm pack; ${p.color_notes}; selected for spring containers, home gardens and beautiful cut flowers.`.slice(0,220);
      await client.query(`
        UPDATE sol_products
        SET short_description=$1,
            description=$2,
            price=14.95,
            price_label='$14.95 · 10 corms',
            seo_title=$3,
            seo_description=$4,
            seed_details=COALESCE(seed_details,'{}'::jsonb) || $5::jsonb,
            updated_at=NOW()
        WHERE slug=$6
          AND seed_details->>'catalog_status'='staging_ready'
      `,[p.short,p.description,`${p.name} Corms | Sugar Oak Lane`.slice(0,120),seo,JSON.stringify(details),p.slug]);
    }
    const check=await client.query(`
      SELECT COUNT(*)::int AS count
      FROM sol_products
      WHERE subcategory='ranunculus-corms'
        AND seed_details->>'content_status'='variety_copy_ready'
    `);
    console.log('[migration] ranunculus products refined:',check.rows[0]?.count);
  },
  down: async () => {}
};
