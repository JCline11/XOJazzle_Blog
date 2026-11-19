import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  after,
  before,
  describe,
  it
} from "node:test";

import {
  getTestDatabaseUrl
} from "../helpers/test-database.ts";

const databaseUrl = getTestDatabaseUrl();

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "test";

process.env.SESSION_SECRET =
  "search-tests-only-session-secret-at-least-32-characters";

process.env.SITE_ORIGIN =
  "https://blog.example.test";

const { default: prisma } =
  await import("../../src/lib/prisma.ts");

const { pgPool } =
  await import("../../src/lib/postgres.ts");

const { default: app } =
  await import("../../src/app.ts");

const executeFile = promisify(execFile);

const origin = "https://blog.example.test";
const currentSlug = "discovery-published-note";
const draftSlug = "discovery-private-draft";

let server: Server | undefined;
let baseUrl = "";
let publishedId = 0;
let originalSlug = "";
let cleanupAllowed = false;

async function request(
  path: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000)
  });
}

async function readSitemap(): Promise<string> {
  const response = await request("/sitemap.xml");

  assert.equal(response.status, 200);

  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/xml/
  );

  return response.text();
}

function assertCanonical(
  html: string,
  path: string
): void {
  assert.ok(
    html.includes(
      `href="${origin}${path}"`
    )
  );

  assert.equal(
    (html.match(/rel="canonical"/g) ?? []).length,
    1
  );
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

  try {
    await executeFile(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(
          new URL(
            "../../prisma/seed.ts",
            import.meta.url
          )
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
      "Could not prepare discovery test fixtures."
    );
  }

  const published =
    await prisma.post.findFirstOrThrow({
      where: {
        status: "PUBLISHED"
      }
    });

  publishedId = published.id;
  originalSlug = published.slug;

  await prisma.post.update({
    where: {
      id: publishedId
    },

    data: {
      slug: currentSlug,
      title: 'A "quoted" <note> & review',
      excerpt:
        'An excerpt with "quotes", <tags>, and symbols.',

      featuredImageUrl:
        "/images/profile/xojazzle_profile.jpg",

      slugs: {
        create: {
          slug: currentSlug
        }
      }
    }
  });

  await prisma.post.create({
    data: {
      title: "PRIVATE_DISCOVERY_DRAFT_MARKER",
      slug: draftSlug,
      excerpt: "A private draft excerpt.",
      body: "A private draft body.",
      category: "BOOKS",
      status: "DRAFT",

      featuredImageUrl:
        "/images/profile/xojazzle_profile.jpg",

      altText: "Test image",

      slugs: {
        create: {
          slug: draftSlug
        }
      }
    }
  });

  server = await new Promise<Server>(resolve => {
    const listener = app.listen(
      0,
      "127.0.0.1",
      () => resolve(listener)
    );
  });

  const address =
    server.address() as AddressInfo;

  baseUrl =
    `http://127.0.0.1:${address.port}`;
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

        assert.equal(
          await prisma.postSlug.count(),
          0
        );
      }
    } finally {
      await prisma.$disconnect();
      await pgPool.end();
    }
  }
});

