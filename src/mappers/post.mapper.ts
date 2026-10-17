import type { Post } from "../generated/prisma/client.ts";

export type PostViewModel = {
  id: number;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  body: string;
  featuredImageUrl: string | null;
  altText: string;
  imageCaption: string | null;
  categoryLabel: string;
  publishedDate: string;
  publishedDateTime: string;
  readTime: string;
  pullQuote: string | null;
  rating: number | null;
  ratingNote: string | null;
  closingNote: string | null;
};

const categoryLabels: Record<Post["category"], string> = {
  BOOKS: "books",
  MOVIES: "movies",
  ANIME: "anime",
  TV: "tv"
};

function formatPublishedDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

function calculateReadTime(body: string): string {
  const words = body
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.max(1, Math.ceil(words / 200));

  return `${minutes} min`;
}

export function mapPostToViewModel(
  post: Post
): PostViewModel {
  const publicationDate = post.publishedAt ?? post.createdAt;

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    url: `/posts/${post.slug}`,
    excerpt: post.excerpt,
    body: post.body,

    featuredImageUrl: post.featuredImageUrl,
    altText: post.altText ?? `Book cover for ${post.title}`,
    imageCaption: post.imageCaption,

    categoryLabel: categoryLabels[post.category],
    publishedDate: formatPublishedDate(publicationDate),
    publishedDateTime: publicationDate.toISOString(),
    readTime: calculateReadTime(post.body),

    pullQuote: post.pullQuote,
    rating: post.rating,
    ratingNote: post.ratingNote,
    closingNote: post.closingNote
  };
}