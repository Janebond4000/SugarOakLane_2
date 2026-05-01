/**
 * Floral Add-ons v2 — structured pricing, tiered options, conditional vase logic
 *
 * 1. Add metadata columns to sol_floral_addons
 *    - addon_group  — UI section key
 *    - radio_group  — mutually exclusive group (e.g. 'chocolates', 'teddy')
 *    - options      — JSONB array of selectable option strings
 *    - requires_option — true = option must be selected before submit
 *    - max_quantity  — per-item quantity cap
 *    - vase_type    — 'add' | 'upgrade' | NULL
 * 2. Add option_selected to sol_floral_order_addons
 * 3. Add floral_has_vase to sol_products
 * 4. Wipe and re-seed add-ons with structured data + correct prices
 */
module.exports = {
  name: 'floral_addons_v2',

  up: async (client) => {
    // ── Step 1: New columns on sol_floral_addons ─────────────────────────────
    await client.query(`
      ALTER TABLE sol_floral_addons
        ADD COLUMN IF NOT EXISTS addon_group     VARCHAR(60)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS radio_group     VARCHAR(60)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS options         JSONB        DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS requires_option BOOLEAN      NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS max_quantity    INT          NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS vase_type       VARCHAR(20)  DEFAULT NULL
    `);

    // ── Step 2: option_selected on order addons ──────────────────────────────
    await client.query(`
      ALTER TABLE sol_floral_order_addons
        ADD COLUMN IF NOT EXISTS option_selected VARCHAR(120) DEFAULT NULL
    `);

    // ── Step 3: floral_has_vase on products ──────────────────────────────────
    await client.query(`
      ALTER TABLE sol_products
        ADD COLUMN IF NOT EXISTS floral_has_vase BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // ── Step 4: Wipe old add-ons and re-seed with v2 structure ───────────────
    // Safe to delete because order_addons reference addons by id,
    // but for a schema migration we clear existing catalog rows and rebuild.
    // Any in-flight orders lose addon references, acceptable for a dev migration.
    await client.query(`DELETE FROM sol_floral_order_addons`);
    await client.query(`DELETE FROM sol_floral_addons`);
    await client.query(`ALTER SEQUENCE sol_floral_addons_id_seq RESTART WITH 1`);

    await client.query(`
      INSERT INTO sol_floral_addons
        (name, price, addon_group, radio_group, options, requires_option, max_quantity, vase_type, sort_order, active)
      VALUES
        -- ── Enhance Your Gift ─────────────────────────────────────────────
        ('Mylar Balloon',        6.00,  'enhance', NULL,         '["Celebration","Neutral"]',                     false, 3,  NULL,      10, true),
        ('Standard Card',        6.00,  'enhance', NULL,         NULL,                                             false, 1,  NULL,      20, true),
        -- ── Sweet Additions ───────────────────────────────────────────────
        ('Chocolates – Small',  15.00,  'sweet',   'chocolates', NULL,                                             false, 1,  NULL,      30, true),
        ('Chocolates – Medium', 20.00,  'sweet',   'chocolates', NULL,                                             false, 1,  NULL,      31, true),
        ('Chocolates – Large',  25.00,  'sweet',   'chocolates', NULL,                                             false, 1,  NULL,      32, true),
        ('Teddy Bear – Small',  15.00,  'sweet',   'teddy',      NULL,                                             false, 1,  NULL,      40, true),
        ('Teddy Bear – Medium', 25.00,  'sweet',   'teddy',      NULL,                                             false, 1,  NULL,      41, true),
        ('Teddy Bear – Large',  40.00,  'sweet',   'teddy',      NULL,                                             false, 1,  NULL,      42, true),
        -- ── Wellness ─────────────────────────────────────────────────────
        ('Candle',              15.00,  'wellness', NULL,        NULL,                                             false, 1,  NULL,      50, true),
        ('Bath Salts',          15.00,  'wellness', NULL,        NULL,                                             false, 1,  NULL,      51, true),
        ('Sugar Scrub',         10.00,  'wellness', NULL,        '["Lavender","Eucalyptus","Rose","Vanilla"]',     true,  1,  NULL,      52, true),
        ('Dried Tea',           12.00,  'wellness', NULL,        '["Mint Medley","Hibiscus","Yarrow Chamomile Apple"]', false, 1, NULL,  53, true),
        -- ── Vase Options ─────────────────────────────────────────────────
        ('Add a Vase',          15.00,  'vase',    NULL,         NULL,                                             false, 1,  'add',     60, true),
        ('Upgrade Vase',        25.00,  'vase',    NULL,         NULL,                                             false, 1,  'upgrade', 61, true)
    `);

    console.log('[migration] floral_addons_v2: done');
  },

  down: async (client) => {
    await client.query(`DELETE FROM sol_floral_order_addons`);
    await client.query(`DELETE FROM sol_floral_addons`);
    await client.query(`ALTER TABLE sol_floral_order_addons DROP COLUMN IF EXISTS option_selected`);
    await client.query(`ALTER TABLE sol_products DROP COLUMN IF EXISTS floral_has_vase`);
    await client.query(`
      ALTER TABLE sol_floral_addons
        DROP COLUMN IF EXISTS addon_group,
        DROP COLUMN IF EXISTS radio_group,
        DROP COLUMN IF EXISTS options,
        DROP COLUMN IF EXISTS requires_option,
        DROP COLUMN IF EXISTS max_quantity,
        DROP COLUMN IF EXISTS vase_type
    `);
    // Re-seed original 8 rows
    await client.query(`
      INSERT INTO sol_floral_addons (name, price, sort_order)
      VALUES
        ('Chocolates', NULL, 1), ('Balloons', NULL, 2), ('Card', NULL, 3),
        ('Teddy Bear', NULL, 4), ('Candle', NULL, 5), ('Tea', NULL, 6),
        ('Bath Salts', NULL, 7), ('Spa Gift Set', NULL, 8)
      ON CONFLICT DO NOTHING
    `);
  }
};
