import {
  ImageUploadError,
  type UploadedImageInput
} from "../config/image-upload.ts";

import type {
  AdminHomepageInput
} from "../validation/admin-homepage.validation.ts";

import type {
  ImageStorage,
  ImageUpload,
  StoredImage
} from "./image-storage.ts";

export const HOMEPAGE_IMAGE_FIELDS = [
  "profileImage",
  "heroPrimaryImage",
  "heroSecondaryImage",
  "readingCoverImage",
  "watchingCoverImage"
] as const;

export type HomepageImageField =
  typeof HOMEPAGE_IMAGE_FIELDS[number];

export type HomepageImageFiles = Partial<
  Record<HomepageImageField, UploadedImageInput>
>;

export type HomepageReplacements = Partial<
  Record<HomepageImageField, StoredImage>
>;

export type HomepageImages = Record<
  HomepageImageField,
  {
    url: string | null;
    key: string | null;
  }
>;

type HomepageRow =
  | "profile"
  | "reading"
  | "watching"
  | "books"
  | "movies"
  | "tv";

export type HomepageSnapshot = {
  values: AdminHomepageInput;
  images: HomepageImages;

  versions: Record<
    HomepageRow,
    {
      id: number;
      updatedAt: Date;
    }
  >;
};

export class HomepageEditConflictError extends Error {
  constructor() {
    super(
      "The homepage changed while you were saving. Review the current content and try again."
    );

    this.name = "HomepageEditConflictError";
  }
}

export type HomepageUploadDependencies = {
  processImage: (
    image: UploadedImageInput
  ) => Promise<ImageUpload>;

  getStorage: () => ImageStorage;

  save: (
    input: AdminHomepageInput,
    expected: HomepageSnapshot,
    replacements: HomepageReplacements
  ) => Promise<void>;

  reportCleanupFailure: (key: string) => void;
};

export function createHomepageUploadWorkflow(
  dependencies: HomepageUploadDependencies
) {
  async function cleanup(
    storage: ImageStorage,
    keys: Iterable<string>
  ): Promise<void> {
    for (const key of new Set(keys)) {
      try {
        await storage.deleteImage(key);
      } catch {
        dependencies.reportCleanupFailure(key);
      }
    }
  }

  return async function saveHomepage(
    input: AdminHomepageInput,
    files: HomepageImageFiles,
    expected: HomepageSnapshot
  ): Promise<void> {
    const prepared: Partial<
      Record<HomepageImageField, ImageUpload>
    > = {};

    for (const field of HOMEPAGE_IMAGE_FIELDS) {
      const file = files[field];

      if (file) {
        prepared[field] =
          await dependencies.processImage(file);
      }
    }

    const replacements: HomepageReplacements = {};
    const uploadedKeys: string[] = [];

    let storage: ImageStorage | undefined;

    try {
      for (const field of HOMEPAGE_IMAGE_FIELDS) {
        const image = prepared[field];

        if (!image) {
          continue;
        }

        let uploaded: StoredImage;

        try {
          storage ??= dependencies.getStorage();

          uploaded =
            await storage.uploadImage(image);
        } catch {
          throw new ImageUploadError(
            "An image could not be stored. Please try again.",
            503
          );
        }

        replacements[field] = uploaded;
        uploadedKeys.push(uploaded.key);
      }

      await dependencies.save(
        input,
        expected,
        replacements
      );
    } catch (error) {
      if (storage) {
        await cleanup(storage, uploadedKeys);
      }

      throw error;
    }

    if (!storage) {
      return;
    }

    const retainedKeys = new Set(
      HOMEPAGE_IMAGE_FIELDS.map(field =>
        replacements[field]?.key ??
        expected.images[field].key
      ).filter(
        (key): key is string => key !== null
      )
    );

    const replacedKeys: string[] = [];

    for (const field of HOMEPAGE_IMAGE_FIELDS) {
      const previousKey = expected.images[field].key;

      if (
        replacements[field] &&
        previousKey &&
        !retainedKeys.has(previousKey)
      ) {
        replacedKeys.push(previousKey);
      }
    }

    await cleanup(storage, replacedKeys);
  };
}