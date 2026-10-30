import { Pool } from "pg";
import { env } from "../config/env.ts";

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL
});

pgPool.on("error", error => {
  console.error("Unexpected PostgreSQL pool error:", error);
});