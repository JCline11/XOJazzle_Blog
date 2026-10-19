import { Router } from "express";
import { showHomePage, showPost} from "../controllers/content.controller.ts";
const contentRouter = Router();

contentRouter.get("/", showHomePage);
contentRouter.get("/posts/:slug", showPost);

export default contentRouter;