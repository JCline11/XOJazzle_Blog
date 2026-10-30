import { Router } from "express";
import { loginLimiter } from "../middleware/login-rate-limiting.ts";

import {
  login,
  logout,
  showLoginPage
} from "../controllers/auth.controller.ts";

import { showAdminDashboard }
  from "../controllers/admin.controller.ts";

import { requireAdmin }
  from "../middleware/require-admin.ts";

const adminRouter = Router();

// Public authentication routes
adminRouter.get("/login", showLoginPage);
adminRouter.post("/login", loginLimiter, login);

// Every route declared below this line is protected.
adminRouter.use(requireAdmin);

adminRouter.get("/", showAdminDashboard);
adminRouter.post("/logout", logout);

export default adminRouter;