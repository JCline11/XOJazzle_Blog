import prisma from "../lib/prisma.ts";

import { PublicationStatus }
  from "../generated/prisma/enums.ts";

import type { AdminPostInput }
  from "../validation/admin-post.validation.ts";

export class PostSlugConflictError extends Error {
  constructor() {
    super("A post already uses that slug.");
    this.name = "PostSlugConflictError";
  }
}

function optionalText(value: string): string | null {
  return value === "" ? null : value;
}

function postData(input: AdminPostInput) {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    body: input.body,
    featuredImageUrl: input.featuredImageUrl,
    altText: input.altText,
    imageCaption: optionalText(input.imageCaption),
    category: input.category,
    status: input.status,
    pullQuote: optionalText(input.pullQuote),
    rating: input.rating === "" ? null : Number(input.rating),
    ratingNote: optionalText(input.ratingNote),
    closingNote: optionalText(input.closingNote)
  };
}

export async function getAdminPostById(id: number) {
  return prisma.post.findUnique({
    where: {
      id
    }
  });
}

export async function createAdminPost(
  input: AdminPostInput
) {
  const slugOwner = await prisma.post.findUnique({
    where: {
      slug: input.slug
    },
    select: {
      id: true
    }
  });

  if (slugOwner) {
    throw new PostSlugConflictError();
  }

  return prisma.post.create({
    data: {
      ...postData(input),

      publishedAt:
        input.status === PublicationStatus.PUBLISHED
          ? new Date()
          : null
    }
  });
}

export async function updateAdminPost(
  id: number,
  input: AdminPostInput
) {
  const existingPost = await prisma.post.findUnique({
    where: {
      id
    }
  });

  if (!existingPost) {
    return null;
  }

  const slugOwner = await prisma.post.findUnique({
    where: {
      slug: input.slug
    },
    select: {
      id: true
    }
  });

  if (slugOwner && slugOwner.id !== id) {
    throw new PostSlugConflictError();
  }

  return prisma.post.update({
    where: {
      id
    },
    data: {
      ...postData(input),

      publishedAt:
        input.status === PublicationStatus.PUBLISHED
          ? existingPost.publishedAt ?? new Date()
          : null
    }
  });
}

export async function deleteAdminPost(
  id: number
): Promise<boolean> {
  const result = await prisma.post.deleteMany({
    where: {
      id
    }
  });

  return result.count === 1;
}