import { z } from "zod";

import {
  PostCategory,
  PublicationStatus
} from "../generated/prisma/enums.ts";

function isImageLocation(value: string): boolean {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" ||
      url.protocol === "https:";
  } catch {
    return false;
  }
}

export const adminPostSchema = z.object({
  title: z.string().trim().min(1).max(200),

  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens."
    ),

  excerpt: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(50_000),

  featuredImageUrl: z
    .string()
    .trim()
    .min(1)
    .max(2_048)
    .refine(isImageLocation, {
      message: "Enter an HTTP image URL or a local /images path."
    }),

  altText: z.string().trim().min(1).max(300),
  imageCaption: z.string().trim().max(300),
  pullQuote: z.string().trim().max(1_000),
  ratingNote: z.string().trim().max(1_000),
  closingNote: z.string().trim().max(2_000),

  category: z.enum(PostCategory),
  status: z.enum(PublicationStatus),

  rating: z.union([
    z.literal(""),
    z.enum(["1", "2", "3", "4", "5"])
  ])
});

export type AdminPostInput =
  z.infer<typeof adminPostSchema>;

export type AdminPostFormValues = {
  [Key in keyof AdminPostInput]: string;
};

export const emptyAdminPostForm:
AdminPostFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  featuredImageUrl: "",
  altText: "",
  imageCaption: "",
  pullQuote: "",
  rating: "",
  ratingNote: "",
  closingNote: "",
  category: "BOOKS",
  status: "DRAFT"
};

function stringValue(
  source: Record<string, unknown>,
  key: string
): string {
  return typeof source[key] === "string"
    ? source[key]
    : "";
}

export function toAdminPostFormValues(
  value: unknown
): AdminPostFormValues {
  const source =
    typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};

  return {
    title: stringValue(source, "title"),
    slug: stringValue(source, "slug"),
    excerpt: stringValue(source, "excerpt"),
    body: stringValue(source, "body"),
    featuredImageUrl:
      stringValue(source, "featuredImageUrl"),
    altText: stringValue(source, "altText"),
    imageCaption: stringValue(source, "imageCaption"),
    pullQuote: stringValue(source, "pullQuote"),
    rating:
      source.rating === null
        ? ""
        : String(source.rating ?? ""),
    ratingNote: stringValue(source, "ratingNote"),
    closingNote: stringValue(source, "closingNote"),
    category: stringValue(source, "category") || "BOOKS",
    status: stringValue(source, "status") || "DRAFT"
  };
}