import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  describe,
  it
} from "node:test";

const ejs = createRequire(import.meta.url)("ejs") as {
  renderFile: (
    filename: string,
    data: Record<string, unknown>
  ) => Promise<string>;
};

const post = {
  id: 1,
  title: "A <note> & review",
  slug: "a-note",
  url: "/posts/a-note",
  categoryLabel: "books",
  excerpt: "A test excerpt.",
  body: "First paragraph.\nSecond paragraph.",
  featuredImageUrl: "/cover.jpg",
  altText: "Test cover",
  imageCaption: "A test caption.",
  publishedDate: "November 17, 2026",
  publishedDateTime: "2026-11-17T12:00:00.000Z",
  readTime: "1 min",
  pullQuote: null,
  rating: null,
  ratingNote: null,
  closingNote: null
};

const profile = {
  siteName: "Test blog",
  heroText: "A test introduction.",
  aboutContent: "About the blogger.",
  profileImageUrl: "/portrait.jpg",
  contactEmail: null,

  socialLinks: {
    instagram: "https://example.test/instagram",
    tiktok: "https://example.test/tiktok",
    youtube: "https://example.test/youtube"
  }
};

type Page =
  | "home"
  | "category"
  | "post"
  | "404"
  | "error";

function render(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const recommendation = {
    title: "Current favorite",
    coverImageUrl: "/recommendation.jpg",
    coverAltText: "Recommendation cover",
    note: "A short note."
  };

  return ejs.renderFile(
    fileURLToPath(
      new URL(
        `../src/views/pages/${page}.ejs`,
        import.meta.url
      )
    ),
    {
      currentPath: "/",
      profile,
      post,
      posts: [],
      latestPosts: [post],

      category: {
        slug: "books",
        title: "Books"
      },

      currentlyLoving: {
        reading: recommendation,
        watching: recommendation
      },

      anticipatedReleases: {
        books: { text: "Upcoming books." },
        movies: { text: "Upcoming movies." },
        tv: { text: "Upcoming television." }
      },

      heroCollage: {
        primary: {
          imageUrl: "/primary.jpg",
          altText: "Primary photo",
          caption: "Primary caption"
        },

        secondary: {
          imageUrl: "/secondary.jpg",
          altText: "Secondary photo",
          caption: "Secondary caption"
        },

        journal: {
          date: "NOV 17",
          text: "Today I am",
          emphasis: "reading"
        }
      },

      ...overrides
    }
  );
}

function imageTags(html: string): string[] {
  return Array.from(
    html.matchAll(/<img\b[^>]*>/g),
    match => match[0]
  );
}

describe("public usability markup", () => {
  it("provides one main target and a skip link on every public template", async () => {
    const pages: Page[] = [
      "home",
      "category",
      "post",
      "404",
      "error"
    ];

    for (const page of pages) {
      const html = await render(page);

      assert.match(
        html,
        /href="#main-content"/
      );

      assert.match(
        html,
        /<main\b[^>]*id="main-content"[^>]*tabindex="-1"/
      );

      assert.equal(
        (html.match(/id="main-content"/g) ?? []).length,
        1
      );
    }
  });

  it("provides dimensions and decoding hints for homepage images", async () => {
    const images = imageTags(await render("home"));

    assert.equal(images.length, 6);

    for (const image of images) {
      assert.match(image, /\bwidth="[1-9]\d*"/);
      assert.match(image, /\bheight="[1-9]\d*"/);
      assert.match(image, /\bdecoding="async"/);
    }
  });

  it("prioritizes the primary hero and defers lower homepage images", async () => {
    const images = imageTags(await render("home"));

    const primary = images.find(
      image => image.includes('src="/primary.jpg"')
    );

    const secondary = images.find(
      image => image.includes('src="/secondary.jpg"')
    );

    assert.ok(primary);
    assert.ok(secondary);

    assert.match(primary, /loading="eager"/);
    assert.match(primary, /fetchpriority="high"/);
    assert.match(secondary, /loading="eager"/);

    for (const image of images) {
      if (
        image !== primary &&
        image !== secondary
      ) {
        assert.match(image, /loading="lazy"/);
      }
    }
  });

  it("eagerly loads the first category row and uses h2 card headings", async () => {
    const posts = Array.from(
      { length: 4 },
      (_, index) => ({
        ...post,
        id: index + 1,
        url: `/posts/note-${index + 1}`
      })
    );

    const html = await render("category", {
      posts,
      currentPath: "/categories/books"
    });

    const images = imageTags(html);

    assert.equal(images.length, 4);

    images.forEach((image, index) => {
      assert.match(
        image,
        index < 3
          ? /loading="eager"/
          : /loading="lazy"/
      );
    });

    assert.equal(
      (html.match(/<h2>/g) ?? []).length,
      4
    );
  });

  it("keeps post covers eager with a reserved frame", async () => {
    const images = imageTags(await render("post"));

    assert.equal(images.length, 1);

    assert.match(images[0], /width="600"/);
    assert.match(images[0], /height="900"/);
    assert.match(images[0], /loading="eager"/);
  });

  it("gives card links distinct escaped accessible names", async () => {
    const html = await render("home");

    assert.ok(
      html.includes(
        'aria-label="Read the note: A &lt;note&gt; &amp; review"'
      )
    );

    assert.doesNotMatch(
      html,
      /aria-label="Read the note: A <note>/
    );
  });

  it("marks the normalized current category", async () => {
    const html = await render("category", {
      currentPath: "/categories/BOOKS/"
    });

    assert.match(
      html,
      /<a\b[^>]*href="\/categories\/books"[^>]*aria-current="page"/
    );

    assert.equal(
      (html.match(/aria-current="page"/g) ?? []).length,
      1
    );
  });
});