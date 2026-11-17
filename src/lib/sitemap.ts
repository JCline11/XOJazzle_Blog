import {
  publicUrl
} from "../services/page-metadata.ts";

export type SitemapPost = {
  slug: string;
  updatedAt: Date;
};

const CATEGORY_PATHS = [
  "/categories/books",
  "/categories/movies",
  "/categories/anime",
  "/categories/tv"
];

export function escapeXml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  };

  return value.replace(
    /[&<>"']/g,
    character => entities[character]
  );
}

export function renderSitemap(
  siteOrigin: string,
  posts: SitemapPost[]
): string {
  const entries = [
    ...["/", ...CATEGORY_PATHS].map(path => {
      const location = escapeXml(
        publicUrl(siteOrigin, path)
      );

      return `  <url><loc>${location}</loc></url>`;
    }),

    ...posts.map(post => {
      const location = escapeXml(
        publicUrl(
          siteOrigin,
          `/posts/${encodeURIComponent(post.slug)}`
        )
      );

      const modified = post.updatedAt.toISOString();

      return (
        `  <url><loc>${location}</loc>` +
        `<lastmod>${modified}</lastmod></url>`
      );
    })
  ];

  if (entries.length > 50_000) {
    throw new Error(
      "The sitemap requires splitting into a sitemap index."
    );
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    ""
  ].join("\n");

  if (
    Buffer.byteLength(xml, "utf8") >
    50 * 1024 * 1024
  ) {
    throw new Error(
      "The sitemap exceeds the single-file size limit."
    );
  }

  return xml;
}