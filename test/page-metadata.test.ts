import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  describe,
  it
} from "node:test";

import {
  buildPageMetadata,
  publicUrl
} from "../src/services/page-metadata.ts";

import {
  escapeXml,
  renderSitemap
} from "../src/lib/sitemap.ts";

const ejs = createRequire(import.meta.url)("ejs") as {
  renderFile: (
    filename: string,
    data: Record<string, unknown>
  ) => Promise<string>;
};

const origin = "https://blog.example.test";

function metadata(
  overrides: Partial<
    Parameters<typeof buildPageMetadata>[1]
  > = {}
) {
  return buildPageMetadata(origin, {
    title: "A review",
    description: "A useful excerpt.",
    siteName: "Test blog",
    path: "/posts/a-review",
    imageUrl: "/images/cover.jpg",
    imageAlt: "The cover",
    type: "article",
    ...overrides
  });
}

function renderHead(
  values: Record<string, unknown>
): Promise<string> {
  return ejs.renderFile(
    fileURLToPath(
      new URL(
        "../src/views/partials/head.ejs",
        import.meta.url
      )
    ),
    values
  );
}

describe("page metadata", () => {
  it("builds branded titles and absolute URLs", () => {
    const result = metadata();

    assert.equal(
      result.title,
      "A review | Test blog"
    );

    assert.equal(
      result.canonicalUrl,
      `${origin}/posts/a-review`
    );

    assert.deepEqual(result.image, {
      url: `${origin}/images/cover.jpg`,
      alt: "The cover"
    });

    assert.equal(result.type, "article");
  });

  it("normalizes and shortens descriptions", () => {
    const result = metadata({
      description: `  First\n\n${"word ".repeat(80)} `
    });

    assert.ok(
      Array.from(result.description).length <= 160
    );

    assert.doesNotMatch(
      result.description,
      /[\r\n]/
    );

    assert.ok(result.description.endsWith("…"));
  });

  it("keeps existing HTTPS delivery URLs", () => {
    const result = metadata({
      imageUrl:
        "https://images.example.test/cover.webp"
    });

    assert.equal(
      result.image.url,
      "https://images.example.test/cover.webp"
    );
  });

  it("falls back for missing or unsafe images", () => {
    for (const imageUrl of [
      null,
      "",
      "javascript:alert(1)",
      "data:image/png;base64,example",
      "//other.example.test/image.jpg",
      "http://other.example.test/image.jpg",
      "https://user:password@example.test/image.jpg"
    ]) {
      const result = metadata({ imageUrl });

      assert.equal(
        result.image.url,
        `${origin}/images/profile/xojazzle_profile.jpg`
      );

      assert.equal(
        result.image.alt,
        "Test blog profile image"
      );
    }
  });

  it("rejects non-local canonical paths", () => {
    for (const path of [
      "https://other.example.test/post",
      "//other.example.test/post",
      "/posts/a-review?tracking=yes",
      "/posts/a-review#section",
      "/\\other.example.test/post"
    ]) {
      assert.throws(
        () => publicUrl(origin, path)
      );
    }
  });

  it("renders escaped metadata once", async () => {
    const html = await renderHead({
      pageMetadata: metadata({
        title: 'A "quoted" <note> & review',
        description: 'An excerpt with "quotes" & <tags>.'
      })
    });

    assert.equal(
      (html.match(/<title>/g) ?? []).length,
      1
    );

    assert.ok(
      html.includes(
        "A &#34;quoted&#34; &lt;note&gt; &amp; review"
      )
    );

    assert.doesNotMatch(html, /<note>|<tags>/);

    assert.match(
      html,
      /rel="canonical"/
    );

    assert.match(
      html,
      /property="og:type"\s+content="article"/
    );

    assert.match(
      html,
      /name="twitter:card"\s+content="summary_large_image"/
    );

    assert.doesNotMatch(
      html,
      /name="robots"/
    );
  });

  it("suppresses public metadata on private pages", async () => {
    for (const privateValues of [
      { adminStyles: true },
      {
        preview: {
          id: 1,
          status: "draft"
        }
      },
      { privatePage: true }
    ]) {
      const html = await renderHead({
        pageMetadata: metadata(),
        ...privateValues
      });

      assert.match(
        html,
        /name="robots"\s+content="noindex, nofollow"/
      );

      assert.doesNotMatch(
        html,
        /rel="canonical"|property="og:|name="twitter:/
      );
    }
  });

  it("uses a safe fallback without public metadata", async () => {
    const html = await renderHead({});

    assert.match(
      html,
      /name="robots"\s+content="noindex, nofollow"/
    );

    assert.doesNotMatch(
      html,
      /rel="canonical"|property="og:/
    );
  });
});

describe("sitemap XML", () => {
  it("escapes XML characters", () => {
    assert.equal(
      escapeXml(`&<>"'`),
      "&amp;&lt;&gt;&quot;&apos;"
    );
  });

  it("renders public locations and stored dates", () => {
    const xml = renderSitemap(origin, [
      {
        slug: "a-review",
        updatedAt:
          new Date("2026-11-01T12:00:00.000Z")
      }
    ]);

    assert.match(
      xml,
      /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/
    );

    assert.equal(
      (xml.match(/<loc>/g) ?? []).length,
      6
    );

    assert.ok(
      xml.includes(
        `<loc>${origin}/posts/a-review</loc>`
      )
    );

    assert.ok(
      xml.includes(
        "<lastmod>2026-11-01T12:00:00.000Z</lastmod>"
      )
    );

    assert.equal(
      (xml.match(/<lastmod>/g) ?? []).length,
      1
    );
  });
});