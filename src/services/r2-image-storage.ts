import {
  DeleteObjectCommand,
  PutObjectCommand,
  type S3Client
} from "@aws-sdk/client-s3";

import { loadR2Config } from "../config/r2-env.ts";
import { createR2Client } from "../lib/r2.ts";

import {
  createImageStorage,
  type ImageStorage
} from "./image-storage.ts";

const clients = new Set<S3Client>();

export function closeR2Clients(): void {
  for (const client of clients) {
    client.destroy();
  }

  clients.clear();
}

export function createConfiguredR2ImageStorage():
ImageStorage {
  const config = loadR2Config();
  const client = createR2Client(config);

  clients.add(client);

  return createImageStorage(
    {
      bucket: config.R2_BUCKET_NAME,
      publicBaseUrl: config.R2_PUBLIC_BASE_URL
    },
    {
      putObject(input) {
        // Bound the whole operation, including SDK retries and backoff.
        return client.send(
          new PutObjectCommand(input),
          { abortSignal: AbortSignal.timeout(30_000) }
        );
      },

      deleteObject(input) {
        return client.send(
          new DeleteObjectCommand(input),
          { abortSignal: AbortSignal.timeout(30_000) }
        );
      }
    }
  );
}