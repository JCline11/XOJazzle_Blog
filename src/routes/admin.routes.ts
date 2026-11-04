import { Router } from "express";

import { loginLimiter }
  from "../middleware/login-rate-limiting.ts";

import {
  login,
  logout,
  showLoginPage
} from "../controllers/auth.controller.ts";

import { showAdminDashboard }
  from "../controllers/admin.controller.ts";

import {
  createPost,
  deletePost,
  showCreatePostForm,
  showEditPostForm,
  updatePost
} from "../controllers/admin-post.controller.ts";

import {
  exposeCsrfToken,
  requireCsrf
} from "../middleware/csrf.ts";

import { requireAdmin }
  from "../middleware/require-admin.ts";

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
  requireCsrf,
  createPost
);

adminRouter.get(
  "/posts/:id/edit",
  showEditPostForm
);

adminRouter.post(
  "/posts/:id",
  requireCsrf,
  updatePost
);

adminRouter.post(
  "/posts/:id/delete",
  requireCsrf,
  deletePost
);

adminRouter.post(
  "/logout",
  requireCsrf,
  logout
);

export default adminRouter;