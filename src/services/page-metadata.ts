export type PageMetadata = {
  title: string;
  description: string;
  siteName: string;
  canonicalUrl: string;
  type: "website" | "article";

  image: {
    url: string;
    alt: string;
  };
};

type MetadataInput = {
  title: string;
  description: string;
  siteName: string;
  path: string;
  type?: "website" | "article";
  imageUrl?: string | null;
  imageAlt?: string | null;
};

const DEFAULT_DESCRIPTION =
  "A cozy scrapbook of books, movies, anime, TV shows, and everyday thoughts.";

const DEFAULT_IMAGE =
  "/images/profile/xojazzle_profile.jpg";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(
  value: string,
  maximum: number
): string {
  const characters = Array.from(value);

  if (characters.length <= maximum) {
    return value;
  }

  return (
    characters
      .slice(0, maximum - 1)
      .join("")
      .trimEnd() + "…"
  );
}

export function publicUrl(
  siteOrigin: string,
  path: string
): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\?#\u0000-\u0020]/.test(path)
  ) {
    throw new Error(
      "Public URLs require a local path without a query or fragment."
    );
  }

  const url = new URL(path, siteOrigin);

  if (url.origin !== siteOrigin) {
    throw new Error(
      "Public URLs must use the configured site origin."
    );
  }

  return url.href;
}

function resolveImageUrl(
  siteOrigin: string,
  value: string | null | undefined
): string | null {
  const candidate = value?.trim();

  if (
    !candidate ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(candidate)
  ) {
    return null;
  }

  try {
    const url = candidate.startsWith("/")
      ? new URL(candidate, siteOrigin)
      : new URL(candidate);

    if (url.username || url.password) {
      return null;
    }

    const secureImage = url.protocol === "https:";

    const localDevelopmentImage =
      url.protocol === "http:" &&
      url.origin === siteOrigin &&
      siteOrigin.startsWith("http://");

    if (!secureImage && !localDevelopmentImage) {
      return null;
    }

    url.hash = "";

    return url.href;
  } catch {
    return null;
  }
}

export function buildPageMetadata(
  siteOrigin: string,
  input: MetadataInput
): PageMetadata {
  const siteName =
    cleanText(input.siteName) || "XOJazzle";

  const title =
    cleanText(input.title) || "Little Things";

  const description = shorten(
    cleanText(input.description) ||
      DEFAULT_DESCRIPTION,
    160
  );

  const selectedImage = resolveImageUrl(
    siteOrigin,
    input.imageUrl
  );

  const image = selectedImage
    ? {
        url: selectedImage,
        alt: shorten(
          cleanText(input.imageAlt ?? "") ||
            `${siteName} image`,
          300
        )
      }
    : {
        url: publicUrl(siteOrigin, DEFAULT_IMAGE),
        alt: `${siteName} profile image`
      };

  return {
    title: `${title} | ${siteName}`,
    description,
    siteName,

    canonicalUrl: publicUrl(
      siteOrigin,
      input.path
    ),

    type: input.type ?? "website",
    image
  };
}