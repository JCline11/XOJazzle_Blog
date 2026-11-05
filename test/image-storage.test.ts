import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  DeleteObjectCommandInput,
  PutObjectCommandInput
} from "@aws-sdk/client-s3";

import {
  createImageStorage,
  type ImageContentType,
  type ImageStorageDependencies
} from "../src/services/image-storage.ts";

const options = {
  bucket: "test-images",
  publicBaseUrl: "https://images.example.com"
};

function createHarness(
  overrides: Partial<ImageStorageDependencies> = {}
) {
  const uploads: PutObjectCommandInput[] = [];
  const deletions: DeleteObjectCommandInput[] = [];

  const storage = createImageStorage(
    options,
    {
      async putObject(input) {
        uploads.push(input);
      },

      async deleteObject(input) {
        deletions.push(input);
      },

      ...overrides
    }
  );

  return {
    storage,
    uploads,
    deletions
  };
}

describe("image storage", () => {
  const formats = [
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ] as const;

  for (const [contentType, extension] of formats) {
    it(
      `uploads ${contentType} with the expected metadata`,
      async () => {
        const { storage, uploads } =
          createHarness();

        const bytes =
          new Uint8Array([1, 2, 3]);

        const result = await storage.uploadImage({
          bytes,
          contentType
        });

        assert.match(
          result.key,
          /^images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/
        );

        assert.ok(
          result.key.endsWith(`.${extension}`)
        );

        assert.equal(
          result.url,
          `${options.publicBaseUrl}/${result.key}`
        );

        assert.equal(uploads.length, 1);

        assert.deepEqual(uploads[0], {
          Bucket: options.bucket,
          Key: result.key,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: contentType,
          CacheControl:
            "public, max-age=31536000, immutable"
        });
      }
    );
  }

  it("uses a different key for each upload", async () => {
    const { storage } = createHarness();

    const image = {
      bytes: new Uint8Array([1]),
      contentType: "image/png" as const
    };

    const first = await storage.uploadImage(image);
    const second = await storage.uploadImage(image);

    assert.notEqual(first.key, second.key);
  });

  it("rejects empty image data before storage", async () => {
    const { storage, uploads } =
      createHarness();

    await assert.rejects(
      storage.uploadImage({
        bytes: new Uint8Array(),
        contentType: "image/png"
      }),
      /Image data is empty/
    );

    assert.equal(uploads.length, 0);
  });

  it("rejects unsupported runtime content types", async () => {
    const { storage, uploads } =
      createHarness();

    await assert.rejects(
      storage.uploadImage({
        bytes: new Uint8Array([1]),
        contentType:
          "image/svg+xml" as ImageContentType
      }),
      /Unsupported image content type/
    );

    assert.equal(uploads.length, 0);
  });

  it("propagates upload failures", async () => {
    const failure =
      new Error("Simulated upload failure");

    const { storage } = createHarness({
      async putObject() {
        throw failure;
      }
    });

    await assert.rejects(
      storage.uploadImage({
        bytes: new Uint8Array([1]),
        contentType: "image/png"
      }),
      error => error === failure
    );
  });

  it("deletes the exact managed object key", async () => {
    const { storage, deletions } =
      createHarness();

    const key =
      "images/12345678-1234-4123-8123-123456789abc.webp";

    await storage.deleteImage(key);

    assert.deepEqual(deletions, [
      {
        Bucket: options.bucket,
        Key: key
      }
    ]);
  });

  it("rejects unmanaged deletion keys", async () => {
    const { storage, deletions } =
      createHarness();

    const invalidKeys = [
      "",
      "../private.txt",
      "images/../../private.txt",
      "/images/profile.jpg",
      "https://example.com/photo.jpg",
      "other/12345678-1234-4123-8123-123456789abc.webp"
    ];

    for (const key of invalidKeys) {
      await assert.rejects(
        storage.deleteImage(key),
        /Invalid managed image key/
      );
    }

    assert.equal(deletions.length, 0);
  });

  it("propagates deletion failures", async () => {
    const failure =
      new Error("Simulated deletion failure");

    const { storage } = createHarness({
      async deleteObject() {
        throw failure;
      }
    });

    await assert.rejects(
      storage.deleteImage(
        "images/12345678-1234-4123-8123-123456789abc.webp"
      ),
      error => error === failure
    );
  });
});