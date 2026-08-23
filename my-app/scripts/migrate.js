const { Pool } = require("@neondatabase/serverless");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const dbUrl = env.split("\n").find(line => line.startsWith("DATABASE_URL=")).split("=")[1].replace(/"/g, "").trim();

const db = new Pool({ connectionString: dbUrl });


async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS kp_users (
      id            BIGSERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      image         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS kp_users_username_idx ON kp_users (username);
    CREATE UNIQUE INDEX IF NOT EXISTS kp_users_email_idx ON kp_users (email);
  `);
  console.log("✅ Migration complete — kp_users table ready.");
  process.exit(0);
}

migrate().catch(e => { console.error("❌", e.message); process.exit(1); });
