import { rateLimit } from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,

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