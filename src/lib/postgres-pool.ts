import { Pool } from "pg";

import {
  reportServerError
} from "./report-error.ts";

export function createPostgresPool(
  connectionString: string
): Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 2_000,
    statement_timeout: 10_000,
    lock_timeout: 3_000
  });

  pool.on("error", error => {
    reportServerError("postgres_pool_error", error);
  });

  return pool;
}