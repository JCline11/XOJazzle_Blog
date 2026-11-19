import { env } from "../config/env.ts";

import {
  createPostgresPool
} from "./postgres-pool.ts";

export const pgPool = createPostgresPool(
  env.DATABASE_URL
);