import { db } from "../lib/db";

async function runMigration() {
  try {
    console.log("Running migration...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS outfit_history (
        id             SERIAL PRIMARY KEY,
        top_item_id    UUID REFERENCES wardrobe_items(id) ON DELETE CASCADE,
        bottom_item_id UUID REFERENCES wardrobe_items(id) ON DELETE CASCADE,
        worn_date      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        occasion       VARCHAR(100),
        season         VARCHAR(50)
      );
    `);
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
