import type {
  Request,
  Response,
  NextFunction
} from "express";

import { env } from "../config/env.ts";

import {
  getHomePageData,
  getPublishedPostBySlug,
  getSiteProfile,
  getPublishedPostsByCategory
} from "../services/content.service.ts";

import {
  buildPageMetadata
} from "../services/page-metadata.ts";

import {
  mapCategorySlug,
  mapCategoryToTitle
} from "../mappers/category.mapper.ts";

export async function showHomePage(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const homePageData = await getHomePageData();
    const { profile } = homePageData;

    return res.render("home", {
      ...homePageData,

      pageMetadata: buildPageMetadata(
        env.SITE_ORIGIN,
        {
          title: "Little Things",
          description: profile.heroText,
          siteName: profile.siteName,
          path: "/",
          imageUrl: profile.profileImageUrl,
          imageAlt: `${profile.siteName} profile image`
        }
      )
    });
  } catch (error) {
    return next(error);
  }
}

export async function showPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { slug } = req.params;

    if (
      typeof slug !== "string" ||
      slug.trim() === ""
    ) {
      return res.status(404).render("404");
    }

    const post = await getPublishedPostBySlug(slug);

    if (!post) {
      return res.status(404).render("404");
    }

    if (post.slug !== slug) {
      res.set("Cache-Control", "no-store");

      return res.redirect(
        301,
        `/posts/${encodeURIComponent(post.slug)}`
      );
    }

    const profile = await getSiteProfile();

    return res.render("post", {
      post,
      profile,

      pageMetadata: buildPageMetadata(
        env.SITE_ORIGIN,
        {
          title: post.title,
          description: post.excerpt,
          siteName: profile.siteName,
          path:
            `/posts/${encodeURIComponent(post.slug)}`,
          type: "article",
          imageUrl: post.featuredImageUrl,
          imageAlt: post.altText
        }
      )
    });
  } catch (error) {
    return next(error);
  }
}

export async function showCategoryPage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const categoryParam = req.params.category;

    if (typeof categoryParam !== "string") {
      return res.status(404).render("404");
    }

    const categoryValue =
      mapCategorySlug(categoryParam);

    if (!categoryValue) {
      return res.status(404).render("404");
    }

    const [posts, profile] = await Promise.all([
      getPublishedPostsByCategory(categoryValue),
      getSiteProfile()
    ]);

    const categorySlug =
      categoryParam.trim().toLowerCase();

    const categoryTitle =
      mapCategoryToTitle(categoryValue);

    return res.render("category", {
      profile,
      posts,

      category: {
        slug: categorySlug,
        title: categoryTitle
      },

      pageMetadata: buildPageMetadata(
        env.SITE_ORIGIN,
        {
          title: `${categoryTitle} notes`,

          description:
            `${categoryTitle} reviews, recommendations, and notes from ${profile.siteName}'s scrapbook.`,

          siteName: profile.siteName,
          path: `/categories/${categorySlug}`,
          imageUrl: profile.profileImageUrl,
          imageAlt: `${profile.siteName} profile image`
        }
      )
    });
  } catch (error) {
    return next(error);
  }
}