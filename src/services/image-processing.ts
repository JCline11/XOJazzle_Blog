import { Worker } from "node:worker_threads";

import {
  ImageUploadError,
  IMAGE_PROCESSING_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  type ImageWorkerResult,
  type UploadedImageInput
} from "../config/image-upload.ts";

import type {
  ImageUpload
} from "./image-storage.ts";

let processingImage = false;

export async function processUploadedImage(
  input: UploadedImageInput
): Promise<ImageUpload> {
  if (
    input.buffer.byteLength === 0 ||
    input.buffer.byteLength > MAX_IMAGE_BYTES
  ) {
    throw new ImageUploadError(
      "Choose a non-empty image no larger than 5 MiB.",
      413
    );
  }

  if (processingImage) {
    throw new ImageUploadError(
      "Another image is being processed. Please try again shortly.",
      503
    );
  }

  processingImage = true;

  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    worker = new Worker(
      new URL(
        "../workers/image.worker.ts",
        import.meta.url
      ),
      {
        workerData: input,

        // Use Node's native TypeScript stripping.
        // Do not inherit tsx watch or test arguments.
        execArgv: [],

        resourceLimits: {
          maxOldGenerationSizeMb: 128
        },

        stdout: true,
        stderr: true
      }
    );

    worker.stdout?.resume();
    worker.stderr?.resume();

    const bytes = await new Promise<Uint8Array>(
      (resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new ImageUploadError(
              "Image processing took too long. Try a smaller image.",
              408
            )
          );
        }, IMAGE_PROCESSING_TIMEOUT_MS);

        worker!.once(
          "message",
          (result: ImageWorkerResult) => {
            if (!result.ok) {
              reject(
                new ImageUploadError(
                  result.message,
                  result.status
                )
              );
              return;
            }

            resolve(result.bytes);
          }
        );

        worker!.once("error", () => {
          reject(
            new ImageUploadError(
              "The image could not be processed."
            )
          );
        });

        worker!.once("exit", () => {
          reject(
            new ImageUploadError(
              "Image processing stopped unexpectedly."
            )
          );
        });
      }
    );

    return {
      bytes,
      contentType: "image/webp"
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }

    try {
      if (worker) {
        await worker.terminate();
      }
    } finally {
      processingImage = false;
    }
  }
}