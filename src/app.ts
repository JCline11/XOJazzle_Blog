import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import contentRouter from "./routes/content.routes.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// configure ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views", "pages"));

// Serve static files
app.use(express.static(path.join(__dirname,  "..", "public")));

// Use content router
app.use(contentRouter);

// 404 route
app.use((req, res) => {
  res.status(404).render("404");
});

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

  res.status(500).render("error");
});

export default app;