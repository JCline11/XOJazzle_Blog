import prisma from "../lib/prisma.ts";
import {
  PostCategory,
  PublicationStatus,
  CurrentlyLovingKind
} from "../generated/prisma/enums.ts";

import { mapPostToViewModel } from "../mappers/post.mapper.ts";
import { mapCurrentlyLovingToViewModel } from "../mappers/currently-loving.mapper.ts";

export async function getHomePageData() {
  const [profile, databasePosts, currentlyLoving] = await Promise.all([
    prisma.siteProfile.findFirst(),

    prisma.post.findMany({
      where: {
        status: PublicationStatus.PUBLISHED
      },
      orderBy: {
        publishedAt: "desc"
      },
      take: 6
    }),
    getCurrentlyLovingData()
  ]);

  if (!profile) {
	throw new Error("Site profile is not configured.");
  }

  const latestPosts = databasePosts.map(mapPostToViewModel);

  return {
    profile,
    latestPosts,
	currentlyLoving
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

export async function getSiteProfile() {
  const profile = await prisma.siteProfile.findFirst();

  if (!profile) {
    throw new Error("Site profile is not configured.");
  }

  return profile;
}

export async function getCurrentlyLovingData() {
  const items = await prisma.currentlyLoving.findMany();

  const readingItem = items.find(
    item => item.kind === CurrentlyLovingKind.READING
  );

  const watchingItem = items.find(
    item => item.kind === CurrentlyLovingKind.WATCHING
  );

  if (!readingItem || !watchingItem) {
    throw new Error(
      "Currently Loving content is not fully configured."
    );
  }

  return {
    reading: mapCurrentlyLovingToViewModel(readingItem),
    watching: mapCurrentlyLovingToViewModel(watchingItem)
  };
}