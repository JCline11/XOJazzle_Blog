import type {
  NextFunction,
  Request,
  Response
} from "express";

import {
  IMAGE_INPUT_ACCEPT,
  ImageUploadError
} from "../config/image-upload.ts";

import {
  adminHomepageSchema,
  toAdminHomepageFormValues,
  type AdminHomepageInput
} from "../validation/admin-homepage.validation.ts";

import {
  getAdminHomepageSnapshot,
  updateAdminHomepageContent
} from "../services/admin-homepage.service.ts";

import {
  createHomepageUploadWorkflow,
  HOMEPAGE_IMAGE_FIELDS,
  HomepageEditConflictError,
  homepageVersion,
  type HomepageImageFiles,
  type HomepageImages,
  type HomepageSnapshot
} from "../services/homepage-upload.ts";

import {
  processUploadedImage
} from "../services/image-processing.ts";

import {
  createConfiguredR2ImageStorage
} from "../services/r2-image-storage.ts";

import type {
  ImageStorage
} from "../services/image-storage.ts";

let storage: ImageStorage | undefined;

const saveHomepage =
  createHomepageUploadWorkflow({
    processImage: processUploadedImage,
    save: updateAdminHomepageContent,

    getStorage() {
      storage ??= createConfiguredR2ImageStorage();
      return storage;
    },

    reportCleanupFailure(key) {
      console.error(
        "R2 homepage image cleanup failed; retry required.",
        { key }
      );
    }
  });

function submittedImages(
  req: Request
): HomepageImageFiles {
  const result: HomepageImageFiles = {};

  if (!req.files || Array.isArray(req.files)) {
    return result;
  }

  for (const field of HOMEPAGE_IMAGE_FIELDS) {
    const file = req.files[field]?.[0];

    if (file) {
      result[field] = {
        buffer: file.buffer,
        mimetype: file.mimetype
      };
    }
  }

  return result;
}

function renderHomepageForm(
  res: Response,
  homepage: AdminHomepageInput,
  currentImages: HomepageImages,
  version: string,
  error: string | null,
  status = 200
) {
  return res.status(status).render(
    "admin/homepage-form",
    {
      homepage,
      currentImages,
      homepageVersion: version,
      imageAccept: IMAGE_INPUT_ACCEPT,
      error
    }
  );
}

export async function showHomepageForm(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const snapshot =
      await getAdminHomepageSnapshot();

    return renderHomepageForm(
      res,
      snapshot.values,
      snapshot.images,
      homepageVersion(snapshot),
      null
    );
  } catch (error) {
    return next(error);
  }
}

export async function updateHomepage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const formValues =
    toAdminHomepageFormValues(req.body);

  let snapshot: HomepageSnapshot | undefined;
  const version = typeof req.body?.homepageVersion === "string"
    ? req.body.homepageVersion : "";

  try {
    snapshot = await getAdminHomepageSnapshot();

    if (version !== homepageVersion(snapshot)) {
      throw new HomepageEditConflictError();
    }

    const result =
      adminHomepageSchema.safeParse(req.body);

    if (!result.success) {
      return renderHomepageForm(
        res,
        formValues,
        snapshot.images,
        version,
        result.error.issues[0]?.message ??
          "Review the form and try again.",
        400
      );
    }

    await saveHomepage(
      result.data,
      submittedImages(req),
      snapshot
    );

    return res.redirect(
      "/admin?notice=homepage-updated"
    );
  } catch (error) {
    if (error instanceof HomepageEditConflictError) {
      const latest =
        await getAdminHomepageSnapshot();

      return renderHomepageForm(
        res,
        formValues,
        latest.images,
        version,
        error.message,
        409
      );
    }

    if (
      error instanceof ImageUploadError &&
      snapshot
    ) {
      return renderHomepageForm(
        res,
        formValues,
        snapshot.images,
        version,
        error.message,
        error.status
      );
    }

    return next(error);
  }
}
