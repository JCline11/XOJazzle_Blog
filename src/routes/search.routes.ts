import { Router } from "express";

import {
  showRobots,
  showSitemap
} from "../controllers/search-discovery.controller.ts";

const searchRouter = Router();

searchRouter.get("/robots.txt", showRobots);
searchRouter.get("/sitemap.xml", showSitemap);

export default searchRouter;