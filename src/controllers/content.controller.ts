import type { Request, Response, NextFunction } from "express";
import {
  getHomePageData,
  getPublishedPostBySlug,
  getSiteProfile,
  getPublishedPostsByCategory
} from "../services/content.service.ts";

import { 
	mapCategorySlug,
  	mapCategoryToTitle
} from "../mappers/category.mapper.ts";

export async function showHomePage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const homePageData = await getHomePageData();

    res.render("home", homePageData);
  } catch (error) {
    next(error);
  }
}

export async function showPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { slug } = req.params;

	if (typeof slug !== "string" || slug.trim() === "") {
		return res.status(404).render("404");
	}

	const [post, profile] = await Promise.all([
		getPublishedPostBySlug(slug),
		getSiteProfile()
	]);

    if (!post) {
      return res.status(404).render("404");
    }

    return res.render("post", { post, profile });
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

    const categoryValue = mapCategorySlug(categoryParam);

    if (!categoryValue) {
      return res.status(404).render("404");
    }

    const [posts, profile] = await Promise.all([
      getPublishedPostsByCategory(categoryValue),
      getSiteProfile()
    ]);

    return res.render("category", {
      profile,
      posts,
      category: {
        slug: categoryParam.trim().toLowerCase(),
        title: mapCategoryToTitle(categoryValue)
      }
    });
  } catch (error) {
    return next(error);
  }
}