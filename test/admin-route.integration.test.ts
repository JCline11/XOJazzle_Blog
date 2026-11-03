import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import express from "express";
import session from "express-session";

let server: Server;
let baseUrl = "";

before(async () => {
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:1/test";
  process.env.SESSION_SECRET =
    "test-only-session-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";

  const { default: adminRouter } =
    await import("../src/routes/admin.routes.ts");

  const app = express();

  app.use(express.urlencoded({ extended: false }));

  app.use(session({
    secret:
      "test-only-session-secret-at-least-32-characters",
    resave: false,
    saveUninitialized: false
  }));

  app.use("/admin", adminRouter);

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
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const { pgPool } =
    await import("../src/lib/postgres.ts");

  await pgPool.end();
});

describe("administrator route authorization", () => {
  it("redirects an anonymous dashboard request to login", async () => {
    const response = await fetch(`${baseUrl}/admin`, {
      redirect: "manual"
    });

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "/admin/login"
    );
  });
});
