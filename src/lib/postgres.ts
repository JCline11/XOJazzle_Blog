import { Pool } from "pg";

import { env } from "../config/env.ts";

import {
  reportServerError
} from "./report-error.ts";

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2_000
});

pgPool.on("error", error => {
  reportServerError("postgres_pool_error", error);
});