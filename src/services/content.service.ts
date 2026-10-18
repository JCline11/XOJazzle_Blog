import prisma from "../lib/prisma.ts";
import {
  PostCategory,
  PublicationStatus
} from "../generated/prisma/enums.ts";

import { mapPostToViewModel } from "../mappers/post.mapper.ts";

export async function getHomePageData() {
  const [profile, databasePosts] = await Promise.all([
    prisma.siteProfile.findFirst(),

    prisma.post.findMany({
      where: {
        status: PublicationStatus.PUBLISHED
      },
      orderBy: {
        publishedAt: "desc"
      },
      take: 6
    })
  ]);

  if (!profile) {
	throw new Error("Site profile is not configured.");
  }

  const latestPosts = databasePosts.map(mapPostToViewModel);

  return {
    profile,
    latestPosts
  };
}

export async function getPublishedPostBySlug(slug: string) {
  const databasePost = await prisma.post.findFirst({
    where: {
      slug,
      status: PublicationStatus.PUBLISHED
    }
  });

  if (!databasePost) {
    return null;
  }

  return mapPostToViewModel(databasePost);
}

export async function getPublishedPostsByCategory(
  category: PostCategory
) {
  const databasePosts = await prisma.post.findMany({
    where: {
      category,
      status: PublicationStatus.PUBLISHED
    },
    orderBy: {
      publishedAt: "desc"
    }
  });

  return databasePosts.map(mapPostToViewModel);
}