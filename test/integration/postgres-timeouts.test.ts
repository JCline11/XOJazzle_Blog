import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import {
  after,
  describe,
  it
} from "node:test";

import {
  createPostgresPool
} from "../../src/lib/postgres-pool.ts";

import {
  getTestDatabaseUrl
} from "../helpers/test-database.ts";

const pool = createPostgresPool(
  getTestDatabaseUrl()
);

after(async () => {
  await pool.end();
});

function hasSqlState(
  expected: string
): (error: unknown) => boolean {
  return error => (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === expected
  );
}

describe(
  "PostgreSQL timeout policy",
  { concurrency: false },
  () => {
    it(
      "applies the intended server-side settings",
      async () => {
        const result = await pool.query<{
          name: string;
          milliseconds: number;
        }>(`
          SELECT
            name,
            setting::integer AS milliseconds
          FROM pg_settings
          WHERE name IN (
            'statement_timeout',
            'lock_timeout'
          )
          ORDER BY name
        `);

        assert.deepEqual(result.rows, [
          {
            name: "lock_timeout",
            milliseconds: 3_000
          },
          {
            name: "statement_timeout",
            milliseconds: 10_000
          }
        ]);
      }
    );

    it(
      "cancels a long statement and remains usable",
      { timeout: 20_000 },
      async () => {
        await assert.rejects(
          pool.query("SELECT pg_sleep(12)"),
          hasSqlState("57014")
        );

        const result = await pool.query(
          "SELECT 1::integer AS ok"
        );

        assert.equal(result.rows[0].ok, 1);
      }
    );

    it(
      "cancels a blocked lock request and releases clients",
      { timeout: 15_000 },
      async () => {
        const key = [
          randomInt(1, 2_147_483_647),
          randomInt(1, 2_147_483_647)
        ];

        const lockSql = `
          SELECT pg_advisory_xact_lock(
            $1::integer,
            $2::integer
          )
        `;

        const holder = await pool.connect();

        try {
          await holder.query("BEGIN READ ONLY");
          await holder.query(lockSql, key);

          const waiter = await pool.connect();

          try {
            await waiter.query("BEGIN READ ONLY");

            // Bounds this test if lock_timeout is removed.
            await waiter.query(
              "SET LOCAL statement_timeout = '6s'"
            );

            await assert.rejects(
              waiter.query(lockSql, key),
              hasSqlState("55P03")
            );
          } finally {
            try {
              await waiter.query("ROLLBACK");
            } finally {
              waiter.release(true);
            }
          }
        } finally {
          try {
            await holder.query("ROLLBACK");
          } finally {
            holder.release(true);
          }
        }

        const result = await pool.query(
          "SELECT 1::integer AS ok"
        );

        assert.equal(result.rows[0].ok, 1);
      }
    );
  }
);