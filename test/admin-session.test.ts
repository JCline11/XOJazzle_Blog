import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAdminSessionIdentity,
  isAdminSessionCurrent
} from "../src/auth/admin-session.ts";

describe("administrator session authorization", () => {
  it("rejects a session without an administrator ID", () => {
    assert.equal(
      getAdminSessionIdentity({
        cookie: {} as never,
        adminVersion: "2026-01-01T00:00:00.000Z"
      }),
      null
    );
  });

  it("rejects a session without a version", () => {
    assert.equal(
      getAdminSessionIdentity({
        cookie: {} as never,
        adminUserId: 1
      }),
      null
    );
  });

  it("rejects malformed administrator IDs", () => {
    const invalidIds = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1
    ];

    for (const adminUserId of invalidIds) {
      assert.equal(
        getAdminSessionIdentity({
          cookie: {} as never,
          adminUserId,
          adminVersion:
            "2026-01-01T00:00:00.000Z"
        }),
        null
      );
    }
  });

  it("accepts a complete administrator identity", () => {
    assert.deepEqual(
      getAdminSessionIdentity({
        cookie: {} as never,
        adminUserId: 1,
        adminVersion: "2026-01-01T00:00:00.000Z"
      }),
      {
        adminUserId: 1,
        adminVersion: "2026-01-01T00:00:00.000Z"
      }
    );
  });

  it("accepts only the current database version", () => {
    const updatedAt =
      new Date("2026-01-01T00:00:00.000Z");

    assert.equal(
      isAdminSessionCurrent(
        "2026-01-01T00:00:00.000Z",
        updatedAt
      ),
      true
    );

    assert.equal(
      isAdminSessionCurrent(
        "2025-12-31T00:00:00.000Z",
        updatedAt
      ),
      false
    );

    assert.equal(
      isAdminSessionCurrent(
        "2026-01-01T00:00:00.000Z",
        null
      ),
      false
    );
  });
});
