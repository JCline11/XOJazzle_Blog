import {
  DeleteObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";

import { loadR2Config } from "../config/r2-env.ts";
import { createR2Client } from "../lib/r2.ts";

import {
  createImageStorage,
  type ImageStorage
} from "./image-storage.ts";

export function createConfiguredR2ImageStorage():
ImageStorage {
  const config = loadR2Config();
  const client = createR2Client(config);

  return createImageStorage(
    {
      bucket: config.R2_BUCKET_NAME,
      publicBaseUrl: config.R2_PUBLIC_BASE_URL
    },
    {
      putObject(input) {
        return client.send(
          new PutObjectCommand(input)
        );
      },

      deleteObject(input) {
        return client.send(
          new DeleteObjectCommand(input)
        );
      }
    }
  );
}