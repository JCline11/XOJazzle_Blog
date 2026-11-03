import type {
  IncrementResponse,
  Options,
  Store
} from "express-rate-limit";

import { pgPool } from "../lib/postgres.ts";

type RateLimitRow = {
  totalHits: number | string;
  resetTime: Date | string;
};

export class PostgresRateLimitStore
implements Store {
  readonly localKeys = false;
  readonly prefix = "login:";

  private windowMs = 60_000;

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private createDatabaseKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(
    key: string
  ): Promise<IncrementResponse> {
    const databaseKey = this.createDatabaseKey(key);

    await pgPool.query(`
      DELETE FROM "LoginRateLimit"
      WHERE "resetAt" <= NOW()
    `);

    const result = await pgPool.query<RateLimitRow>(
      `
        INSERT INTO "LoginRateLimit" (
          "key",
          "hits",
          "resetAt"
        )
        VALUES (
          $1,
          1,
          NOW() + (
            $2::integer * INTERVAL '1 millisecond'
          )
        )
        ON CONFLICT ("key")
        DO UPDATE SET
          "hits" = CASE
            WHEN "LoginRateLimit"."resetAt" <= NOW()
              THEN 1
            ELSE "LoginRateLimit"."hits" + 1
          END,
          "resetAt" = CASE
            WHEN "LoginRateLimit"."resetAt" <= NOW()
              THEN EXCLUDED."resetAt"
            ELSE "LoginRateLimit"."resetAt"
          END
        RETURNING
          "hits" AS "totalHits",
          "resetAt" AS "resetTime"
      `,
      [databaseKey, this.windowMs]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(
        "The login rate-limit counter was not returned."
      );
    }

    return {
      totalHits: Number(row.totalHits),
      resetTime: new Date(row.resetTime)
    };
  }

  async decrement(key: string): Promise<void> {
    const databaseKey = this.createDatabaseKey(key);

    await pgPool.query(
      `
        UPDATE "LoginRateLimit"
        SET "hits" = GREATEST("hits" - 1, 0)
        WHERE "key" = $1
      `,
      [databaseKey]
    );
  }

  async resetKey(key: string): Promise<void> {
    const databaseKey = this.createDatabaseKey(key);

    await pgPool.query(
      `
        DELETE FROM "LoginRateLimit"
        WHERE "key" = $1
      `,
      [databaseKey]
    );
  }
}