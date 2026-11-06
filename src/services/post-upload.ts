import {
  ImageUploadError,
  type UploadedImageInput
} from "../config/image-upload.ts";

import type {
  AdminPostInput
} from "../validation/admin-post.validation.ts";

import type {
  ImageStorage,
  ImageUpload,
  StoredImage
} from "./image-storage.ts";

export class PostSlugConflictError extends Error {
  constructor() {
    super("A post already uses that slug.");
    this.name = "PostSlugConflictError";
  }
}

export class PostEditConflictError extends Error {
  constructor() {
    super(
      "This post changed while you were saving. Review the current post and try again."
    );

    this.name = "PostEditConflictError";
  }
}

export type PostImageState = {
  id: number;
  featuredImageUrl: string | null;
  featuredImageKey: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type PostUploadDependencies = {
  getPost: (
    id: number
  ) => Promise<PostImageState | null>;

  createPost: (
    input: AdminPostInput,
    image: StoredImage
  ) => Promise<void>;

  updatePost: (
    id: number,
    input: AdminPostInput,
    expected: PostImageState,
    image?: StoredImage
  ) => Promise<void>;

  processImage: (
    input: UploadedImageInput
  ) => Promise<ImageUpload>;

  getStorage: () => ImageStorage;

  reportCleanupFailure: (key: string) => void;
};

export function createPostUploadWorkflow(
  dependencies: PostUploadDependencies
) {
  async function cleanup(
    storage: ImageStorage,
    key: string
  ): Promise<void> {
    try {
      await storage.deleteImage(key);
    } catch {
      dependencies.reportCleanupFailure(key);
    }
  }

  return async function savePost(
    id: number | null,
    input: AdminPostInput,
    file?: UploadedImageInput
  ): Promise<boolean> {
    const existing =
      id === null
        ? null
        : await dependencies.getPost(id);

    if (id !== null && !existing) {
      return false;
    }

    if (!file && !existing?.featuredImageUrl) {
      throw new ImageUploadError(
        "Choose a featured image."
      );
    }

    let storage: ImageStorage | undefined;
    let uploaded: StoredImage | undefined;

    if (file) {
      const processed =
        await dependencies.processImage(file);

      try {
        storage = dependencies.getStorage();

        uploaded =
          await storage.uploadImage(processed);
      } catch {
        throw new ImageUploadError(
          "The image could not be stored. Please try again.",
          503
        );
      }
    }

    try {
      if (id === null) {
        if (!uploaded) {
          throw new ImageUploadError(
            "Choose a featured image."
          );
        }

        await dependencies.createPost(
          input,
          uploaded
        );
      } else {
        await dependencies.updatePost(
          id,
          input,
          existing!,
          uploaded
        );
      }
    } catch (error) {
      if (storage && uploaded) {
        await cleanup(storage, uploaded.key);
      }

      throw error;
    }

    if (
      storage &&
      uploaded &&
      existing?.featuredImageKey
    ) {
      await cleanup(
        storage,
        existing.featuredImageKey
      );
    }

    return true;
  };
}