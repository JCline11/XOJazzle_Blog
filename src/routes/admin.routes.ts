import { Router } from "express";

import {
  loginLimiter
} from "../middleware/login-rate-limiting.ts";

import {
  login,
  logout,
  showLoginPage
} from "../controllers/auth.controller.ts";

import {
  showAdminDashboard
} from "../controllers/admin.controller.ts";

import {
  createPost,
  deletePost,
  showCreatePostForm,
  showEditPostForm,
  updatePost
} from "../controllers/admin-post.controller.ts";

import {
  showHomepageForm,
  updateHomepage
} from "../controllers/admin-homepage.controller.ts";

import {
  exposeCsrfToken,
  requireCsrf
} from "../middleware/csrf.ts";

import {
  requireAdmin
} from "../middleware/require-admin.ts";

import {
  imageUploadErrorHandler,
  parseHomepageImages,
  parsePostImages
} from "../middleware/image-upload.ts";

const adminRouter = Router();

adminRouter.use(exposeCsrfToken);

adminRouter.get("/login", showLoginPage);

adminRouter.post(
  "/login",
  requireCsrf,
  loginLimiter,
  login
);

adminRouter.use(requireAdmin);

adminRouter.get("/", showAdminDashboard);

adminRouter.get(
  "/posts/new",
  showCreatePostForm
);

adminRouter.post(
  "/posts",
  parsePostImages,
  requireCsrf,
  createPost,
  imageUploadErrorHandler
);

adminRouter.get(
  "/posts/:id/edit",
  showEditPostForm
);

adminRouter.post(
  "/posts/:id",
  parsePostImages,
  requireCsrf,
  updatePost,
  imageUploadErrorHandler
);

adminRouter.post(
  "/posts/:id/delete",
  requireCsrf,
  deletePost
);

adminRouter.get(
  "/homepage",
  showHomepageForm
);

adminRouter.post(
  "/homepage",
  parseHomepageImages,
  requireCsrf,
  updateHomepage,
  imageUploadErrorHandler
);

adminRouter.post(
  "/logout",
  requireCsrf,
  logout
);

export default adminRouter;