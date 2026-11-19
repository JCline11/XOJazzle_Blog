import prisma from "../lib/prisma.ts";

import {
  Prisma
} from "../generated/prisma/client.ts";

import {
  PublicationStatus
} from "../generated/prisma/enums.ts";

import type {
  AdminPostInput
} from "../validation/admin-post.validation.ts";

import type {
  StoredImage
} from "./image-storage.ts";

import {
  PostEditConflictError,
  PostSlugConflictError,
  type PostImageState
} from "./post-upload.ts";

import {
  createPostDeletionWorkflow,
  PostDeletionConflictError,
  type DeletedPostImage
} from "./post-deletion.ts";

import {
  reservePostSlug
} from "./post-slugs.ts";

function optionalText(value: string): string | null {
  return value === "" ? null : value;
}

function postData(input: AdminPostInput) {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    body: input.body,
    altText: input.altText,
    imageCaption: optionalText(input.imageCaption),
    category: input.category,
    status: input.status,
    pullQuote: optionalText(input.pullQuote),

    rating:
      input.rating === ""
        ? null
        : Number(input.rating),

    ratingNote: optionalText(input.ratingNote),
    closingNote: optionalText(input.closingNote)
  };
}

function translateWriteError(error: unknown): never {
  if (
    error instanceof
      Prisma.PrismaClientKnownRequestError
  ) {
    if (error.code === "P2002") {
      throw new PostSlugConflictError();
    }

    if (error.code === "P2025") {
      throw new PostEditConflictError();
    }
  }

  throw error;
}

export async function getAdminPostById(id: number) {
  return prisma.post.findUnique({
    where: { id }
  });
}

export async function createAdminPost(
  input: AdminPostInput,
  image: StoredImage
): Promise<void> {
  try {
    await prisma.post.create({
      data: {
        ...postData(input),

        featuredImageUrl: image.url,
        featuredImageKey: image.key,

        publishedAt:
          input.status === PublicationStatus.PUBLISHED
            ? new Date()
            : null,

        slugs: {
          create: {
            slug: input.slug
          }
        }
      }
    });
  } catch (error) {
    translateWriteError(error);
  }
}

export async function updateAdminPost(
  id: number,
  input: AdminPostInput,
  expected: PostImageState,
  image?: StoredImage
): Promise<void> {
  try {
    await prisma.$transaction(async tx => {
      const previous = await tx.post.findUniqueOrThrow({
        where: { id },
        select: {
          slug: true
        }
      });

      await tx.post.update({
        where: {
          id,
          updatedAt: expected.updatedAt,
          featuredImageUrl: expected.featuredImageUrl,
          featuredImageKey: expected.featuredImageKey
        },

        data: {
          ...postData(input),

          ...(image
            ? {
                featuredImageUrl: image.url,
                featuredImageKey: image.key
              }
            : {}),

          publishedAt:
            input.status === PublicationStatus.PUBLISHED
              ? expected.publishedAt ?? new Date()
              : null
        }
      });

      const slugs = new Set([
        previous.slug,
        input.slug
      ]);

      for (const slug of slugs) {
        await reservePostSlug(tx, slug, id);
      }
    });
  } catch (error) {
    translateWriteError(error);
  }
}

export async function deleteAdminPost(
  id: number,
  expectedUpdatedAt: Date
): Promise<DeletedPostImage | null> {
  try {
    return await prisma.post.delete({
      where: {
        id,
        updatedAt: expectedUpdatedAt
      },

      select: {
        featuredImageKey: true
      }
    });
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      const existing = await prisma.post.findUnique({
        where: { id },
        select: { id: true }
      });

      if (!existing) {
        return null;
      }

      throw new PostDeletionConflictError();
    }

    throw error;
  }
}

export async function isImageKeyReferenced(
  key: string
): Promise<boolean> {
  const references = await Promise.all([
    prisma.post.findFirst({
      where: {
        featuredImageKey: key
      },
      select: { id: true }
    }),

    prisma.currentlyLoving.findFirst({
      where: {
        coverImageKey: key
      },
      select: { id: true }
    }),

    prisma.siteProfile.findFirst({
      where: {
        OR: [
          { profileImageKey: key },
          { heroPrimaryImageKey: key },
          { heroSecondaryImageKey: key }
        ]
      },
      select: { id: true }
    })
  ]);

  return references.some(reference => reference !== null);
}