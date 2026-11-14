import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcrypt";

import {
  getTestDatabaseUrl
} from "../helpers/test-database.ts";

const databaseUrl = getTestDatabaseUrl();

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET =
  "workflow-tests-only-session-secret-at-least-32-characters";

const { default: prisma } =
  await import("../../src/lib/prisma.ts");

const { pgPool } =
  await import("../../src/lib/postgres.ts");

const { default: app } =
  await import("../../src/app.ts");

const executeFile = promisify(execFile);

let server: Server | undefined;
let baseUrl = "";
let authCookie = "";
let draftId = 0;
let publishedId = 0;
let cleanupAllowed = false;

const draftSlug = "workflow-private-draft";
const draftTitle = "PRIVATE_DRAFT_PREVIEW_MARKER";

function cookieFrom(response: Response): string {
  const cookie = response.headers.getSetCookie().find(
    value => value.startsWith("xojazzle.sid=")
  );

  assert.ok(cookie);
  return cookie.split(";")[0];
}

function request(path: string, authenticated = true) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    headers: authenticated
      ? { cookie: authCookie }
      : {},
    signal: AbortSignal.timeout(10_000)
  });
}

before(async () => {
  const counts = await Promise.all([
    prisma.adminUser.count(),
    prisma.post.count(),
    prisma.postSlug.count(),
    prisma.siteProfile.count(),
    prisma.currentlyLoving.count(),
    prisma.anticipatedRelease.count(),
    prisma.session.count(),
    prisma.loginRateLimit.count()
  ]);

  assert.ok(
    counts.every(count => count === 0),
    "The dedicated test database must be empty."
  );

  cleanupAllowed = true;

  await executeFile(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("../../prisma/seed.ts", import.meta.url)
      )
    ],
    {
      cwd: fileURLToPath(
        new URL("../../", import.meta.url)
      ),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test"
      },
      timeout: 30_000
    }
  );

  const published = await prisma.post.findFirstOrThrow({
    where: { status: "PUBLISHED" }
  });

  publishedId = published.id;

  const draft = await prisma.post.create({
  data: {
    title: draftTitle,
    slug: draftSlug,
    category: "BOOKS",
    excerpt: "A private draft excerpt.",
    body: "First paragraph.\nSecond paragraph.",
    status: "DRAFT",
    featuredImageUrl:
      "https://images.example.invalid/preview.webp",
    altText: "Test preview cover",
    slugs: {
      create: { slug: draftSlug }
    }
  }
});

  draftId = draft.id;

  const email = "workflow@example.invalid";
  const password = randomUUID();

  await prisma.adminUser.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 4)
    }
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

  const loginPage = await request("/admin/login", false);
  assert.equal(loginPage.status, 200);

  const initialCookie = cookieFrom(loginPage);
  const html = await loginPage.text();
  const token = html.match(
    /name="_csrf"\s+value="([^"]+)"/
  );

  assert.ok(token);

  const login = await fetch(`${baseUrl}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: initialCookie },
    body: new URLSearchParams({
      _csrf: token[1],
      email,
      password
    }),
    signal: AbortSignal.timeout(10_000)
  });

  assert.equal(login.status, 302);
  authCookie = cookieFrom(login);
  await login.text();
});

after(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  } finally {
    try {
      if (cleanupAllowed) {
        await prisma.$transaction([
          prisma.session.deleteMany(),
          prisma.loginRateLimit.deleteMany(),
          prisma.post.deleteMany(),
          prisma.siteProfile.deleteMany(),
          prisma.currentlyLoving.deleteMany(),
          prisma.anticipatedRelease.deleteMany(),
          prisma.adminUser.deleteMany()
        ]);

        assert.equal(await prisma.postSlug.count(), 0);
      }
    } finally {
      await prisma.$disconnect();
      await pgPool.end();
    }
  }
});

describe("saved post previews", { concurrency: false }, () => {
  it("denies anonymous access", async () => {
    const response = await request(
      `/admin/posts/${draftId}/preview`,
      false
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "/admin/login"
    );
    assert.doesNotMatch(
      await response.text(),
      /PRIVATE_DRAFT_PREVIEW_MARKER/
    );
  });

  it("renders a private saved draft without publishing it", async () => {
    const before = await prisma.post.findUniqueOrThrow({
      where: { id: draftId }
    });

    const response = await request(
      `/admin/posts/${draftId}/preview`
    );

    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("cache-control") ?? "",
      /no-store/
    );
    assert.match(
      response.headers.get("x-robots-tag") ?? "",
      /noindex/
    );
    assert.match(
      response.headers.get("vary") ?? "",
      /Cookie/i
    );

    const html = await response.text();

    assert.match(html, /Saved draft preview/);
    assert.ok(html.includes(draftTitle));

    assert.deepEqual(
      await prisma.post.findUniqueOrThrow({
        where: { id: draftId }
      }),
      before
    );

    const publicPage = await request(
      `/posts/${draftSlug}`,
      false
    );

    assert.equal(publicPage.status, 404);
    await publicPage.text();
  });

  it("supports previews of published posts", async () => {
    const response = await request(
      `/admin/posts/${publishedId}/preview`
    );

    assert.equal(response.status, 200);
    assert.match(
      await response.text(),
      /Saved published preview/
    );
  });

  it("returns 404 for invalid or missing identifiers", async () => {
    for (const id of [
      "0",
      "-1",
      "abc",
      "1.2",
      "2147483648",
      "999999999"
    ]) {
      const response = await request(
        `/admin/posts/${id}/preview`
      );

      assert.equal(response.status, 404);
      await response.text();
    }
  });
});