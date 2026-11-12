import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ejs = createRequire(import.meta.url)("ejs") as {
  renderFile: (
    filename: string,
    data: Record<string, unknown>
  ) => Promise<string>;
};

const profile = {
  siteName: "Test blog",
  heroText: "A little introduction.",
  aboutContent: "About the blogger.",
  profileImageUrl: "/images/profile.jpg",
  contactEmail: null,
  socialLinks: {
    instagram: "https://example.com/instagram",
    tiktok: "https://example.com/tiktok",
    youtube: "https://example.com/youtube"
  }
};

async function render(
  page: "post" | "home",
  values: Record<string, unknown>
): Promise<string> {
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
      ...values
    }
  );
}

function renderPost(
  body: string,
  pullQuote: string | null
): Promise<string> {
  return render("post", {
    post: {
      title: "A test note",
      categoryLabel: "books",
      excerpt: "A test excerpt.",
      body,
      pullQuote,
      publishedDate: "November 11, 2026",
      readTime: "1 min",
      featuredImageUrl: "/images/cover.jpg",
      altText: "Test cover",
      imageCaption: null,
      rating: null,
      ratingNote: null,
      closingNote: null
    }
  });
}

function quoteCount(html: string): number {
  return Array.from(
    html.matchAll(
      /<blockquote\b[^>]*class="simple-post-quote"/g
    )
  ).length;
}

describe("public content rendering", () => {
  it("shows a quote after a single paragraph", async () => {
    const html = await renderPost(
      "  Opening paragraph.\n\n",
      "  Pull quote marker  "
    );

    assert.equal(quoteCount(html), 1);
    assert.ok(
      html.indexOf("Opening paragraph.") <
      html.indexOf("Pull quote marker")
    );
  });

  it("shows a quote after the second paragraph of longer posts", async () => {
    const html = await renderPost(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
      "Pull quote marker"
    );

    assert.equal(quoteCount(html), 1);

    const first = html.indexOf("First paragraph.");
    const second = html.indexOf("Second paragraph.");
    const quote = html.indexOf("Pull quote marker");
    const third = html.indexOf("Third paragraph.");

    assert.ok(first < second);
    assert.ok(second < quote);
    assert.ok(quote < third);
  });

  it("omits missing and blank quotes", async () => {
    for (const quote of [null, "", " \n\t "]) {
      const html = await renderPost(
        "Opening paragraph.",
        quote
      );

      assert.equal(quoteCount(html), 0);
    }
  });

  it("handles Windows paragraph separators", async () => {
    const html = await renderPost(
      "First paragraph.\r\n\r\nSecond paragraph.",
      "Pull quote marker"
    );

    assert.equal(quoteCount(html), 1);

    assert.ok(
      html.indexOf("Second paragraph.") <
      html.indexOf("Pull quote marker")
    );
  });

  it("escapes body and pull-quote HTML", async () => {
    const html = await renderPost(
      "<script>alert('body')</script>",
      "<img src=x onerror=alert(1)>"
    );

    assert.doesNotMatch(
      html,
      /<script>alert\('body'\)<\/script>/
    );

    assert.doesNotMatch(
      html,
      /<img src=x onerror=alert\(1\)>/
    );

    assert.match(html, /&lt;script&gt;/);
    assert.match(
      html,
      /&lt;img src=x onerror=alert\(1\)&gt;/
    );
  });

  it("links homepage categories to their full archives", async () => {
    const recommendation = {
      title: "A current favorite",
      coverImageUrl: "/images/cover.jpg",
      coverAltText: "Test cover",
      note: "A short recommendation."
    };

    const photo = {
      imageUrl: "/images/photo.jpg",
      altText: "Test photo",
      caption: "A quiet afternoon"
    };

    const html = await render("home", {
      latestPosts: [],
      currentlyLoving: {
        reading: recommendation,
        watching: recommendation
      },
      anticipatedReleases: {
        books: { text: "Upcoming books." },
        movies: { text: "Upcoming movies." },
        tv: { text: "Upcoming TV." }
      },
      heroCollage: {
        primary: photo,
        secondary: photo,
        journal: {
          date: "NOV 11",
          text: "Today I am",
          emphasis: "making time to read"
        }
      }
    });

    const navigation = html.match(
      /<nav\b[^>]*aria-label="Browse notes by category"[^>]*>[\s\S]*?<\/nav>/
    );

    assert.ok(navigation);

    for (const category of [
      "books",
      "movies",
      "anime",
      "tv"
    ]) {
      assert.ok(
        navigation[0].includes(
          `href="/categories/${category}"`
        )
      );
    }

    assert.equal(
      Array.from(navigation[0].matchAll(/<a\b/g)).length,
      4
    );

    assert.doesNotMatch(navigation[0], /<button\b/);
    assert.doesNotMatch(html, /data-filter=/);
    assert.match(
      html,
      /Explore every story by category/
    );
  });
});