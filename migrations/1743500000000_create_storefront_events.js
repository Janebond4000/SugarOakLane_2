module.exports = {
  name: 'create_storefront_events',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS storefront_events (
        id          BIGSERIAL PRIMARY KEY,
        event_type  VARCHAR(50)  NOT NULL,
        session_id  VARCHAR(100),
        product_id  INTEGER,
        product_slug VARCHAR(255),
        utm_params  JSONB        NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS storefront_events_event_type_idx
        ON storefront_events (event_type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS storefront_events_created_at_idx
        ON storefront_events (created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS storefront_events_session_id_idx
        ON storefront_events (session_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS storefront_events_utm_source_idx
        ON storefront_events ((utm_params->>'utm_source'))
        WHERE utm_params->>'utm_source' IS NOT NULL
    `);
  }
};
