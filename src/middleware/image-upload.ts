import multer from "multer";

import type {
  ErrorRequestHandler,
  RequestHandler
} from "express";

import {
  ImageUploadError,
  isAllowedReportedMime,
  MAX_IMAGE_BYTES
} from "../config/image-upload.ts";

let activeUploadRequests = 0;

function createParser(
  fields: Array<{ name: string; maxCount: number }>
): RequestHandler {
  const maximumFiles = fields.length;

  const parse = multer({
    storage: multer.memoryStorage(),

    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: maximumFiles,
      fields: 40,
      parts: 40 + maximumFiles,
      fieldNameSize: 100,
      fieldSize: 200_000,
      fieldNestingDepth: 0,
      fieldArrayIndexLimit: 0,
      headerPairs: 100
    },

    fileFilter(_req, file, callback) {
      if (!isAllowedReportedMime(file.mimetype)) {
        callback(
          new ImageUploadError(
            "Choose a JPEG, PNG, WebP, HEIC, or HEIF image."
          )
        );
        return;
      }

      callback(null, true);
    }
  }).fields(fields);

  return (req, res, next) => {
    if (!req.is("multipart/form-data")) {
      next(
        new ImageUploadError(
          "Submit images using the upload form.",
          415
        )
      );
      return;
    }

    if (activeUploadRequests >= 2) {
      next(
        new ImageUploadError(
          "Uploads are busy. Please try again shortly.",
          503
        )
      );
      return;
    }

    activeUploadRequests += 1;
    let released = false;

    const release = () => {
      if (released) {
        return;
      }

      released = true;
      activeUploadRequests -= 1;
      res.off("finish", release);
      res.off("close", release);
    };

    res.once("finish", release);
    res.once("close", release);

    parse(req, res, (error: unknown) => {
      if (error) {
        release();

        if (error instanceof ImageUploadError) {
          next(error);
          return;
        }

        if (
          error instanceof multer.MulterError &&
          error.code === "LIMIT_FILE_SIZE"
        ) {
          next(
            new ImageUploadError(
              "Each image must be 5 MiB or smaller.",
              413
            )
          );
          return;
        }

        next(
          new ImageUploadError(
            "The upload is invalid or exceeds the form limits."
          )
        );
        return;
      }

      const values = Object.values(req.body ?? {});

      const textBytes = values.reduce(
        (total: number, value: unknown) => {
          return total + (
            typeof value === "string"
              ? Buffer.byteLength(value, "utf8")
              : 0
          );
        },
        0
      );

      if (
        values.some(value => typeof value !== "string") ||
        textBytes > 256_000
      ) {
        release();

        next(
          new ImageUploadError(
            "The form contains invalid or oversized text fields."
          )
        );
        return;
      }

      next();
    });
  };
}

export const parsePostImages = createParser([
  { name: "featuredImage", maxCount: 1 }
]);

export const parseHomepageImages = createParser([
  { name: "profileImage", maxCount: 1 },
  { name: "heroPrimaryImage", maxCount: 1 },
  { name: "heroSecondaryImage", maxCount: 1 },
  { name: "readingCoverImage", maxCount: 1 },
  { name: "watchingCoverImage", maxCount: 1 }
]);

export const imageUploadErrorHandler:
ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next
) => {
  if (!(error instanceof ImageUploadError)) {
    next(error);
    return;
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  res
    .status(error.status)
    .type("text/plain")
    .send(error.message);
};