describe(
  "search discovery routes",
  { concurrency: false },
  () => {
    it("renders public page metadata", async () => {
      const home = await request(
        "/?utm_source=acceptance"
      );

      assert.equal(home.status, 200);

      const homeHtml = await home.text();

      assert.match(
        homeHtml,
        /<title>Little Things \| XOJazzle<\/title>/
      );

      assertCanonical(homeHtml, "/");

      const category = await request(
        "/categories/TV/?utm_source=acceptance"
      );

      assert.equal(category.status, 200);

      const categoryHtml = await category.text();

      assert.match(
        categoryHtml,
        /TV Shows notes \| XOJazzle/
      );

      assertCanonical(
        categoryHtml,
        "/categories/tv"
      );

      const post = await request(
        `/posts/${currentSlug}?utm_source=acceptance`
      );

      assert.equal(post.status, 200);

      const postHtml = await post.text();

      assertCanonical(
        postHtml,
        `/posts/${currentSlug}`
      );

      assert.ok(
        postHtml.includes(
          "A &#34;quoted&#34; &lt;note&gt; &amp; review"
        )
      );

      assert.match(
        postHtml,
        /property="og:type"\s+content="article"/
      );

      assert.ok(
        postHtml.includes(
          `${origin}/images/profile/xojazzle_profile.jpg`
        )
      );
    });

    it("uses configuration instead of request hosts", async () => {
      const response = await request(
        `/posts/${currentSlug}`,
        {
          host: "untrusted.example.test",
          "x-forwarded-host":
            "forwarded.example.test"
        }
      );

      assert.equal(response.status, 200);

      const html = await response.text();

      assertCanonical(
        html,
        `/posts/${currentSlug}`
      );

      assert.doesNotMatch(
        html,
        /untrusted\.example\.test|forwarded\.example\.test/
      );
    });

    it("redirects historical slugs to the current post", async () => {
      const response = await request(
        `/posts/${originalSlug}`
      );

      assert.equal(response.status, 301);

      assert.equal(
        response.headers.get("location"),
        `/posts/${currentSlug}`
      );

      await response.text();
    });

    it("lists current published URLs without private or historical locations", async () => {
      const xml = await readSitemap();

      assert.equal(
        (xml.match(/<loc>/g) ?? []).length,
        6
      );

      assert.ok(
        xml.includes(
          `<loc>${origin}/posts/${currentSlug}</loc>`
        )
      );

      assert.ok(
        xml.includes(
          `<loc>${origin}/categories/tv</loc>`
        )
      );

      assert.ok(!xml.includes(originalSlug));
      assert.ok(!xml.includes(draftSlug));

      assert.doesNotMatch(
        xml,
        /\/admin|\/preview|PRIVATE_DISCOVERY_DRAFT_MARKER/
      );
    });

    it("serves a robots file pointing to the configured sitemap", async () => {
      const response = await request(
        "/robots.txt"
      );

      assert.equal(response.status, 200);

      assert.match(
        response.headers.get("content-type") ?? "",
        /text\/plain/
      );

      const text = await response.text();

      assert.equal(
        text,
        [
          "User-agent: *",
          "Allow: /",
          `Sitemap: ${origin}/sitemap.xml`,
          ""
        ].join("\n")
      );
    });

    it("keeps admin responses out of indexing", async () => {
      for (const path of [
        "/admin/login",
        "/admin",
        "/admin/posts/1/preview",
        "/ADMIN/login"
      ]) {
        const response = await request(path);

        assert.match(
          response.headers.get("x-robots-tag") ?? "",
          /noindex/
        );

        assert.match(
          response.headers.get("cache-control") ?? "",
          /private.*no-store/
        );

        await response.text();
      }

      const login = await request(
        "/admin/login"
      );

      const html = await login.text();

      assert.match(
        html,
        /name="robots"\s+content="noindex, nofollow"/
      );

      assert.doesNotMatch(
        html,
        /rel="canonical"|property="og:|name="twitter:/
      );
    });

    it("keeps drafts and missing pages unavailable", async () => {
      for (const path of [
        `/posts/${draftSlug}`,
        "/posts/discovery-missing-post"
      ]) {
        const response = await request(path);

        assert.equal(response.status, 404);

        const html = await response.text();

        assert.doesNotMatch(
          html,
          /PRIVATE_DISCOVERY_DRAFT_MARKER/
        );

        assert.doesNotMatch(
          html,
          /rel="canonical"|property="og:/
        );
      }
    });

    it("removes unpublished and deleted posts from the sitemap", async () => {
      await prisma.post.update({
        where: {
          id: publishedId
        },

        data: {
          status: "DRAFT"
        }
      });

      assert.ok(
        !(await readSitemap()).includes(currentSlug)
      );

      await prisma.post.update({
        where: {
          id: publishedId
        },

        data: {
          status: "PUBLISHED"
        }
      });

      assert.ok(
        (await readSitemap()).includes(currentSlug)
      );

      await prisma.post.delete({
        where: {
          id: publishedId
        }
      });

      assert.ok(
        !(await readSitemap()).includes(currentSlug)
      );
    });
  }
);