import { db } from "../lib/db";

async function fixHistoryIsolation() {
  try {
    console.log("Adding user_id column to outfit_history...");
    await db.query(`
      ALTER TABLE outfit_history
      ADD COLUMN IF NOT EXISTS user_id TEXT;
    `);
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

fixHistoryIsolation();
