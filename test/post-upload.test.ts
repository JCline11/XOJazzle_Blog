import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminPostSchema,
  type AdminPostInput
} from "../src/validation/admin-post.validation.ts";

import {
  createPostUploadWorkflow,
  PostEditConflictError,
  type PostImageState,
  type PostUploadDependencies
} from "../src/services/post-upload.ts";

const input: AdminPostInput = {
  title: "Example review",
  slug: "example-review",
  excerpt: "An example excerpt.",
  body: "An example review.",
  altText: "Example cover",
  imageCaption: "",
  pullQuote: "",
  rating: "",
  ratingNote: "",
  closingNote: "",
  category: "BOOKS",
  status: "DRAFT"
};

const file = {
  buffer: new Uint8Array([1]),
  mimetype: "image/png"
};

const processed = {
  bytes: new Uint8Array([2]),
  contentType: "image/webp" as const
};

const uploaded = {
  url: "https://images.example.com/images/new.webp",
  key: "images/new.webp"
};

const existing: PostImageState = {
  id: 1,
  featuredImageUrl:
    "https://images.example.com/images/old.webp",
  featuredImageKey: "images/old.webp",
  publishedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function harness(
  overrides: Partial<PostUploadDependencies> = {}
) {
  const events: string[] = [];
  const cleanupFailures: string[] = [];

  const dependencies: PostUploadDependencies = {
    async getPost() {
      return existing;
    },

    async createPost(text, image) {
      assert.deepEqual(text, input);
      assert.deepEqual(image, uploaded);
      events.push("create");
    },

    async updatePost(id, text, expected, image) {
      assert.equal(id, 1);
      assert.deepEqual(text, input);
      assert.deepEqual(expected, existing);

      events.push(
        image ? "update-image" : "update-text"
      );
    },

    async processImage() {
      events.push("process");
      return processed;
    },

    getStorage() {
      events.push("storage");

      return {
        async uploadImage(image) {
          assert.deepEqual(image, processed);
          events.push("upload");
          return uploaded;
        },

        async deleteImage(key) {
          events.push(`delete:${key}`);
        }
      };
    },

    reportCleanupFailure(key) {
      cleanupFailures.push(key);
    },

    ...overrides
  };

  return {
    save: createPostUploadWorkflow(dependencies),
    events,
    cleanupFailures
  };
}

describe("post image workflow", () => {
  it("requires an image for a new post", async () => {
    const { save, events } = harness();

    await assert.rejects(
      save(null, input),
      /Choose a featured image/
    );

    assert.deepEqual(events, []);
  });

  it("processes and uploads before creating", async () => {
    const { save, events } = harness();

    assert.equal(
      await save(null, input, file),
      true
    );

    assert.deepEqual(events, [
      "process",
      "storage",
      "upload",
      "create"
    ]);
  });

  it("keeps the existing image without storage calls", async () => {
    const { save, events } = harness();

    assert.equal(await save(1, input), true);

    assert.deepEqual(events, ["update-text"]);
  });

  it("does not upload for a missing post", async () => {
    const { save, events } = harness({
      async getPost() {
        return null;
      }
    });

    assert.equal(
      await save(1, input, file),
      false
    );

    assert.deepEqual(events, []);
  });

  it("does not contact storage after processing fails", async () => {
    const failure = new Error("Invalid image");

    const { save, events } = harness({
      async processImage() {
        throw failure;
      }
    });

    await assert.rejects(
      save(null, input, file),
      error => error === failure
    );

    assert.deepEqual(events, []);
  });

  it("does not save when upload fails", async () => {
    const { save, events } = harness({
      getStorage() {
        return {
          async uploadImage() {
            throw new Error("Simulated R2 failure");
          },

          async deleteImage() {
            assert.fail("No confirmed upload exists");
          }
        };
      }
    });

    await assert.rejects(
      save(null, input, file),
      /could not be stored/
    );

    assert.deepEqual(events, ["process"]);
  });

  it("cleans up a new upload after a failed save", async () => {
    const failure = new Error("Database failure");

    const { save, events } = harness({
      async createPost() {
        throw failure;
      }
    });

    await assert.rejects(
      save(null, input, file),
      error => error === failure
    );

    assert.deepEqual(events, [
      "process",
      "storage",
      "upload",
      `delete:${uploaded.key}`
    ]);
  });

  it("deletes the old image after replacement succeeds", async () => {
    const { save, events } = harness();

    await save(1, input, file);

    assert.deepEqual(events, [
      "process",
      "storage",
      "upload",
      "update-image",
      `delete:${existing.featuredImageKey}`
    ]);
  });

  it("does not delete legacy images", async () => {
    const { save, events } = harness({
      async getPost() {
        return {
          ...existing,
          featuredImageKey: null
        };
      },

      async updatePost() {
        events.push("update-image");
      }
    });

    await save(1, input, file);

    assert.equal(
      events.some(event => event.startsWith("delete:")),
      false
    );
  });

  it("cleans up only the new image after an edit conflict", async () => {
    const failure = new PostEditConflictError();

    const { save, events } = harness({
      async updatePost() {
        throw failure;
      }
    });

    await assert.rejects(
      save(1, input, file),
      error => error === failure
    );

    assert.deepEqual(events, [
      "process",
      "storage",
      "upload",
      `delete:${uploaded.key}`
    ]);
  });

  it("keeps a successful save when old cleanup fails", async () => {
    const { save, cleanupFailures } = harness({
      getStorage() {
        return {
          async uploadImage() {
            return uploaded;
          },

          async deleteImage() {
            throw new Error("Simulated cleanup failure");
          }
        };
      }
    });

    assert.equal(
      await save(1, input, file),
      true
    );

    assert.deepEqual(cleanupFailures, [
      existing.featuredImageKey
    ]);
  });

  it("ignores submitted image URLs and keys", () => {
    const result = adminPostSchema.parse({
      ...input,
      featuredImageUrl: "https://untrusted.example/photo.jpg",
      featuredImageKey: "someone-elses-object"
    });

    assert.equal(
      Object.hasOwn(result, "featuredImageUrl"),
      false
    );

    assert.equal(
      Object.hasOwn(result, "featuredImageKey"),
      false
    );
  });
});