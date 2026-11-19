import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  after,
  before,
  beforeEach,
  it,
  mock
} from "node:test";

import type { Express } from "express";
import type { Pool } from "pg";

import {
  reportServerError
} from "../src/lib/report-error.ts";

const marker = "synthetic-sensitive-marker";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const consoleCalls: unknown[][] = [];

let app: Express;
let pool: Pool;
let server: Server | undefined;
let baseUrl = "";

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "production",

    DATABASE_URL:
      "postgresql://test:unused@127.0.0.1:1/xojazzle_test",

    SESSION_SECRET:
      "synthetic-session-secret-for-tests-only",

    SITE_ORIGIN: "https://blog.example.test",
    R2_ACCOUNT_ID: "0".repeat(32),
    R2_ACCESS_KEY_ID: "synthetic-access-key",
    R2_SECRET_ACCESS_KEY: "synthetic-secret-key",
    R2_BUCKET_NAME: "test-images",
    R2_PUBLIC_BASE_URL: "https://images.example.test",
    DEBUG: ""
  });

  mock.method(console, "error", (...values: unknown[]) => {
    consoleCalls.push(values);
  });

  const database = await import("../src/lib/postgres.ts");
  pool = database.pgPool;

  const fakeQuery = async (input: unknown) => {
    const sql =
      typeof input === "string"
        ? input
        : typeof input === "object" &&
            input !== null &&
            "text" in input
          ? String(input.text)
          : "";

    const sessionQuery =
      /^(?:INSERT INTO|SELECT sess FROM|UPDATE|DELETE FROM) "session"/
        .test(sql);

    if (sql === "SELECT 1" || sessionQuery) {
      return {
        rows: [],
        fields: [],
        rowCount: 0,
        command: "SELECT",
        oid: 0
      };
    }

    throw Object.assign(new Error(marker), {
      code: "ECONNREFUSED",
      detail: marker
    });
  };

  // These routes use the promise-based query overload.
  mock.method(
    pool,
    "query",
    fakeQuery as unknown as typeof pool.query
  );

  mock.method(
    pool,
    "connect",
    (() => {
      throw new Error("Unexpected real database connection.");
    }) as typeof pool.connect
  );

  const application = await import("../src/app.ts");
  app = application.default;

  server = createServer(
    {
      keepAliveTimeout: 50,
      keepAliveTimeoutBuffer: 0
    },
    app
  );

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  baseUrl = "http://127.0.0.1:" + address.port;
});

beforeEach(() => {
  consoleCalls.length = 0;
});

after(async () => {
  try {
    if (server) {
      const listener = server;

      await new Promise<void>(resolve => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      });
    }

    if (pool) {
      const { sessionStore } =
        await import("../src/config/session.ts");

      const { default: prisma } =
        await import("../src/lib/prisma.ts");

      await sessionStore.close();
      await prisma.$disconnect();
      await pool.end();
    }
  } finally {
    mock.restoreAll();
  }
});

function readLog(index = 0) {
  const values = consoleCalls[index];

  assert.ok(values, "Expected a diagnostic log.");
  assert.equal(values.length, 1);

  const line = values[0];

  assert.equal(typeof line, "string");
  assert.doesNotMatch(line as string, new RegExp(marker));

  const entry = JSON.parse(line as string) as {
    event: string;
    errorId: string;
    code: string;
  };

  assert.deepEqual(Object.keys(entry).sort(), [
    "code",
    "errorId",
    "event"
  ]);

  assert.match(entry.errorId, uuidPattern);

  return entry;
}

it("sends production security headers on health responses", async () => {
  const response = await fetch(baseUrl + "/healthz");

  assert.equal(response.status, 200);
  await response.text();

  const directives = new Set(
    (response.headers.get("content-security-policy") ?? "")
      .split(";")
      .map(value => value.trim())
  );

  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ]) {
    assert.ok(directives.has(directive), directive);
  }

  assert.equal(
    response.headers.get("x-content-type-options"),
    "nosniff"
  );

  assert.match(
    response.headers.get("strict-transport-security") ?? "",
    /max-age=[1-9]\d*/
  );

  assert.equal(response.headers.get("x-powered-by"), null);
});

it("sets secure session cookies for forwarded HTTPS", async () => {
  const response = await fetch(baseUrl + "/admin/login", {
    headers: {
      "X-Forwarded-Proto": "https"
    }
  });

  assert.equal(response.status, 200);
  await response.text();

  const cookie = response.headers.get("set-cookie") ?? "";

  assert.match(cookie, /^xojazzle\.sid=/);
  assert.match(cookie, /;\s*Secure(?:;|$)/i);
  assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(cookie, /;\s*SameSite=Lax(?:;|$)/i);
  assert.doesNotMatch(cookie, /;\s*Domain=/i);
});

