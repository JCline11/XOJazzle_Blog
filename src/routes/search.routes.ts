import { Router } from "express";

import { lifecycle } from "../lib/lifecycle.ts";

import {
  showRobots,
  showSitemap
} from "../controllers/search-discovery.controller.ts";

const searchRouter = Router();

searchRouter.get(
  "/robots.txt",
  lifecycle.wrap(showRobots)
);

searchRouter.get(
  "/sitemap.xml",
  lifecycle.wrap(showSitemap)
);

export default searchRouter;