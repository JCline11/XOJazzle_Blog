import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

import contentRouter from "./routes/content.routes.ts";
import adminRouter from "./routes/admin.routes.ts";
import searchRouter from "./routes/search.routes.ts";

import {
  createHealthRouter
} from "./routes/health.routes.ts";

import {
  sessionMiddleware
} from "./config/session.ts";

import {
  privatePage
} from "./middleware/private-page.ts";

import {
  reportServerError
} from "./lib/report-error.ts";

import { env } from "./config/env.ts";
import { pgPool } from "./lib/postgres.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requestErrorResponses =
  new Map<string, readonly [number, string]>([
    [
      "entity.too.large",
      [413, "Request body is too large."]
    ],
    [
      "parameters.too.many",
      [413, "The form contains too many fields."]
    ],
    [
      "entity.parse.failed",
      [400, "The request body is invalid."]
    ],
    [
      "request.size.invalid",
      [400, "The request body is invalid."]
    ],
    [
      "request.aborted",
      [400, "The request was interrupted."]
    ],
    [
      "charset.unsupported",
      [415, "The request encoding is unsupported."]
    ],
    [
      "encoding.unsupported",
      [415, "The request encoding is unsupported."]
    ]
  ]);

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

// Answer health checks before sessions and content routes.
app.use(
  createHealthRouter(async () => {
    const query = {
      text: "SELECT 1",
      query_timeout: 1_000
    };

    await pgPool.query(query);
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

// Apply private-page headers before admin authentication.
app.use(
  "/admin",
  privatePage,
  adminRouter
);

// Public discovery and content routes.
app.use(searchRouter);
app.use(contentRouter);

// Unmatched-route handler.
app.use((_req, res) => {
  return res.status(404).render("404");
});

// Error handler.
app.use((
  error: unknown,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (res.headersSent) {
    const errorId = reportServerError("http_error", error);

    return next(
      new Error("Response interrupted. Error ID: " + errorId)
    );
  }

  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });

  let expectedResponse:
    readonly [number, string] | undefined;

  if (error instanceof URIError) {
    expectedResponse = [
      400,
      "The request URL is invalid."
    ];
  } else if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof error.type === "string"
  ) {
    expectedResponse = requestErrorResponses.get(error.type);
  }

  if (expectedResponse) {
    const [status, message] = expectedResponse;

    return res
      .status(status)
      .type("text/plain")
      .send(message);
  }

  const errorId = reportServerError("http_error", error);

  res.set("X-Error-ID", errorId);

  return res.status(500).render(
    "error",
    (renderError: Error | null, html: string) => {
      if (renderError) {
        res
          .type("text/plain")
          .send("Internal server error.");
        return;
      }

      res.send(html);
    }
  );
});

export default app;