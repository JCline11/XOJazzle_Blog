import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";

import type {
  Post
} from "../../src/generated/prisma/client.ts";

import type {
  AdminPostInput
} from "../../src/validation/admin-post.validation.ts";

import {
  getTestDatabaseUrl
} from "../helpers/test-database.ts";

const databaseUrl = getTestDatabaseUrl();

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET =
  "slug-tests-only-session-secret-at-least-32-characters";

const { default: prisma } =
  await import("../../src/lib/prisma.ts");

const { pgPool } =
  await import("../../src/lib/postgres.ts");

const { default: app } =
  await import("../../src/app.ts");

const {
  createAdminPost,
  updateAdminPost,
  deleteAdminPost,
  getAdminPostById
} = await import(
  "../../src/services/admin-post.service.ts"
);

const {
  createPostUploadWorkflow,
  PostSlugConflictError,
  PostEditConflictError
} = await import(
  "../../src/services/post-upload.ts"
);

const {
  adminPostSchema,
  emptyAdminPostForm,
  toAdminPostFormValues
} = await import(
  "../../src/validation/admin-post.validation.ts"
);

const executeFile = promisify(execFile);

let server: Server | undefined;
let baseUrl = "";
let cleanupAllowed = false;

function uniqueSlug(): string {
  return `slug-test-${randomUUID()}`;
}

function makeInput(
  slug: string,
  status: AdminPostInput["status"] = "PUBLISHED"
): AdminPostInput {
  return adminPostSchema.parse({
    ...emptyAdminPostForm,
    title: "Slug history test",
    slug,
    excerpt: "A disposable test excerpt.",
    body: "A disposable test article.",
    altText: "Test cover",
    status
  });
}

async function createPost(
  slug = uniqueSlug(),
  status: AdminPostInput["status"] = "PUBLISHED"
): Promise<Post> {
  const key = `images/${randomUUID()}.webp`;

  await createAdminPost(makeInput(slug, status), {
    url: `https://images.example.invalid/${key}`,
    key
  });

  return prisma.post.findUniqueOrThrow({
    where: { slug }
  });
}

async function editPost(
  post: Post,
  slug: string,
  status: AdminPostInput["status"] = post.status
): Promise<Post> {
  const input = adminPostSchema.parse({
    ...toAdminPostFormValues(post),
    slug,
    status
  });

  await updateAdminPost(post.id, input, post);

  return prisma.post.findUniqueOrThrow({
    where: { id: post.id }
  });
}

async function visit(slug: string) {
  const response = await fetch(
    `${baseUrl}/posts/${encodeURIComponent(slug)}`,
    {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000)
    }
  );

  return {
    status: response.status,
    location: response.headers.get("location"),
    cacheControl: response.headers.get("cache-control"),
    body: await response.text()
  };
}

async function runSeed(): Promise<void> {
  try {
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
  } catch {
    throw new Error(
      "The seed process failed against the slug test database."
    );
  }
}

async function contentSnapshot() {
  const [posts, slugs, profiles, loving, releases] =
    await Promise.all([
      prisma.post.findMany({
        orderBy: { id: "asc" }
      }),
      prisma.postSlug.findMany({
        orderBy: { slug: "asc" }
      }),
      prisma.siteProfile.findMany({
        orderBy: { id: "asc" }
      }),
      prisma.currentlyLoving.findMany({
        orderBy: { id: "asc" }
      }),
      prisma.anticipatedRelease.findMany({
        orderBy: { id: "asc" }
      })
    ]);

  return { posts, slugs, profiles, loving, releases };
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

  // Supplies the profile required by public article rendering.
  await runSeed();

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
          prisma.post.deleteMany(),
          prisma.siteProfile.deleteMany(),
          prisma.currentlyLoving.deleteMany(),
          prisma.anticipatedRelease.deleteMany()
        ]);

        assert.equal(await prisma.postSlug.count(), 0);
      }
    } finally {
      await prisma.$disconnect();
      await pgPool.end();
    }
  }
});

