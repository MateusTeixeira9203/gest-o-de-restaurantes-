import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Keep the current strict TLS verification explicit across pg connection-string upgrades.
const connectionString = process.env.DATABASE_URL?.replace(
  /([?&])sslmode=(?:require|prefer|verify-ca)(?=&|$)/,
  "$1sslmode=verify-full",
);

const globalForDatabase = globalThis as unknown as { dbPool?: Pool };

export const database = globalForDatabase.dbPool ?? new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 8_000,
  idleTimeoutMillis: 20_000,
});

if (process.env.NODE_ENV !== "production") globalForDatabase.dbPool = database;

export const isDatabaseConfigured = () => Boolean(connectionString);

export async function query<Row extends QueryResultRow>(sql: string, values: unknown[] = []) {
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  return database.query<Row>(sql, values);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
