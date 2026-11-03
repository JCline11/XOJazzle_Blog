import { rateLimit } from "express-rate-limit";

import { PostgresRateLimitStore }
  from "../stores/postgres-rate-limit.store.ts";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  passOnStoreError: false,
  store: new PostgresRateLimitStore(),

  handler: (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email
        : "";

    return res.status(429).render("admin/login", {
      error:
        "Too many login attempts. Please try again in 15 minutes.",
      email
    });
  }
});