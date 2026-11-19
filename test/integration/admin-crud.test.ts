import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  after,
  before,
  beforeEach,
  describe,
  it,
  mock
} from "node:test";

import bcrypt from "bcrypt";
import sharp from "sharp";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import {
  getTestDatabaseUrl
} from "../helpers/test-database.ts";

const databaseUrl = getTestDatabaseUrl();

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "test";

process.env.SESSION_SECRET =
  "integration-only-session-secret-at-least-32-characters";

process.env.R2_ACCOUNT_ID = "0".repeat(32);
process.env.R2_ACCESS_KEY_ID = "integration-access";
process.env.R2_SECRET_ACCESS_KEY = "integration-secret";
process.env.R2_BUCKET_NAME = "integration-only";
process.env.R2_PUBLIC_BASE_URL =
  "https://images.example.invalid";

const objects = new Map<string, Uint8Array>();
const uploadedKeys: string[] = [];
const deletedKeys: string[] = [];

let uploadsBeforeFailure: number | undefined;
let simulateTimeout = false;
let afterUpload: (() => Promise<void>) | undefined;

mock.method(
  S3Client.prototype,
  "send",
  async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      if (simulateTimeout) {
        throw Object.assign(new Error("Simulated request deadline"), { name: "TimeoutError" });
      }
      if (uploadsBeforeFailure === 0) {
        throw new Error("Simulated storage failure");
      }

      if (uploadsBeforeFailure !== undefined) {
        uploadsBeforeFailure -= 1;
      }

      const key = command.input.Key;
      const body = command.input.Body;

      assert.ok(key);
      assert.ok(body instanceof Uint8Array);
      assert.equal(
        command.input.ContentType,
        "image/webp"
      );

      const bytes = Uint8Array.from(body);

      const metadata = await sharp(
        Buffer.from(bytes)
      ).metadata();

      assert.equal(metadata.format, "webp");

      objects.set(key, bytes);
      uploadedKeys.push(key);

      const callback = afterUpload;
      afterUpload = undefined;

      if (callback) {
        await callback();
      }

      return {};
    }

    if (command instanceof DeleteObjectCommand) {
      const key = command.input.Key;

      assert.ok(key);

      objects.delete(key);
      deletedKeys.push(key);

      return {};
    }

    throw new Error(
      "Unexpected storage command in integration test."
    );
  }
);

const { default: prisma } =
  await import("../../src/lib/prisma.ts");

const { pgPool } =
  await import("../../src/lib/postgres.ts");

const {
  getAdminHomepageSnapshot,
  updateAdminHomepageContent
} = await import(
  "../../src/services/admin-homepage.service.ts"
);

const { HomepageEditConflictError } =
  await import("../../src/services/homepage-upload.ts");

const { default: app } =
  await import("../../src/app.ts");

const email = "integration@example.invalid";
const password = randomUUID();

let server: Server | undefined;
let baseUrl = "";
let cleanupAllowed = false;
let png: Buffer;

const cookies = new Map<string, string>();

const postText = {
  title: "Integration review",
  slug: "integration-review",
  excerpt: "An integration-test excerpt.",
  body: "An integration-test review.",
  altText: "Integration test image",
  imageCaption: "",
  pullQuote: "",
  rating: "",
  ratingNote: "",
  closingNote: "",
  category: "BOOKS",
  status: "DRAFT"
};

async function request(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (cookies.size > 0) {
    headers.set(
      "cookie",
      Array.from(
        cookies,
        ([name, value]) => `${name}=${value}`
      ).join("; ")
    );
  }

  const response = await fetch(
    `${baseUrl}${path}`,
    {
      ...options,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000)
    }
  );

  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0];
    const separator = pair.indexOf("=");

    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);

    if (value === "") {
      cookies.delete(name);
    } else {
      cookies.set(name, value);
    }
  }

  return response;
}

async function csrf(
  path = "/admin/posts/new"
): Promise<string> {
  const response = await request(path);

  assert.equal(response.status, 200);

  const html = await response.text();
  const match =
    html.match(/name="_csrf"\s+value="([^"]+)"/);

  assert.ok(match, "Expected a CSRF token.");

  return match[1];
}

