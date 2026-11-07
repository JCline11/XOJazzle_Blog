import type {
  ImageStorage
} from "./image-storage.ts";

export class PostDeletionConflictError extends Error {
  constructor() {
    super(
      "This post changed after you opened the confirmation page. Review it before deleting."
    );

    this.name = "PostDeletionConflictError";
  }
}

export type DeletedPostImage = {
  featuredImageKey: string | null;
};

export type PostDeletionDependencies = {
  deletePost: (
    id: number,
    expectedUpdatedAt: Date
  ) => Promise<DeletedPostImage | null>;

  isImageReferenced: (
    key: string
  ) => Promise<boolean>;

  getStorage: () => ImageStorage;

  reportCleanupFailure: (key: string) => void;
};

export function createPostDeletionWorkflow(
  dependencies: PostDeletionDependencies
) {
  return async function deletePostWithImage(
    id: number,
    expectedUpdatedAt: Date
  ): Promise<boolean> {
    const deleted = await dependencies.deletePost(
      id,
      expectedUpdatedAt
    );

    if (!deleted) {
      return false;
    }

    const key = deleted.featuredImageKey;

    if (!key) {
      return true;
    }

    try {
      const referenced =
        await dependencies.isImageReferenced(key);

      if (!referenced) {
        await dependencies
          .getStorage()
          .deleteImage(key);
      }
    } catch {
      dependencies.reportCleanupFailure(key);
    }

    return true;
  };
}