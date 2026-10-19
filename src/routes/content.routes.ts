import { Router } from "express";
import { showCategoryPage, showHomePage, showPost} from "../controllers/content.controller.ts";
const contentRouter = Router();

contentRouter.get("/", showHomePage);
contentRouter.get("/categories/:category", showCategoryPage);
contentRouter.get("/posts/:slug", showPost);

export default contentRouter;