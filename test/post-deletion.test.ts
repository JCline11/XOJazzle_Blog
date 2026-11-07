import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPostDeletionWorkflow,
  PostDeletionConflictError,
  type PostDeletionDependencies
} from "../src/services/post-deletion.ts";

const expectedUpdatedAt =
  new Date("2026-01-01T00:00:00.000Z");

const key = "images/example.webp";

function harness(
  overrides: Partial<PostDeletionDependencies> = {}
) {
  const events: string[] = [];
  const failures: string[] = [];

  const dependencies: PostDeletionDependencies = {
    async deletePost(id, expected) {
      assert.equal(id, 1);
      assert.equal(expected, expectedUpdatedAt);

      events.push("database");

      return {
        featuredImageKey: key
      };
    },

    async isImageReferenced(value) {
      assert.equal(value, key);
      events.push("references");
      return false;
    },

    getStorage() {
      events.push("storage");

      return {
        async uploadImage() {
          throw new Error(
            "Deletion must never upload an image."
          );
        },

        async deleteImage(value) {
          assert.equal(value, key);
          events.push("delete-image");
        }
      };
    },

    reportCleanupFailure(value) {
      failures.push(value);
    },

    ...overrides
  };

  return {
    run: createPostDeletionWorkflow(dependencies),
    events,
    failures
  };
}

describe("post deletion workflow", () => {
  it("deletes the database record before the image", async () => {
    const h = harness();

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      true
    );

    assert.deepEqual(h.events, [
      "database",
      "references",
      "storage",
      "delete-image"
    ]);
  });

  it("returns false for a missing post", async () => {
    const h = harness({
      async deletePost() {
        return null;
      }
    });

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      false
    );

    assert.deepEqual(h.events, []);
  });

  it("does not contact R2 for a legacy image", async () => {
    const h = harness({
      async deletePost() {
        return {
          featuredImageKey: null
        };
      }
    });

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      true
    );

    assert.deepEqual(h.events, []);
  });

  it("does not clean up after database failure", async () => {
    const failure = new Error("Database failure");

    const h = harness({
      async deletePost() {
        throw failure;
      }
    });

    await assert.rejects(
      h.run(1, expectedUpdatedAt),
      error => error === failure
    );

    assert.deepEqual(h.events, []);
  });

  it("does not clean up after a version conflict", async () => {
    const failure =
      new PostDeletionConflictError();

    const h = harness({
      async deletePost() {
        throw failure;
      }
    });

    await assert.rejects(
      h.run(1, expectedUpdatedAt),
      error => error === failure
    );

    assert.deepEqual(h.events, []);
  });

  it("retains an image referenced elsewhere", async () => {
    const h = harness({
      async isImageReferenced() {
        return true;
      }
    });

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      true
    );

    assert.deepEqual(h.events, ["database"]);
  });

  it("keeps deletion successful if the reference check fails", async () => {
    const h = harness({
      async isImageReferenced() {
        throw new Error("Reference lookup failed");
      }
    });

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      true
    );

    assert.deepEqual(h.failures, [key]);
    assert.deepEqual(h.events, ["database"]);
  });

  it("keeps deletion successful if R2 deletion fails", async () => {
    const h = harness({
      getStorage() {
        return {
          async uploadImage() {
            throw new Error("Unexpected upload");
          },

          async deleteImage() {
            throw new Error("R2 unavailable");
          }
        };
      }
    });

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      true
    );

    assert.deepEqual(h.failures, [key]);
  });

  it("keeps deletion successful if storage initialization fails", async () => {
    const h = harness({
      getStorage() {
        throw new Error("Invalid storage configuration");
      }
    });

    assert.equal(
      await h.run(1, expectedUpdatedAt),
      true
    );

    assert.deepEqual(h.failures, [key]);
  });
});