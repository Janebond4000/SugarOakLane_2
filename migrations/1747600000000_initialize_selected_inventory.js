/**
 * Give every selected catalog SKU an explicit, safe inventory state.
 * Zero is accurate for launch staging: nothing is salable until inventory is
 * intentionally received/assigned and publish_ready is approved.
 */
module.exports={
  name:'initialize_selected_inventory',
  up:async(client)=>{
    await client.query(`
      UPDATE sol_products
      SET stock_quantity=COALESCE(stock_quantity,0),
          track_inventory=TRUE,
          stock_status=CASE WHEN COALESCE(stock_quantity,0)>0 THEN stock_status ELSE 'sold_out' END,
          availability=CASE WHEN COALESCE(stock_quantity,0)>0 THEN availability ELSE 'coming_soon' END,
          seed_details=COALESCE(seed_details,'{}'::jsonb)||jsonb_build_object(
            'inventory_status',CASE WHEN COALESCE(stock_quantity,0)>0 THEN 'assigned' ELSE 'zero_until_received' END
          ),
          updated_at=NOW()
      WHERE seed_details->>'catalog_status'='staging_ready'
        AND subcategory IN ('flower-seeds','dahlias','ranunculus-corms')
    `);
    const r=await client.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE stock_quantity IS NOT NULL)::int assigned,COALESCE(SUM(stock_quantity),0)::int salable_units FROM sol_products WHERE seed_details->>'catalog_status'='staging_ready'`);
    console.log('[inventory-init]',r.rows[0]);
  },
  down:async()=>{}
};
