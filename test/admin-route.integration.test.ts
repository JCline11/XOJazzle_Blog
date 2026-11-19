import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import {
  after,
  before,
  describe,
  it
} from "node:test";

import express from "express";
import session from "express-session";

let server: Server;
let baseUrl = "";
let unexpectedErrors = 0;

before(async () => {
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:1/test";

  process.env.SESSION_SECRET =
    "test-only-session-secret-at-least-32-characters";

  process.env.NODE_ENV = "test";

  for (const name of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_BASE_URL"
  ]) {
    process.env[name] = "";
  }

  const { default: adminRouter } =
    await import("../src/routes/admin.routes.ts");

  const { SESSION_COOKIE_NAME } =
    await import("../src/config/session.ts");

  const app = express();

  app.set("view engine", "ejs");

  app.set(
    "views",
    fileURLToPath(
      new URL("../src/views/pages/", import.meta.url)
    )
  );

  app.use(
    express.urlencoded({
      extended: false
    })
  );

  app.use(
    session({
      secret:
        "test-only-session-secret-at-least-32-characters",

      name: SESSION_COOKIE_NAME,
      resave: false,
      saveUninitialized: false
    })
  );

  // Test-only helper. Never add this to production.
  app.get(
    "/__test/incomplete-session",
    (req, res) => {
      req.session.adminUserId = 1;
      delete req.session.adminVersion;

      res.sendStatus(204);
    }
  );

  app.use("/admin", adminRouter);

  app.use((
    _error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    unexpectedErrors += 1;

    res
      .status(500)
      .send("Unexpected test application error.");
  });

  server = await new Promise<Server>(resolve => {
    const listener = app.listen(
      0,
      "127.0.0.1",
      () => resolve(listener)
    );
  });

  const address = server.address() as AddressInfo;

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  const { pgPool } =
    await import("../src/lib/postgres.ts");

  await pgPool.end();

  assert.equal(
    unexpectedErrors,
    0,
    "Rejected requests should not reach unexpected errors."
  );
});

function sessionCookie(response: Response): string {
  const value =
    response.headers.get("set-cookie");

  assert.ok(value, "Expected a session cookie.");

  return value.split(";")[0];
}

async function loginForm() {
  const response = await fetch(
    `${baseUrl}/admin/login`,
    { redirect: "manual" }
  );

  assert.equal(response.status, 200);

  const html = await response.text();

  const match =
    html.match(/name="_csrf"\s+value="([^"]+)"/);

  assert.ok(match, "Expected a CSRF field.");

  return {
    cookie: sessionCookie(response),
    token: match[1]
  };
}

function assertLoginRedirect(
  response: Response
): void {
  assert.equal(response.status, 302);

  assert.equal(
    response.headers.get("location"),
    "/admin/login"
  );
}

describe("administrator route authorization", () => {
  for (const path of [
    "/admin",
    "/admin/posts/new",
    "/admin/posts/1/edit",
    "/admin/homepage"
  ]) {
    it(`protects GET ${path}`, async () => {
      const response = await fetch(
        `${baseUrl}${path}`,
        { redirect: "manual" }
      );

      assertLoginRedirect(response);
    });
  }

  for (const path of [
    "/admin/posts",
    "/admin/posts/1",
    "/admin/posts/1/delete",
    "/admin/homepage",
    "/admin/logout"
  ]) {
    it(`protects POST ${path}`, async () => {
      const response = await fetch(
        `${baseUrl}${path}`,
        {
          method: "POST",
          redirect: "manual",
          body: new URLSearchParams()
        }
      );

      assertLoginRedirect(response);
    });
  }

  for (const path of [
    "/admin/posts",
    "/admin/posts/1",
    "/admin/homepage"
  ]) {
    it(
      `authenticates before parsing multipart at ${path}`,
      async () => {
        const response = await fetch(
          `${baseUrl}${path}`,
          {
            method: "POST",
            redirect: "manual",

            headers: {
              "content-type":
                "multipart/form-data; boundary=broken"
            },

            body: "not a valid multipart request"
          }
        );

        assertLoginRedirect(response);
      }
    );
  }

  it("renders the public login form with CSRF", async () => {
    const form = await loginForm();

    assert.match(form.token, /^[a-f0-9]{64}$/);
  });

  it("rejects login without CSRF before rate limiting", async () => {
    const response = await fetch(
      `${baseUrl}/admin/login`,
      {
        method: "POST",
        redirect: "manual",

        body: new URLSearchParams({
          email: "admin@example.com",
          password: "test-password"
        })
      }
    );

    assert.equal(response.status, 403);
  });

  it("rejects an altered login CSRF token", async () => {
    const form = await loginForm();

    const response = await fetch(
      `${baseUrl}/admin/login`,
      {
        method: "POST",
        redirect: "manual",

        headers: {
          cookie: form.cookie
        },

        body: new URLSearchParams({
          _csrf: "invalid-token",
          email: "admin@example.com",
          password: "test-password"
        })
      }
    );

    assert.equal(response.status, 403);
  });

  it("rejects a CSRF token from another session", async () => {
    const first = await loginForm();
    const second = await loginForm();

    assert.notEqual(first.token, second.token);

    const response = await fetch(
      `${baseUrl}/admin/login`,
      {
        method: "POST",
        redirect: "manual",

        headers: {
          cookie: first.cookie
        },

        body: new URLSearchParams({
          _csrf: second.token,
          email: "admin@example.com",
          password: "test-password"
        })
      }
    );

    assert.equal(response.status, 403);
  });

  it("clears incomplete administrator sessions", async () => {
    const seeded = await fetch(
      `${baseUrl}/__test/incomplete-session`
    );

    assert.equal(seeded.status, 204);

    const cookie = sessionCookie(seeded);

    const protectedResponse = await fetch(
      `${baseUrl}/admin`,
      {
        redirect: "manual",
        headers: { cookie }
      }
    );

    assertLoginRedirect(protectedResponse);

    assert.match(
      protectedResponse.headers.get("set-cookie") ?? "",
      /xojazzle\.sid=;/
    );

    // Reusing the old cookie should no longer loop.
    const loginResponse = await fetch(
      `${baseUrl}/admin/login`,
      {
        redirect: "manual",
        headers: { cookie }
      }
    );

    assert.equal(loginResponse.status, 200);
  });
});
