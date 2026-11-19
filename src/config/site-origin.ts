type Environment =
  | "development"
  | "test"
  | "production";

export function resolveSiteOrigin(
  value: string | undefined,
  environment: Environment,
  port = 3000
): string {
  const supplied = value?.trim();

  if (!supplied) {
    if (environment === "production") {
      throw new Error(
        "SITE_ORIGIN is required in production."
      );
    }

    return `http://localhost:${port}`;
  }

  // Accept an origin with an optional trailing slash.
  // Reject credentials, paths, query strings, and fragments.
  if (
    !/^https?:\/\/[^/?#@\\\s]+\/?$/i.test(supplied)
  ) {
    throw new Error(
      "SITE_ORIGIN must be an HTTP or HTTPS origin without credentials, a path, query, or fragment."
    );
  }

  let url: URL;

  try {
    url = new URL(supplied);
  } catch {
    throw new Error("SITE_ORIGIN is invalid.");
  }

  if (
    environment === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      "SITE_ORIGIN must use HTTPS in production."
    );
  }

  return url.origin;
}