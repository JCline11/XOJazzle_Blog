import { Router } from "express";

import { lifecycle } from "../lib/lifecycle.ts";

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
  showPostPreview
} from "../controllers/admin-preview.controller.ts";

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

adminRouter.get(
  "/login",
  lifecycle.wrap(showLoginPage)
);

adminRouter.post(
  "/login",
  requireCsrf,
  loginLimiter,
  lifecycle.wrap(login)
);

adminRouter.use(lifecycle.wrap(requireAdmin));

adminRouter.get(
  "/",
  lifecycle.wrap(showAdminDashboard)
);

adminRouter.get(
  "/posts/new",
  lifecycle.wrap(showCreatePostForm)
);

adminRouter.get(
  "/posts/:id/preview",
  lifecycle.wrap(showPostPreview)
);

adminRouter.post(
  "/posts",
  parsePostImages,
  requireCsrf,
  lifecycle.wrap(createPost),
  imageUploadErrorHandler
);

adminRouter.get(
  "/posts/:id/edit",
  lifecycle.wrap(showEditPostForm)
);

adminRouter.post(
  "/posts/:id",
  parsePostImages,
  requireCsrf,
  lifecycle.wrap(updatePost),
  imageUploadErrorHandler
);

adminRouter.post(
  "/posts/:id/delete",
  requireCsrf,
  lifecycle.wrap(deletePost)
);

adminRouter.get(
  "/homepage",
  lifecycle.wrap(showHomepageForm)
);

adminRouter.post(
  "/homepage",
  parseHomepageImages,
  requireCsrf,
  lifecycle.wrap(updateHomepage),
  imageUploadErrorHandler
);

adminRouter.post(
  "/logout",
  requireCsrf,
  lifecycle.wrap(logout)
);

export default adminRouter;