it("withholds secure session cookies over forwarded HTTP", async () => {
  const response = await fetch(baseUrl + "/admin/login", {
    headers: {
      "X-Forwarded-Proto": "http"
    }
  });

  assert.equal(response.status, 200);
  await response.text();

  assert.equal(response.headers.get("set-cookie"), null);
});

it("keeps administrator responses private", async () => {
  const response = await fetch(baseUrl + "/admin", {
    redirect: "manual",

    headers: {
      "X-Forwarded-Proto": "https"
    }
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/admin/login");

  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store"
  );

  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive"
  );

  assert.match(response.headers.get("vary") ?? "", /Cookie/i);

  await response.text();
});

it("uses the configured origin instead of request host headers", async () => {
  const response = await fetch(baseUrl + "/robots.txt", {
    headers: {
      Host: "attacker.example.test",
      "X-Forwarded-Host": "attacker.example.test"
    }
  });

  assert.equal(response.status, 200);

  const body = await response.text();

  assert.ok(
    body.includes(
      "Sitemap: https://blog.example.test/sitemap.xml"
    )
  );

  assert.doesNotMatch(body, /attacker\.example\.test/);
});

it("returns client errors for invalid form requests", async () => {
  const cases = [
    {
      label: "oversized body",
      contentType: "application/x-www-form-urlencoded",
      body: "field=" + marker + "x".repeat(101 * 1024),
      status: 413
    },
    {
      label: "excessive fields",
      contentType: "application/x-www-form-urlencoded",

      body: Array.from(
        { length: 51 },
        (_, index) => "field" + index + "=" + marker
      ).join("&"),

      status: 413
    },
    {
      label: "unsupported charset",

      contentType:
        "application/x-www-form-urlencoded; charset=unsupported",

      body: "field=" + marker,
      status: 415
    }
  ];

  for (const example of cases) {
    const response = await fetch(baseUrl + "/admin/login", {
      method: "POST",

      headers: {
        "Content-Type": example.contentType
      },

      body: example.body
    });

    assert.equal(
      response.status,
      example.status,
      example.label
    );

    assert.equal(
      response.headers.get("cache-control"),
      "no-store"
    );

    assert.doesNotMatch(
      await response.text(),
      new RegExp(marker)
    );
  }

  assert.equal(consoleCalls.length, 0);
});

it("returns 400 for invalid URL encoding", async () => {
  const response = await fetch(
    baseUrl + "/posts/%E0%A4%A"
  );

  assert.equal(response.status, 400);
  assert.equal(
    await response.text(),
    "The request URL is invalid."
  );

  assert.equal(consoleCalls.length, 0);
});

it("hides unexpected failures and correlates them with safe logs", async () => {
  const response = await fetch(baseUrl + "/");

  assert.equal(response.status, 500);
  assert.equal(
    response.headers.get("cache-control"),
    "no-store"
  );

  const body = await response.text();

  assert.match(body, /Something went wrong/);

  assert.doesNotMatch(
    body,
    /synthetic-sensitive-marker|ECONNREFUSED|PrismaClient|postgresql:\/\//
  );

  assert.equal(consoleCalls.length, 1);

  const entry = readLog();

  assert.equal(entry.event, "http_error");
  assert.equal(
    response.headers.get("x-error-id"),
    entry.errorId
  );
});

it("sanitizes PostgreSQL pool errors", () => {
  pool.emit(
    "error",
    Object.assign(new Error(marker), {
      code: "ECONNREFUSED",
      detail: marker
    })
  );

  assert.equal(consoleCalls.length, 1);

  const entry = readLog();

  assert.equal(entry.event, "postgres_pool_error");
  assert.equal(entry.code, "ECONNREFUSED");
});

it("does not log arbitrary error codes or thrown values", () => {
  const examples: unknown[] = [
    Object.assign(new Error(marker), {
      code: marker,
      detail: marker
    }),
    marker,
    null
  ];

  examples.forEach((error, index) => {
    const errorId = reportServerError("http_error", error);
    const entry = readLog(index);

    assert.equal(entry.errorId, errorId);
    assert.equal(entry.code, "UNKNOWN");
  });
});

it("uses a generic fallback if the error template fails", async () => {
  const renderMock = mock.method(
    app,
    "render",
    ((...values: unknown[]) => {
      const callback = values.at(-1);

      assert.equal(typeof callback, "function");

      (callback as (error: Error) => void)(
        new Error(marker)
      );
    }) as typeof app.render
  );

  try {
    const response = await fetch(baseUrl + "/");

    assert.equal(response.status, 500);
    assert.equal(
      await response.text(),
      "Internal server error."
    );

    const entry = readLog();

    assert.equal(
      response.headers.get("x-error-id"),
      entry.errorId
    );
  } finally {
    renderMock.mock.restore();
  }
});