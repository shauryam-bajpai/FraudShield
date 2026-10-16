import { Pool } from "pg";
import { env } from "./env";

export const db = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

export async function checkDatabaseConnection(): Promise<void> {
    await db.query("SELECT 1");
}