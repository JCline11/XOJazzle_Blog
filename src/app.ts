import express from "express";
import helmet from "helmet";
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

app.disable("x-powered-by");

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Configure browser security headers.
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com"
        ],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: [
          "'self'",
          "data:",
          "https:"
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          "https://fonts.googleapis.com"
        ],
        upgradeInsecureRequests:
          env.NODE_ENV === "production"
            ? []
            : null
      }
    }
  })
);

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
    extended: false,
    limit: "100kb",
    parameterLimit: 50
  })
);

// Load the session before any routes use it.
app.use(sessionMiddleware);

// Expose shared values to views.
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.isAuthenticated =
    Boolean(req.session.adminUserId);

  return next();
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
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    return res
      .status(413)
      .send("Request body is too large.");
  }

  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).render("error");
});

export default app;