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

function deletionValues() {
  return {
    post: {
      id: 1,
      title: "Example post",
      category: "BOOKS",
      status: "DRAFT"
    },

    postVersion: "2026-01-01T00:00:00.000Z"
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

  it("renders protected deletion confirmation", async () => {
    const html = await render(
      "post-delete",
      deletionValues()
    );

    const confirmation = namedInput(
      html,
      "confirmDelete"
    );

    assert.match(
      html,
      /<form\b[^>]*method="post"[^>]*action="\/admin\/posts\/1\/delete"/
    );

    assert.match(confirmation, /type="checkbox"/);
    assert.match(confirmation, /value="yes"/);
    assert.match(confirmation, /\brequired\b/);

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

  it("escapes post titles on deletion confirmation", async () => {
    const values = deletionValues();

    const html = await render("post-delete", {
      ...values,

      post: {
        ...values.post,
        title: "<script>alert(1)</script>"
      }
    });

    assert.doesNotMatch(
      html,
      /<script>alert\(1\)<\/script>/
    );

    assert.match(
      html,
      /&lt;script&gt;alert\(1\)&lt;\/script&gt;/
    );
  });

  it("links to confirmation instead of posting deletion directly", async () => {
    const html = await render("dashboard", {
      notice: null,

      posts: [
        {
          id: 1,
          title: "Example post",
          slug: "example-post",
          category: "books",
          status: "draft",
          updatedAt: "Nov 6, 2026"
        }
      ]
    });

    assert.match(
      html,
      /href="\/admin\/posts\/1\/delete"/
    );

    assert.doesNotMatch(
      html,
      /<form\b[^>]*action="\/admin\/posts\/1\/delete"/
    );
  });
});