import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import contentRouter from "./routes/content.routes.ts";
import adminRouter from "./routes/admin.routes.ts";

import { sessionMiddleware }
  from "./config/session.ts";

import { env } from "./config/env.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Configure EJS.
app.set("view engine", "ejs");
app.set(
  "views",
  path.join(__dirname, "views", "pages")
);

// Serve static files.
app.use(
  express.static(
    path.join(__dirname, "..", "public")
  )
);

// Parse regular HTML form submissions.
app.use(
  express.urlencoded({
    extended: false
  })
);

// Load the session before any routes use it.
app.use(sessionMiddleware);

// Expose authentication state to views.
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.isAuthenticated =
    Boolean(req.session.adminUserId);

  next();
});

// Shared template values.
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Application routes.
app.use("/admin", adminRouter);
app.use(contentRouter);

// Unmatched-route handler.
app.use((req, res) => {
  return res.status(404).render("404");
});

// Unexpected-error handler.
app.use((
  error: unknown,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).render("error");
});

export default app;