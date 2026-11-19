import prisma from "../lib/prisma.ts";

import {
  PublicationStatus
} from "../generated/prisma/enums.ts";

export async function getSitemapPosts() {
  return prisma.post.findMany({
    where: {
      status: PublicationStatus.PUBLISHED
    },

    select: {
      slug: true,
      updatedAt: true
    },

    orderBy: {
      id: "asc"
    }
  });
}