import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const connectionString = process.env.PRESS_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "La variable PRESS_DATABASE_URL est absente."
  );
}

export const pressPool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const pressDb = drizzle(pressPool);

export async function testPressDatabaseConnection() {
  const client = await pressPool.connect();

  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}
