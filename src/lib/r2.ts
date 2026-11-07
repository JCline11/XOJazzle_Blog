import { S3Client } from "@aws-sdk/client-s3";

import type { R2Config } from "../config/r2-env.ts";

export function createR2Client(
  config: R2Config
): S3Client {
  return new S3Client({
    region: "auto",
    maxAttempts: 2,
    requestHandler: {
      connectionTimeout: 5_000,
      requestTimeout: 20_000,
      // This SDK otherwise only warns when the request deadline expires.
      throwOnRequestTimeout: true
    },

    endpoint:
      `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY
    }
  });
}
