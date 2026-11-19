import multer from "multer";

import type {
  ErrorRequestHandler,
  RequestHandler,
  Response
} from "express";

import {
  ImageUploadError,
  isAllowedReportedMime,
  MAX_IMAGE_BYTES
} from "../config/image-upload.ts";

import { lifecycle } from "../lib/lifecycle.ts";

type UploadState = {
  phase: "parsing" | "ready" | "running";
  release: () => void;
};

const MAX_ACTIVE_UPLOAD_REQUESTS = 2;

const uploadStates = new WeakMap<Response, UploadState>();

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
    if (
      req.aborted ||
      res.destroyed ||
      res.writableEnded
    ) {
      return;
    }

    if (!req.is("multipart/form-data")) {
      next(
        new ImageUploadError(
          "Submit images using the upload form.",
          415
        )
      );
      return;
    }

    if (activeUploadRequests >= MAX_ACTIVE_UPLOAD_REQUESTS) {
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

    const state: UploadState = {
      phase: "parsing",

      release() {
        if (released) {
          return;
        }

        released = true;
        activeUploadRequests -= 1;

        uploadStates.delete(res);

        res.off("finish", onResponseComplete);
        res.off("close", onResponseComplete);
      }
    };

    const onResponseComplete = () => {
      if (state.phase === "ready") {
        state.release();
      }
    };

    uploadStates.set(res, state);

    res.once("finish", onResponseComplete);
    res.once("close", onResponseComplete);

    const onParsed = (error?: unknown) => {
      state.phase = "ready";

      if (
        req.aborted ||
        res.destroyed ||
        res.writableEnded
      ) {
        state.release();
        return;
      }

      if (error) {
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
        next(
          new ImageUploadError(
            "The form contains invalid or oversized text fields."
          )
        );
        return;
      }

      next();
    };

    try {
      parse(req, res, onParsed);
    } catch (error) {
      state.phase = "ready";
      next(error);
    }
  };
}

export function runUploadController(
  handler: RequestHandler
): RequestHandler {
  return lifecycle.wrap(async (req, res, next) => {
    if (
      req.aborted ||
      res.destroyed ||
      res.writableEnded
    ) {
      uploadStates.get(res)?.release();
      return;
    }

    const state = uploadStates.get(res);

    if (!state) {
      next(
        new Error(
          "Upload controller reached without an upload slot."
        )
      );
      return;
    }

    state.phase = "running";

    try {
      await handler(req, res, next);
    } finally {
      state.phase = "ready";

      if (res.writableFinished || res.destroyed) {
        state.release();
      }
    }
  });
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