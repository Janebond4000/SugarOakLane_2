module.exports = {
  name: '1746400000000_add_workshop_location_date',

  up: async (client) => {
    // Add preferred_date and location columns to support the updated workshop inquiry form
    await client.query(`
      ALTER TABLE sol_workshop_inquiries
        ADD COLUMN IF NOT EXISTS preferred_date DATE,
        ADD COLUMN IF NOT EXISTS location VARCHAR(255)
    `);
  },

  down: async (client) => {
    await client.query(`
      ALTER TABLE sol_workshop_inquiries
        DROP COLUMN IF EXISTS preferred_date,
        DROP COLUMN IF EXISTS location
    `);
  },
};
