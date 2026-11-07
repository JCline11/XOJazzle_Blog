import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  IMAGE_INPUT_ACCEPT
} from "../src/config/image-upload.ts";

import {
  emptyAdminPostForm
} from "../src/validation/admin-post.validation.ts";

import {
  toAdminHomepageFormValues
} from "../src/validation/admin-homepage.validation.ts";

import {
  HOMEPAGE_IMAGE_FIELDS
} from "../src/services/homepage-upload.ts";

const ejs = createRequire(import.meta.url)("ejs") as {
  renderFile: (
    filename: string,
    data: Record<string, unknown>
  ) => Promise<string>;
};

async function render(
  name: string,
  values: Record<string, unknown>
): Promise<string> {
  const filename = fileURLToPath(
    new URL(
      `../src/views/pages/admin/${name}.ejs`,
      import.meta.url
    )
  );

  return ejs.renderFile(filename, {
    csrfToken: "test-csrf-token",
    postVersion: "2026-01-01T00:00:00.000Z",
    homepageVersion: "test-homepage-version",
    imageAccept: IMAGE_INPUT_ACCEPT,
    error: null,
    ...values
  });
}

function inputTags(html: string): string[] {
  return Array.from(
    html.matchAll(/<input\b[^>]*>/gi),
    match => match[0]
  );
}

function namedInput(
  html: string,
  name: string
): string {
  const input = inputTags(html).find(tag =>
    tag.includes(`name="${name}"`)
  );

  assert.ok(input, `Expected input ${name}.`);

  return input;
}

function postFormValues() {
  return {
    post: emptyAdminPostForm,
    currentImageUrl: null,
    heading: "Create a post",
    action: "/admin/posts",
    submitLabel: "create post"
  };
}

function dashboardValues(title = "Example post") {
  return {
    notice: null,
    posts: [{
      id: 1,
      title,
      slug: "example-post",
      category: "books",
      status: "draft",
      updatedAt: "Nov 6, 2026",
      postVersion: "2026-01-01T00:00:00.000Z"
    }]
  };
}

describe("administrator form rendering", () => {
  it("requires a file when creating a post", async () => {
    const html = await render(
      "post-form",
      postFormValues()
    );

    const image = namedInput(
      html,
      "featuredImage"
    );

    assert.match(html, /enctype="multipart\/form-data"/);
    assert.match(image, /type="file"/);
    assert.match(image, /\brequired\b/);
    assert.match(image, /\.heic/);
    assert.match(image, /\.heif/);

    assert.doesNotMatch(
      html,
      /name="featuredImage(?:Url|Key)"/
    );
  });

  it("makes replacement optional for an existing image", async () => {
    const html = await render("post-form", {
      ...postFormValues(),
      heading: "Edit a post",
      action: "/admin/posts/1",
      submitLabel: "save changes",
      currentImageUrl: "/images/existing.jpg"
    });

    const image = namedInput(
      html,
      "featuredImage"
    );

    assert.doesNotMatch(image, /\brequired\b/);

    assert.match(
      html,
      /src="\/images\/existing\.jpg"/
    );
  });

  it("renders five optional homepage upload inputs", async () => {
    const currentImages = Object.fromEntries(
      HOMEPAGE_IMAGE_FIELDS.map(field => [
        field,
        {
          url: `/images/${field}.jpg`,
          key: null
        }
      ])
    );

    const html = await render("homepage-form", {
      homepage: toAdminHomepageFormValues({
        siteName: "Example blog"
      }),

      currentImages
    });

    const files = inputTags(html).filter(tag =>
      /type="file"/.test(tag)
    );

    assert.equal(files.length, 5);

    for (const field of HOMEPAGE_IMAGE_FIELDS) {
      const image = namedInput(html, field);

      assert.match(image, /type="file"/);
      assert.match(image, /\.heic/);
      assert.doesNotMatch(image, /\brequired\b/);
    }

    assert.match(
      html,
      /enctype="multipart\/form-data"/
    );

    assert.doesNotMatch(
      html,
      /name="(?:profileImageUrl|heroPrimaryImageUrl|heroSecondaryImageUrl|readingCoverImageUrl|watchingCoverImageUrl)"/
    );
  });

  it("renders protected deletion confirmation in a dashboard modal", async () => {
    const html = await render(
      "dashboard",
      dashboardValues()
    );

    const confirmation = namedInput(
      html,
      "confirmDelete"
    );

    assert.match(
      html,
      /<form\b[^>]*method="post"[^>]*action="\/admin\/posts\/1\/delete"/
    );

    assert.match(html, /<dialog\b[^>]*id="delete-post-1"/);
    assert.match(html, /aria-labelledby="delete-post-title-1"/);
    assert.match(html, /aria-describedby="delete-post-description-1"/);
    assert.match(html, /Are you sure you want to delete:/);
    assert.match(confirmation, /type="hidden"/);
    assert.match(confirmation, /value="yes"/);
    assert.match(html, /type="button"[^>]*data-cancel-delete[^>]*autofocus/);
    assert.match(html, /src="\/js\/admin-delete\.js" defer/);

    assert.match(
      namedInput(html, "_csrf"),
      /value="test-csrf-token"/
    );

    assert.match(
      namedInput(html, "postVersion"),
      /value="2026-01-01T00:00:00\.000Z"/
    );

    assert.doesNotMatch(
      html,
      /\bon(?:submit|click|change)\s*=/i
    );
  });

  it("escapes post titles in deletion modals", async () => {
    const html = await render(
      "dashboard",
      dashboardValues('<script>alert(1)</script>')
    );

    assert.doesNotMatch(
      html,
      /<script>alert\(1\)<\/script>/
    );

    assert.match(
      html,
      /&lt;script&gt;alert\(1\)&lt;\/script&gt;/
    );
  });

  it("opens confirmation with a non-submitting button instead of a page link", async () => {
    const html = await render("dashboard", dashboardValues());

    assert.match(
      html,
      /<button\b[^>]*type="button"[^>]*data-delete-dialog="delete-post-1"/
    );

    assert.doesNotMatch(
      html,
      /href="\/admin\/posts\/1\/delete"/
    );
  });

  it("keeps each post's title, action, and version in its own dialog", async () => {
    const values = dashboardValues();
    values.posts.push({
      ...values.posts[0],
      id: 2,
      title: "Another post",
      postVersion: "2026-02-01T00:00:00.000Z"
    });

    const html = await render("dashboard", values);
    const dialogs = Array.from(html.matchAll(/<dialog\b[\s\S]*?<\/dialog>/g), match => match[0]);

    assert.equal(dialogs.length, 2);
    assert.match(dialogs[0], /Example post/);
    assert.match(dialogs[0], /action="\/admin\/posts\/1\/delete"/);
    assert.match(dialogs[0], /value="2026-01-01T00:00:00\.000Z"/);
    assert.match(dialogs[1], /Another post/);
    assert.match(dialogs[1], /action="\/admin\/posts\/2\/delete"/);
    assert.match(dialogs[1], /value="2026-02-01T00:00:00\.000Z"/);
  });
});
