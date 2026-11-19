import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  MAX_IMAGE_BYTES,
  validateImageDimensions
} from "../src/config/image-upload.ts";

import {
  processUploadedImage
} from "../src/services/image-processing.ts";

async function makeImage(
  format: "jpeg" | "png" | "webp"
): Promise<Buffer> {
  return sharp({
    create: {
      width: 80,
      height: 40,
      channels: 3,
      background: "#b76e79"
    }
  })
    .toFormat(format)
    .toBuffer();
}

describe("image processing", () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    it(`converts ${format} to WebP`, async () => {
      const result = await processUploadedImage({
        buffer: await makeImage(format),
        mimetype: `image/${format}`
      });

      const metadata = await sharp(
        Buffer.from(result.bytes)
      ).metadata();

      assert.equal(result.contentType, "image/webp");
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, 80);
      assert.equal(metadata.height, 40);
    });
  }

  it("accepts a generic MIME label after byte validation", async () => {
    const result = await processUploadedImage({
      buffer: await makeImage("png"),
      mimetype: "application/octet-stream"
    });

    assert.equal(result.contentType, "image/webp");
  });

  it("rejects a specific MIME mismatch", async () => {
    await assert.rejects(
      processUploadedImage({
        buffer: await makeImage("png"),
        mimetype: "image/jpeg"
      }),
      /do not match/
    );
  });

  it("rejects unsupported contents", async () => {
    await assert.rejects(
      processUploadedImage({
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        ),
        mimetype: "application/octet-stream"
      })
    );
  });

  it("rejects empty and oversized files", async () => {
    for (const buffer of [
      Buffer.alloc(0),
      Buffer.alloc(MAX_IMAGE_BYTES + 1)
    ]) {
      await assert.rejects(
        processUploadedImage({
          buffer,
          mimetype: "image/png"
        }),
        /5 MiB/
      );
    }
  });

  it("enforces the decoded pixel budget", () => {
    assert.doesNotThrow(() => {
      validateImageDimensions(6000, 4000);
    });

    assert.throws(() => {
      validateImageDimensions(8000, 6000);
    }, /25 million pixels/);
  });

  it("corrects JPEG orientation and removes metadata", async () => {
    const buffer = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 3,
        background: "#b76e79"
      }
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage({
      buffer,
      mimetype: "image/jpeg"
    });

    const metadata = await sharp(
      Buffer.from(result.bytes)
    ).metadata();

    assert.equal(metadata.width, 40);
    assert.equal(metadata.height, 80);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
  });

  it("resizes large images without changing aspect ratio", async () => {
    const buffer = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: "#b76e79"
      }
    })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage({
      buffer,
      mimetype: "image/jpeg"
    });

    const metadata = await sharp(
      Buffer.from(result.bytes)
    ).metadata();

    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 960);
  });

  it("converts a genuine Apple HEIC photo", async () => {
    const buffer = await readFile(
      new URL(
        "./fixtures/apple-photo.heic",
        import.meta.url
      )
    );

    const result = await processUploadedImage({
      buffer,
      mimetype: "image/heic"
    });

    const metadata = await sharp(
      Buffer.from(result.bytes)
    ).metadata();

    assert.equal(metadata.format, "webp");
    assert.ok((metadata.width ?? 0) > 0);
    assert.ok((metadata.height ?? 0) > 0);
    assert.ok((metadata.width ?? 0) <= 1920);
    assert.ok((metadata.height ?? 0) <= 1920);
    assert.equal(metadata.exif, undefined);
  });
});