describe("post slug history", { concurrency: false }, () => {
  it("registers slugs and redirects directly after repeated renames", async () => {
    const original = await createPost();

    assert.equal(
      (
        await prisma.postSlug.findUniqueOrThrow({
          where: { slug: original.slug }
        })
      ).postId,
      original.id
    );

    assert.equal((await visit(original.slug)).status, 200);

    const secondSlug = uniqueSlug();
    let current = await editPost(original, secondSlug);

    const thirdSlug = uniqueSlug();
    current = await editPost(current, thirdSlug);

    for (const oldSlug of [original.slug, secondSlug]) {
      const response = await visit(oldSlug);

      assert.equal(response.status, 301);
      assert.equal(
        response.location,
        `/posts/${thirdSlug}`
      );
      assert.equal(response.cacheControl, "no-store");
    }

    assert.equal((await visit(thirdSlug)).status, 200);

    current = await editPost(current, original.slug);

    assert.equal((await visit(original.slug)).status, 200);

    for (const oldSlug of [secondSlug, thirdSlug]) {
      assert.equal(
        (await visit(oldSlug)).location,
        `/posts/${original.slug}`
      );
    }

    assert.equal(
      await prisma.postSlug.count({
        where: { postId: current.id }
      }),
      3
    );
  });

  it("rejects historical slug collisions without partial writes", async () => {
    const owner = await createPost();
    await editPost(owner, uniqueSlug());

    const other = await createPost();
    const before = await contentSnapshot();

    await assert.rejects(
      editPost(other, owner.slug),
      PostSlugConflictError
    );

    assert.deepEqual(await contentSnapshot(), before);

    await assert.rejects(
      createPost(owner.slug),
      PostSlugConflictError
    );

    assert.deepEqual(await contentSnapshot(), before);
  });

  it("rejects stale edits without adding registrations", async () => {
    const post = await createPost();
    const requestedSlug = uniqueSlug();

    await assert.rejects(
      updateAdminPost(
        post.id,
        makeInput(requestedSlug),
        {
          ...post,
          updatedAt: new Date(
            post.updatedAt.getTime() - 1_000
          )
        }
      ),
      PostEditConflictError
    );

    assert.deepEqual(
      await prisma.post.findUniqueOrThrow({
        where: { id: post.id }
      }),
      post
    );

    assert.equal(
      await prisma.postSlug.count({
        where: { slug: requestedSlug }
      }),
      0
    );
  });

  it("allows exactly one concurrent claim for a new slug", async () => {
    const slug = uniqueSlug();

    const outcomes = await Promise.allSettled([
      createPost(slug),
      createPost(slug)
    ]);

    const successful = outcomes.filter(
      outcome => outcome.status === "fulfilled"
    );

    const rejected = outcomes.filter(
      outcome => outcome.status === "rejected"
    );

    assert.equal(successful.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0].reason instanceof PostSlugConflictError
    );

    const post = await prisma.post.findUniqueOrThrow({
      where: { slug }
    });

    assert.equal(
      (
        await prisma.postSlug.findUniqueOrThrow({
          where: { slug }
        })
      ).postId,
      post.id
    );
  });

  it("hides drafts and removes registrations on deletion", async () => {
    const original = await createPost(
      uniqueSlug(),
      "DRAFT"
    );

    let current = await editPost(
      original,
      uniqueSlug()
    );

    for (const slug of [original.slug, current.slug]) {
      const response = await visit(slug);

      assert.equal(response.status, 404);
      assert.equal(response.location, null);
    }

    current = await editPost(
      current,
      current.slug,
      "PUBLISHED"
    );

    assert.equal((await visit(original.slug)).status, 301);
    assert.equal((await visit(current.slug)).status, 200);

    current = await editPost(
      current,
      current.slug,
      "DRAFT"
    );

    assert.equal((await visit(original.slug)).status, 404);
    assert.equal((await visit(current.slug)).status, 404);

    await deleteAdminPost(current.id, current.updatedAt);

    assert.equal(
      await prisma.postSlug.count({
        where: { postId: current.id }
      }),
      0
    );

    for (const slug of [original.slug, current.slug]) {
      assert.equal((await visit(slug)).status, 404);
    }

    assert.equal((await visit(uniqueSlug())).status, 404);
  });

  it("cleans a replacement image after a historical slug conflict", async () => {
    const owner = await createPost();
    await editPost(owner, uniqueSlug());

    const other = await createPost();
    const replacementKey = `images/${randomUUID()}.webp`;
    const deletedKeys: string[] = [];

    const save = createPostUploadWorkflow({
      getPost: getAdminPostById,
      createPost: createAdminPost,
      updatePost: updateAdminPost,

      async processImage() {
        return {
          bytes: new Uint8Array([1]),
          contentType: "image/webp"
        };
      },

      getStorage() {
        return {
          async uploadImage() {
            return {
              url:
                `https://images.example.invalid/${replacementKey}`,
              key: replacementKey
            };
          },

          async deleteImage(key) {
            deletedKeys.push(key);
          }
        };
      },

      reportCleanupFailure() {
        assert.fail("Replacement cleanup should succeed.");
      }
    });

    await assert.rejects(
      save(
        other.id,
        makeInput(owner.slug),
        {
          buffer: new Uint8Array([1]),
          mimetype: "image/png"
        },
        other.updatedAt.toISOString()
      ),
      PostSlugConflictError
    );

    assert.deepEqual(deletedKeys, [replacementKey]);

    assert.deepEqual(
      await prisma.post.findUniqueOrThrow({
        where: { id: other.id }
      }),
      other
    );

    assert.equal(
      (
        await prisma.postSlug.findUniqueOrThrow({
          where: { slug: owner.slug }
        })
      ).postId,
      owner.id
    );
  });

  it("preserves a renamed sample post when reseeding", async () => {
    const sample = await prisma.post.findUniqueOrThrow({
      where: {
        slug: "ice-breaker-by-hannah-grace"
      }
    });

    await editPost(sample, uniqueSlug());

    const before = await contentSnapshot();

    await runSeed();

    assert.deepEqual(await contentSnapshot(), before);
  });
});