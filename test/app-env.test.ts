import assert from "node:assert/strict";

import {
  describe,
  it
} from "node:test";

import {
  loadAppEnv
} from "../src/config/app-env.ts";

type EnvironmentSource =
  Record<string, string | undefined>;

function development(
  overrides: EnvironmentSource = {}
): EnvironmentSource {
  return {
    DATABASE_URL:
      "postgresql://test:unused@127.0.0.1:1/xojazzle_test",

    SESSION_SECRET:
      "synthetic-session-secret-for-tests-only",

    ...overrides
  };
}

function production(
  overrides: EnvironmentSource = {}
): EnvironmentSource {
  return development({
    NODE_ENV: "production",
    SITE_ORIGIN: "https://blog.example.test",
    R2_ACCOUNT_ID: "0".repeat(32),
    R2_ACCESS_KEY_ID: "synthetic-access-key",
    R2_SECRET_ACCESS_KEY: "synthetic-secret-key",
    R2_BUCKET_NAME: "test-images",
    R2_PUBLIC_BASE_URL: "https://images.example.test",
    ...overrides
  });
}

describe("application environment", () => {
  it("uses development defaults without requiring R2", () => {
    const values = loadAppEnv(development());

    assert.equal(values.NODE_ENV, "development");
    assert.equal(values.PORT, 3000);
    assert.equal(values.SITE_ORIGIN, "http://localhost:3000");
  });

  it("supports test mode and converts the port to a number", () => {
    const values = loadAppEnv(development({
      NODE_ENV: "test",
      PORT: "4000"
    }));

    assert.equal(values.NODE_ENV, "test");
    assert.equal(values.PORT, 4000);
    assert.equal(values.SITE_ORIGIN, "http://localhost:4000");
  });

  it("accepts production settings and normalizes the origin", () => {
    const values = loadAppEnv(production({
      SITE_ORIGIN: "https://blog.example.test/"
    }));

    assert.equal(values.NODE_ENV, "production");
    assert.equal(values.SITE_ORIGIN, "https://blog.example.test");

    assert.deepEqual(Object.keys(values).sort(), [
      "DATABASE_URL",
      "NODE_ENV",
      "PORT",
      "SESSION_SECRET",
      "SITE_ORIGIN"
    ]);
  });

  it("rejects malformed or unsupported database URLs", () => {
    for (const value of [
      "",
      "not-a-url",
      "https://example.test/blog",
      "mysql://test:unused@localhost/blog",
      "postgresql:///blog",
      "postgresql://localhost",
      "postgresql://localhost/blog#fragment"
    ]) {
      assert.throws(
        () => loadAppEnv(development({
          DATABASE_URL: value
        })),
        /DATABASE_URL/
      );
    }
  });

  it("rejects short secrets and secrets made from padding", () => {
    for (const value of [
      "short",
      " ".repeat(40),
      " ".repeat(20) + "x".repeat(20)
    ]) {
      assert.throws(
        () => loadAppEnv(development({
          SESSION_SECRET: value
        })),
        /SESSION_SECRET/
      );
    }
  });

  it("rejects invalid environment names and ports", () => {
    for (const [name, value] of [
      ["NODE_ENV", "staging"],
      ["PORT", "0"],
      ["PORT", "65536"],
      ["PORT", "not-a-number"],
      ["PORT", ""]
    ]) {
      assert.throws(
        () => loadAppEnv(development({
          [name]: value
        })),
        new RegExp(name)
      );
    }
  });

  it("requires an HTTPS origin in production", () => {
    for (const value of [
      undefined,
      "http://blog.example.test",
      "https://blog.example.test/extra"
    ]) {
      assert.throws(
        () => loadAppEnv(production({
          SITE_ORIGIN: value
        })),
        /SITE_ORIGIN/
      );
    }
  });

  it("requires every R2 setting during production validation", () => {
    for (const name of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_PUBLIC_BASE_URL"
    ]) {
      assert.throws(
        () => loadAppEnv(production({
          [name]: undefined
        })),
        new RegExp(name)
      );
    }
  });

  it("enforces the production public-image URL policy", () => {
    for (const value of [
      "https://fixture.r2.dev",
      `https://${"0".repeat(32)}.r2.cloudflarestorage.com`,
      "http://images.example.test"
    ]) {
      assert.throws(
        () => loadAppEnv(production({
          R2_PUBLIC_BASE_URL: value
        })),
        /R2_PUBLIC_BASE_URL/
      );
    }
  });

  it("reports invalid field names without echoing values", () => {
    const marker = "do-not-log-this";

    const cases = [
      {
        field: "DATABASE_URL",

        run: () => loadAppEnv(development({
          DATABASE_URL: `invalid-${marker}`,
          SESSION_SECRET: marker
        }))
      },
      {
        field: "R2_ACCOUNT_ID",

        run: () => loadAppEnv(production({
          R2_ACCOUNT_ID: marker
        }))
      }
    ];

    for (const { field, run } of cases) {
      assert.throws(run, error => {
        assert.ok(error instanceof Error);

        assert.match(error.message, new RegExp(field));
        assert.doesNotMatch(error.message, new RegExp(marker));
        assert.doesNotMatch(
          error.stack ?? "",
          new RegExp(marker)
        );

        return true;
      });
    }
  });
});