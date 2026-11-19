export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_EDGE = 1920;
export const IMAGE_PROCESSING_TIMEOUT_MS = 30_000;

export const IMAGE_INPUT_ACCEPT = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
].join(",");

const HEIF_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence"
]);

const STANDARD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export class ImageUploadError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ImageUploadError";
    this.status = status;
  }
}

export type UploadedImageInput = {
  buffer: Uint8Array;
  mimetype: string;
};

export type ImageWorkerResult =
  | {
      ok: true;
      bytes: Uint8Array;
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

export function normalizeMime(value: string): string {
  return value.trim().toLowerCase();
}

export function isHeifMime(value: string): boolean {
  return HEIF_MIME_TYPES.has(normalizeMime(value));
}

export function isAllowedReportedMime(
  value: string
): boolean {
  const mime = normalizeMime(value);

  return (
    mime === "" ||
    mime === "application/octet-stream" ||
    STANDARD_MIME_TYPES.has(mime) ||
    HEIF_MIME_TYPES.has(mime)
  );
}

export function validateDetectedMime(
  reportedValue: string,
  detectedValue: string
): void {
  const reported = normalizeMime(reportedValue);
  const detected = normalizeMime(detectedValue);

  if (
    !STANDARD_MIME_TYPES.has(detected) &&
    !HEIF_MIME_TYPES.has(detected)
  ) {
    throw new ImageUploadError(
      "Choose a JPEG, PNG, WebP, HEIC, or HEIF image."
    );
  }

  if (!isAllowedReportedMime(reported)) {
    throw new ImageUploadError(
      "The reported file type is unsupported."
    );
  }

  if (
    reported === "" ||
    reported === "application/octet-stream"
  ) {
    return;
  }

  if (
    reported !== detected &&
    !(isHeifMime(reported) && isHeifMime(detected))
  ) {
    throw new ImageUploadError(
      "The file contents do not match its reported type."
    );
  }
}

export function validateImageDimensions(
  width: number,
  height: number
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_PIXELS / height
  ) {
    throw new ImageUploadError(
      "Use an image with no more than 25 million pixels."
    );
  }
}