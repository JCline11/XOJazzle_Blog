import { randomUUID } from "node:crypto";

import type {
  DeleteObjectCommandInput,
  PutObjectCommandInput
} from "@aws-sdk/client-s3";

const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

const IMAGE_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

const MANAGED_IMAGE_KEY =
  /^images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

export type ImageContentType =
  keyof typeof IMAGE_EXTENSIONS;

export type ImageUpload = {
  bytes: Uint8Array;
  contentType: ImageContentType;
};

export type StoredImage = {
  url: string;
  key: string;
};

export type ImageStorage = {
  uploadImage: (
    image: ImageUpload
  ) => Promise<StoredImage>;

  deleteImage: (key: string) => Promise<void>;
};

export type ImageStorageOptions = {
  bucket: string;
  publicBaseUrl: string;
};

export type ImageStorageDependencies = {
  putObject: (
    input: PutObjectCommandInput
  ) => Promise<unknown>;

  deleteObject: (
    input: DeleteObjectCommandInput
  ) => Promise<unknown>;
};

export function createImageStorage(
  options: ImageStorageOptions,
  dependencies: ImageStorageDependencies
): ImageStorage {
  return {
    async uploadImage(image) {
      if (
        !Object.hasOwn(
          IMAGE_EXTENSIONS,
          image.contentType
        )
      ) {
        throw new Error(
          "Unsupported image content type."
        );
      }

      if (image.bytes.byteLength === 0) {
        throw new Error("Image data is empty.");
      }

      const extension =
        IMAGE_EXTENSIONS[image.contentType];

      const key =
        `images/${randomUUID()}.${extension}`;

      await dependencies.putObject({
        Bucket: options.bucket,
        Key: key,
        Body: image.bytes,
        ContentLength: image.bytes.byteLength,
        ContentType: image.contentType,
        CacheControl: IMAGE_CACHE_CONTROL
      });

      return {
        url: `${options.publicBaseUrl}/${key}`,
        key
      };
    },

    async deleteImage(key) {
      if (!MANAGED_IMAGE_KEY.test(key)) {
        throw new Error(
          "Invalid managed image key."
        );
      }

      await dependencies.deleteObject({
        Bucket: options.bucket,
        Key: key
      });
    }
  };
}