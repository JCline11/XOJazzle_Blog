import { PostCategory } from "../generated/prisma/enums.ts";

const categoryBySlug = {
  books: PostCategory.BOOKS,
  movies: PostCategory.MOVIES,
  anime: PostCategory.ANIME,
  tv: PostCategory.TV
} as const;

type CategorySlug = keyof typeof categoryBySlug;

export function mapCategorySlug(
  value: string
): PostCategory | null {
  const normalizedValue = value.trim().toLowerCase();

  return (
    categoryBySlug[normalizedValue as CategorySlug] ??
    null
  );
}

const categoryTitles: Record<PostCategory, string> = {
  [PostCategory.BOOKS]: "Books",
  [PostCategory.MOVIES]: "Movies",
  [PostCategory.ANIME]: "Anime",
  [PostCategory.TV]: "TV Shows"
};

export function mapCategoryToTitle(
  category: PostCategory
): string {
  return categoryTitles[category];
}