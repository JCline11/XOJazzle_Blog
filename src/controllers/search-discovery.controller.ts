import type {
  Request,
  Response,
  NextFunction
} from "express";

import { env } from "../config/env.ts";

import {
  renderSitemap
} from "../lib/sitemap.ts";

import {
  publicUrl
} from "../services/page-metadata.ts";

import {
  getSitemapPosts
} from "../services/search-discovery.service.ts";

export async function showSitemap(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const posts = await getSitemapPosts();

    const xml = renderSitemap(
      env.SITE_ORIGIN,
      posts
    );

    res.set("Cache-Control", "no-store");

    return res
      .type("application/xml")
      .send(xml);
  } catch (error) {
    return next(error);
  }
}

export function showRobots(
  _req: Request,
  res: Response
) {
  const sitemapUrl = publicUrl(
    env.SITE_ORIGIN,
    "/sitemap.xml"
  );

  const text = [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${sitemapUrl}`,
    ""
  ].join("\n");

  res.set("Cache-Control", "no-store");

  return res
    .type("text/plain")
    .send(text);
}