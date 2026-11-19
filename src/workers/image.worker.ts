import { createRequire } from "node:module";
import {
  parentPort,
  workerData
} from "node:worker_threads";

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import {
  ImageUploadError,
  isHeifMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PIXELS,
  validateDetectedMime,
  validateImageDimensions,
  type ImageWorkerResult,
  type UploadedImageInput
} from "../config/image-upload.ts";

type DecodedHeicImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type HeicImageHandle = {
  width: number;
  height: number;
  decode: () => Promise<DecodedHeicImage>;
};

type HeicImages = HeicImageHandle[] & {
  dispose: () => void;
};

type HeicDecoder = {
  all: (
    input: { buffer: Uint8Array }
  ) => Promise<HeicImages>;
};

const require = createRequire(import.meta.url);

sharp.cache(false);
sharp.concurrency(1);

async function decodeHeif(buffer: Buffer) {
  const decoder =
    require("heic-decode") as HeicDecoder;

  const images = await decoder.all({ buffer });

  try {
    if (images.length !== 1) {
      throw new ImageUploadError(
        "Choose a single still photo, or export this image as JPEG."
      );
    }

    const handle = images[0];

    validateImageDimensions(
      handle.width,
      handle.height
    );

    const image = await handle.decode();

    validateImageDimensions(
      image.width,
      image.height
    );

    if (
      image.data.byteLength !==
      image.width * image.height * 4
    ) {
      throw new ImageUploadError(
        "The image could not be decoded."
      );
    }

    return {
      bytes: Buffer.from(
        image.data.buffer,
        image.data.byteOffset,
        image.data.byteLength
      ),
      width: image.width,
      height: image.height
    };
  } finally {
    images.dispose();
  }
}

async function convertImage(
  input: UploadedImageInput
): Promise<Uint8Array> {
  const buffer = Buffer.from(input.buffer);

  if (
    buffer.byteLength === 0 ||
    buffer.byteLength > MAX_IMAGE_BYTES
  ) {
    throw new ImageUploadError(
      "Choose a non-empty image no larger than 5 MiB.",
      413
    );
  }

  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    throw new ImageUploadError(
      "The file is not a recognized image."
    );
  }

  validateDetectedMime(
    input.mimetype,
    detected.mime
  );

  let pipeline;

  if (isHeifMime(detected.mime)) {
    if (detected.mime.endsWith("-sequence")) {
      throw new ImageUploadError(
        "Choose a single still photo, or export this image as JPEG."
      );
    }

    const decoded = await decodeHeif(buffer);

    pipeline = sharp(decoded.bytes, {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4
      },
      limitInputPixels: MAX_IMAGE_PIXELS
    });
  } else {
    pipeline = sharp(buffer, {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS
    });

    const metadata = await pipeline.metadata();

    const expectedFormat = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp"
    }[detected.mime];

    if (
      metadata.format !== expectedFormat ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new ImageUploadError(
        "Choose a supported single still image."
      );
    }

    validateImageDimensions(
      metadata.width ?? 0,
      metadata.height ?? 0
    );
  }

  const output = await pipeline
    .autoOrient()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({
      quality: 80,
      effort: 4
    })
    .toBuffer();

  if (
    output.byteLength === 0 ||
    output.byteLength > MAX_IMAGE_BYTES
  ) {
    throw new ImageUploadError(
      "The optimized image exceeds the allowed size."
    );
  }

  return output;
}

async function main(): Promise<void> {
  if (!parentPort) {
    throw new Error(
      "Image processing requires a worker."
    );
  }

  let result: ImageWorkerResult;

  try {
    const bytes = await convertImage(
      workerData as UploadedImageInput
    );

    result = {
      ok: true,
      bytes
    };
  } catch (error) {
    result = {
      ok: false,

      message:
        error instanceof ImageUploadError
          ? error.message
          : "The image could not be processed. Try exporting it as JPEG.",

      status:
        error instanceof ImageUploadError
          ? error.status
          : 400
    };
  }

  parentPort.postMessage(result);
}

void main();