function addImage(
  form: FormData,
  field: string,
  bytes: Uint8Array = png,
  type = "image/png"
): void {
  form.set(
    field,
    new Blob(
      [new Uint8Array(bytes)],
      { type }
    ),
    type === "image/heic"
      ? "photo.heic"
      : "photo.png"
  );
}

async function postForm(
  overrides: Record<string, string> = {},
  withImage = true
): Promise<FormData> {
  const form = new FormData();

  for (const [key, value] of Object.entries({
    ...postText,
    ...overrides
  })) {
    form.set(key, value);
  }

  form.set("_csrf", await csrf());
  if (overrides.slug) {
    const existing = await prisma.post.findUnique({ where: { slug: overrides.slug } });
    if (existing) {
      const page = await request(`/admin/posts/${existing.id}/edit`);
      const html = await page.text();
      const version = html.match(/name="postVersion"\s+value="([^"]*)"/);
      assert.ok(version);
      form.set("postVersion", version[1]);
    }
  }

  if (withImage) {
    addImage(form, "featuredImage");
  }

  return form;
}

async function createDraft(
  slug = `integration-${randomUUID()}`
) {
  const response = await request("/admin/posts", {
    method: "POST",
    body: await postForm({ slug })
  });

  assert.equal(response.status, 302);

  const post = await prisma.post.findUnique({
    where: { slug }
  });

  assert.ok(post);

  return post;
}

async function homepageForm(): Promise<FormData> {
  const snapshot = await getAdminHomepageSnapshot();
  const form = new FormData();

  for (const [key, value] of Object.entries(
    snapshot.values
  )) {
    form.set(key, value);
  }

  const page = await request("/admin/homepage");
  assert.equal(page.status, 200);
  const html = await page.text();
  const token = html.match(/name="_csrf"\s+value="([^"]+)"/);
  const version = html.match(/name="homepageVersion"\s+value="([^"]+)"/);
  assert.ok(token);
  assert.ok(version);
  form.set("_csrf", token[1]);
  form.set("homepageVersion", version[1]);

  return form;
}

before(async () => {
  const counts = await Promise.all([
    prisma.adminUser.count(),
    prisma.post.count(),
    prisma.siteProfile.count(),
    prisma.currentlyLoving.count(),
    prisma.anticipatedRelease.count(),
    prisma.session.count(),
    prisma.loginRateLimit.count()
  ]);

  assert.ok(
    counts.every(count => count === 0),
    "The dedicated integration database must be empty."
  );

  cleanupAllowed = true;

  png = await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 3,
      background: "#b76e79"
    }
  })
    .png()
    .toBuffer();

  await prisma.adminUser.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 4)
    }
  });

  await prisma.siteProfile.create({
    data: {
      siteName: "Integration blog",
      heroText: "Integration introduction.",
      aboutContent: "Integration about text.",
      profileImageUrl: "/images/profile.jpg",

      socialLinks: {
        instagram: "https://www.instagram.com/example",
        tiktok: "https://www.tiktok.com/@example",
        youtube: "https://www.youtube.com/@example"
      },

      heroPrimaryImageUrl: "/images/primary.jpg",
      heroPrimaryAltText: "Primary image",
      heroPrimaryCaption: "Primary caption",

      heroSecondaryImageUrl: "/images/secondary.jpg",
      heroSecondaryAltText: "Secondary image",
      heroSecondaryCaption: "Secondary caption",

      heroJournalDate: "November",
      heroJournalText: "Integration journal.",
      heroJournalEmphasis: "Integration emphasis."
    }
  });

  await prisma.currentlyLoving.createMany({
    data: [
      {
        kind: "READING",
        title: "Integration book",
        coverImageUrl: "/images/book.jpg",
        coverAltText: "Book cover",
        note: "Reading note."
      },
      {
        kind: "WATCHING",
        title: "Integration movie",
        coverImageUrl: "/images/movie.jpg",
        coverAltText: "Movie cover",
        note: "Watching note."
      }
    ]
  });

  await prisma.anticipatedRelease.createMany({
    data: [
      { kind: "BOOKS", text: "Book release." },
      { kind: "MOVIES", text: "Movie release." },
      { kind: "TV", text: "TV release." }
    ]
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

  const token = await csrf("/admin/login");
  const previousCookie = cookies.get("xojazzle.sid");

  const response = await request("/admin/login", {
    method: "POST",

    body: new URLSearchParams({
      _csrf: token,
      email,
      password
    })
  });

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "/admin"
  );

  assert.notEqual(
    cookies.get("xojazzle.sid"),
    previousCookie,
    "Login should regenerate the session."
  );
});

