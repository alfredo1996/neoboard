import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// A real pool, not a single serialized connection: `max: 1` (inherited
// from serverless example code) queued every concurrent API request behind
// one Postgres session — under load, login/users/form flows timed out
// (#1004). Override per deployment with DB_POOL_MAX.
const client = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

export const db = drizzle(client, { schema });
