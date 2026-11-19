import { Router } from "express";

import { lifecycle } from "../lib/lifecycle.ts";

import {
  showCategoryPage,
  showHomePage,
  showPost
} from "../controllers/content.controller.ts";

const contentRouter = Router();

contentRouter.get(
  "/",
  lifecycle.wrap(showHomePage)
);

contentRouter.get(
  "/categories/:category",
  lifecycle.wrap(showCategoryPage)
);

contentRouter.get(
  "/posts/:slug",
  lifecycle.wrap(showPost)
);

export default contentRouter;