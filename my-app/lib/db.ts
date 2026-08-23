import { Pool } from "@neondatabase/serverless";

declare global {
  // eslint-disable-next-line no-var
  var __neonPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "\n❌  [db.ts] DATABASE_URL is not set.\n" +
      "    Add it to your .env.local file:\n" +
      "    DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require\n"
  );
}

function createPool(): Pool {
  return new Pool({
    connectionString: connectionString ?? "",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

// Reuse pool across hot-reloads in dev; fresh instance in production
const db: Pool =
  process.env.NODE_ENV === "production"
    ? createPool()
    : (global.__neonPool ??= createPool());

if (process.env.NODE_ENV !== "production") {
  global.__neonPool = db;
}

async function verifyConnection(): Promise<void> {
  if (!connectionString) return;
  try {
    await db.query("SELECT 1");
    console.log("✅  [db.ts] PostgreSQL (Neon) connection verified.");
  } catch (err) {
    console.error(
      "\n⚠️  [db.ts] Could not reach the Neon database.\n" +
        "    The application will continue running, but database operations will fail.\n" +
        `    Error: ${(err as Error).message}\n`
    );
  }
}

void verifyConnection();

export { db };
export type { Pool };
