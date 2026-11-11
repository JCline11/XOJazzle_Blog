import type {
  Prisma
} from "../generated/prisma/client.ts";

import {
  PostSlugConflictError
} from "./post-upload.ts";

export async function reservePostSlug(
  tx: Prisma.TransactionClient,
  slug: string,
  postId: number
): Promise<void> {
  const existing = await tx.postSlug.findUnique({
    where: { slug }
  });

  if (existing) {
    if (existing.postId !== postId) {
      throw new PostSlugConflictError();
    }

    return;
  }

  await tx.postSlug.create({
    data: {
      slug,
      postId
    }
  });
}