beforeEach(() => {
  simulateTimeout = false;
  uploadsBeforeFailure = undefined;
  afterUpload = undefined;
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
    }
  } finally {
    mock.restoreAll();
    await prisma.$disconnect();
    await pgPool.end();
  }
});

describe(
  "authenticated application integration",
  { concurrency: false },
  () => {
    it("uses a real PostgreSQL session", async () => {
      const response = await request("/admin");

      assert.equal(response.status, 200);
      assert.ok(await prisma.session.count() > 0);
    });

    it("creates, edits, publishes, replaces, unpublishes, and deletes a post", async () => {
      const post = await createDraft();
      const originalKey = post.featuredImageKey;

      assert.ok(originalKey);
      assert.ok(objects.has(originalKey));

      let response = await request(
        `/posts/${post.slug}`
      );

      assert.equal(response.status, 404);

      response = await request(
        `/admin/posts/${post.id}`,
        {
          method: "POST",

          body: await postForm(
            {
              slug: post.slug,
              title: "Published integration review",
              status: "PUBLISHED"
            },
            false
          )
        }
      );

      assert.equal(response.status, 302);

      let current =
        await prisma.post.findUniqueOrThrow({
          where: { id: post.id }
        });

      assert.equal(
        current.featuredImageKey,
        originalKey
      );

      assert.ok(current.publishedAt);

      response = await request(
        `/posts/${post.slug}`
      );

      assert.equal(response.status, 200);

      const replacement = await postForm({
        slug: post.slug,
        status: "DRAFT"
      }, false);

      const heic = await readFile(
        new URL(
          "../fixtures/apple-photo.heic",
          import.meta.url
        )
      );

      addImage(
        replacement,
        "featuredImage",
        heic,
        "image/heic"
      );

      response = await request(
        `/admin/posts/${post.id}`,
        {
          method: "POST",
          body: replacement
        }
      );

      assert.equal(response.status, 302);

      current =
        await prisma.post.findUniqueOrThrow({
          where: { id: post.id }
        });

      const replacementKey = current.featuredImageKey;

      assert.ok(replacementKey);
      assert.notEqual(replacementKey, originalKey);
      assert.equal(objects.has(originalKey), false);
      assert.ok(objects.has(replacementKey));

      response = await request(
        `/posts/${post.slug}`
      );

      assert.equal(response.status, 404);

      const token = await csrf("/admin");

      response = await request(
        `/admin/posts/${post.id}/delete`,
        {
          method: "POST",

          body: new URLSearchParams({
            _csrf: token,
            postVersion: current.updatedAt.toISOString()
          })
        }
      );

      assert.equal(response.status, 400);
      assert.ok(
        await prisma.post.findUnique({
          where: { id: post.id }
        })
      );

      response = await request(
        `/admin/posts/${post.id}/delete`,
        {
          method: "POST",

          body: new URLSearchParams({
            _csrf: token,
            confirmDelete: "yes",
            postVersion: "2000-01-01T00:00:00.000Z"
          })
        }
      );

      assert.equal(response.status, 409);

      response = await request(
        `/admin/posts/${post.id}/delete`,
        {
          method: "POST",

          body: new URLSearchParams({
            _csrf: token,
            confirmDelete: "yes",
            postVersion: current.updatedAt.toISOString()
          })
        }
      );

      assert.equal(response.status, 302);

      assert.equal(
        await prisma.post.findUnique({
          where: { id: post.id }
        }),
        null
      );

      assert.equal(
        objects.has(replacementKey),
        false
      );
    });

    it("rejects authenticated uploads with invalid CSRF before R2", async () => {
      const form = await postForm({
        slug: `integration-${randomUUID()}`
      });

      form.set("_csrf", "invalid-token");

      const beforeUploads = uploadedKeys.length;
      const beforePosts = await prisma.post.count();

      const response = await request("/admin/posts", {
        method: "POST",
        body: form
      });

      assert.equal(response.status, 403);
      assert.equal(uploadedKeys.length, beforeUploads);
      assert.equal(
        await prisma.post.count(),
        beforePosts
      );
    });

    it("requires an image for post creation", async () => {
      const beforePosts = await prisma.post.count();

      const response = await request("/admin/posts", {
        method: "POST",

        body: await postForm(
          { slug: `integration-${randomUUID()}` },
          false
        )
      });

      assert.equal(response.status, 400);
      assert.equal(
        await prisma.post.count(),
        beforePosts
      );
    });

    it("cleans an upload after a real duplicate-slug failure", async () => {
      const post = await createDraft();

      const beforeObjects = objects.size;
      const beforeDeletes = deletedKeys.length;

      const response = await request("/admin/posts", {
        method: "POST",
        body: await postForm({ slug: post.slug })
      });

      assert.equal(response.status, 409);
      assert.equal(objects.size, beforeObjects);
      assert.equal(
        deletedKeys.length,
        beforeDeletes + 1
      );
    });

    it("does not create a post if storage fails", async () => {
      const slug = `integration-${randomUUID()}`;

      uploadsBeforeFailure = 0;

      const response = await request("/admin/posts", {
        method: "POST",
        body: await postForm({ slug })
      });

      assert.equal(response.status, 503);

      assert.equal(
        await prisma.post.findUnique({
          where: { slug }
        }),
        null
      );
    });

    it("preserves a concurrent change and cleans the rejected replacement", async () => {
      const post = await createDraft();
      const oldKey = post.featuredImageKey;

      assert.ok(oldKey);

      const beforeObjects = objects.size;

      afterUpload = async () => {
        await prisma.post.update({
          where: { id: post.id },

          data: {
            title: "Concurrent change",

            updatedAt: new Date(
              post.updatedAt.getTime() + 5_000
            )
          }
        });
      };

      const response = await request(
        `/admin/posts/${post.id}`,
        {
          method: "POST",
          body: await postForm({ slug: post.slug })
        }
      );

      assert.equal(response.status, 409);

      const current =
        await prisma.post.findUniqueOrThrow({
          where: { id: post.id }
        });

      assert.equal(current.title, "Concurrent change");
      assert.equal(current.featuredImageKey, oldKey);
      assert.equal(objects.size, beforeObjects);
      assert.ok(objects.has(oldKey));
    });

    it("replaces all five homepage images and preserves them during text-only edits", async () => {
      const form = await homepageForm();

      for (const field of [
        "profileImage",
        "heroPrimaryImage",
        "heroSecondaryImage",
        "readingCoverImage",
        "watchingCoverImage"
      ]) {
        addImage(form, field);
      }

      let response = await request(
        "/admin/homepage",
        {
          method: "POST",
          body: form
        }
      );

      assert.equal(response.status, 302);

      const before =
        await getAdminHomepageSnapshot();

      for (const image of Object.values(before.images)) {
        assert.ok(image.key);
        assert.ok(objects.has(image.key));
      }

      const beforeUploads = uploadedKeys.length;
      const textOnly = await homepageForm();

      textOnly.set("heroText", "Updated introduction.");

      response = await request(
        "/admin/homepage",
        {
          method: "POST",
          body: textOnly
        }
      );

      assert.equal(response.status, 302);

      const after =
        await getAdminHomepageSnapshot();

      assert.deepEqual(after.images, before.images);
      assert.equal(uploadedKeys.length, beforeUploads);
      assert.equal(
        after.values.heroText,
        "Updated introduction."
      );
    });

    it("cleans a partial homepage upload without changing database images", async () => {
      const before =
        await getAdminHomepageSnapshot();

      const beforeObjects = objects.size;
      const form = await homepageForm();

      addImage(form, "profileImage");
      addImage(form, "heroPrimaryImage");

      uploadsBeforeFailure = 1;

      const response = await request(
        "/admin/homepage",
        {
          method: "POST",
          body: form
        }
      );

      assert.equal(response.status, 503);

      const after =
        await getAdminHomepageSnapshot();

      assert.deepEqual(after.images, before.images);
      assert.equal(objects.size, beforeObjects);
    });

    it("rolls back earlier homepage writes when a later record conflicts", async () => {
      const before =
        await getAdminHomepageSnapshot();

      const stale = {
        ...before,

        versions: {
          ...before.versions,

          watching: {
            ...before.versions.watching,
            updatedAt: new Date(0)
          }
        }
      };

      await assert.rejects(
        updateAdminHomepageContent(
          {
            ...before.values,
            siteName: "Should roll back",
            readingTitle: "Should also roll back"
          },
          stale,
          {}
        ),

        error =>
          error instanceof HomepageEditConflictError
      );

      const after =
        await getAdminHomepageSnapshot();

      assert.deepEqual(after.values, before.values);
      assert.deepEqual(after.images, before.images);
    });

    it("releases upload slots after storage timeouts so a later save succeeds", async () => {
      const slug = `integration-${randomUUID()}`;
      simulateTimeout = true;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request("/admin/posts", {
          method: "POST", body: await postForm({ slug })
        });
        assert.equal(response.status, 503);
        assert.match(await response.text(), /could not be stored/);
      }
      assert.equal(await prisma.post.findUnique({ where: { slug } }), null);
      simulateTimeout = false;
      const response = await request("/admin/posts", {
        method: "POST", body: await postForm({ slug })
      });
      assert.equal(response.status, 302);
      assert.ok(await prisma.post.findUnique({ where: { slug } }));
    });

    it("rejects missing and malformed post versions before uploading", async () => {
      const post = await createDraft();
      const beforeUploads = uploadedKeys.length;
      for (const version of [null, "invalid-date"]) {
        const form = await postForm({ slug: post.slug });
        if (version === null) form.delete("postVersion");
        else form.set("postVersion", version);
        assert.equal((await request(`/admin/posts/${post.id}`, { method: "POST", body: form })).status, 400);
      }
      assert.equal(uploadedKeys.length, beforeUploads);
    });

    it("rejects stale post forms repeatedly without overwriting or uploading", async () => {
      const post = await createDraft();
      const form = await postForm({ slug: post.slug, title: "Stale entry" });
      await prisma.post.update({ where: { id: post.id }, data: {
        title: "Newer saved entry", updatedAt: new Date(post.updatedAt.getTime() + 5_000)
      } });
      const beforeUploads = uploadedKeys.length;
      const originalVersion = form.get("postVersion");
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request(`/admin/posts/${post.id}`, { method: "POST", body: form });
        assert.equal(response.status, 409);
        const html = await response.text();
        assert.match(html, /Reload the editor/);
        assert.match(html, /value="Stale entry"/);
        assert.ok(html.includes(`name="postVersion" value="${originalVersion}"`));
      }
      assert.equal(uploadedKeys.length, beforeUploads);
      assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).title, "Newer saved entry");
      const current = await postForm({ slug: post.slug, title: "Reviewed entry" }, false);
      assert.equal((await request(`/admin/posts/${post.id}`, { method: "POST", body: current })).status, 302);
    });

    it("rejects stale homepage forms without overwriting or uploading", async () => {
      const form = await homepageForm();
      const snapshot = await getAdminHomepageSnapshot();
      form.set("siteName", "Stale homepage");
      addImage(form, "profileImage");
      await prisma.anticipatedRelease.update({ where: { id: snapshot.versions.tv.id }, data: {
        text: "Newer TV entry", updatedAt: new Date(snapshot.versions.tv.updatedAt.getTime() + 5_000)
      } });
      const beforeUploads = uploadedKeys.length;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request("/admin/homepage", { method: "POST", body: form });
        assert.equal(response.status, 409);
        assert.match(await response.text(), /Reload the editor/);
      }
      const latest = await getAdminHomepageSnapshot();
      assert.equal(latest.values.siteName, snapshot.values.siteName);
      assert.equal(latest.values.anticipatedTv, "Newer TV entry");
      assert.equal(uploadedKeys.length, beforeUploads);
      const current = await homepageForm();
      current.set("siteName", "Reviewed homepage");
      assert.equal((await request("/admin/homepage", { method: "POST", body: current })).status, 302);
    });

    it("logs out and denies subsequent administrator requests", async () => {
      const token = await csrf("/admin");

      let response = await request(
        "/admin/logout",
        {
          method: "POST",
          body: new URLSearchParams({ _csrf: token })
        }
      );

      assert.equal(response.status, 302);

      response = await request("/admin");

      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get("location"),
        "/admin/login"
      );
    });
  }
);
