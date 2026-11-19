import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuthenticateAdmin,
  DUMMY_PASSWORD_HASH
} from "../src/services/authentication.ts";

const adminRecord = {
  id: 7,
  email: "admin@example.com",
  passwordHash: "stored-password-hash",
  updatedAt: new Date("2026-01-02T03:04:05.000Z")
};

describe("administrator authentication decisions", () => {
  it("normalizes email and returns safe session data", async () => {
    let queriedEmail = "";
    let comparedHash = "";

    const authenticate = createAuthenticateAdmin({
      async findAdminByEmail(email) {
        queriedEmail = email;
        return adminRecord;
      },
      async comparePassword(_password, hash) {
        comparedHash = hash;
        return true;
      }
    });

    const result = await authenticate(
      "  ADMIN@EXAMPLE.COM  ",
      "correct-password"
    );

    assert.equal(queriedEmail, "admin@example.com");
    assert.equal(comparedHash, adminRecord.passwordHash);
    assert.deepEqual(result, {
      id: 7,
      email: "admin@example.com",
      sessionVersion: "2026-01-02T03:04:05.000Z"
    });
    assert.equal(
      Object.hasOwn(result ?? {}, "passwordHash"),
      false
    );
  });

  it("rejects an incorrect password", async () => {
    const authenticate = createAuthenticateAdmin({
      async findAdminByEmail() {
        return adminRecord;
      },
      async comparePassword() {
        return false;
      }
    });

    assert.equal(
      await authenticate(
        "admin@example.com",
        "incorrect-password"
      ),
      null
    );
  });

  it("performs a dummy comparison for unknown accounts", async () => {
    let comparisonCalled = false;
    let comparedHash = "";

    const authenticate = createAuthenticateAdmin({
      async findAdminByEmail() {
        return null;
      },
      async comparePassword(_password, hash) {
        comparisonCalled = true;
        comparedHash = hash;
        return false;
      }
    });

    const result = await authenticate(
      "unknown@example.com",
      "incorrect-password"
    );

    assert.equal(result, null);
    assert.equal(comparisonCalled, true);
    assert.equal(comparedHash, DUMMY_PASSWORD_HASH);
  });

  it("never authenticates an unknown account", async () => {
    const authenticate = createAuthenticateAdmin({
      async findAdminByEmail() {
        return null;
      },
      async comparePassword() {
        return true;
      }
    });

    assert.equal(
      await authenticate(
        "unknown@example.com",
        "any-password"
      ),
      null
    );
  });
});
