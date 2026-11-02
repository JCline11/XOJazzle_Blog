import { Router } from "express";
import { loginLimiter } from "../middleware/login-rate-limiting.ts";

import {
  login,
  logout,
  showLoginPage
} from "../controllers/auth.controller.ts";

import { showAdminDashboard }
  from "../controllers/admin.controller.ts";

import {
  exposeCsrfToken,
  requireCsrf
} from "../middleware/csrf.ts";

import { requireAdmin }
  from "../middleware/require-admin.ts";

const adminRouter = Router();

// Make a CSRF token available to every admin view.
adminRouter.use(exposeCsrfToken);

// Public authentication routes
adminRouter.get("/login", showLoginPage);
adminRouter.post("/login", requireCsrf, loginLimiter, login);

// Every route declared below this line is protected.
adminRouter.use(requireAdmin);

adminRouter.get("/", showAdminDashboard);
adminRouter.post("/logout", requireCsrf, logout);

export default adminRouter;