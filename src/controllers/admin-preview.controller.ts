import type {
  Request,
  Response,
  NextFunction
} from "express";

import {
  getAdminPostById
} from "../services/admin-post.service.ts";

import {
  getSiteProfile
} from "../services/content.service.ts";

import {
  mapPostToViewModel
} from "../mappers/post.mapper.ts";

export async function showPostPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.set("Cache-Control", "private, no-store");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.vary("Cookie");

  const rawId = req.params.id;

  if (
    typeof rawId !== "string" ||
    !/^[1-9]\d*$/.test(rawId)
  ) {
    return res.status(404).render("404");
  }

  const id = Number(rawId);

  // PostgreSQL's Prisma Int fields use signed 32-bit integers.
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) {
    return res.status(404).render("404");
  }

  try {
    const post = await getAdminPostById(id);

    if (!post) {
      return res.status(404).render("404");
    }

    const profile = await getSiteProfile();

    return res.render("post", {
      post: mapPostToViewModel(post),
      profile,
      preview: {
        id: post.id,
        status: post.status.toLowerCase()
      }
    });
  } catch (error) {
    return next(error);
  }
}