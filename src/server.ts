import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { showHomePage, showPost} from "./controllers/content.controller.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// configure ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views", "pages"));

// Serve static files
app.use(express.static(path.join(__dirname,  "..", "public")));

// Homepage route
app.get("/", showHomePage);

// Post route
app.get("/posts/:slug", showPost);

app.get("/debug/500", () => {
  throw new Error("Intentional 500 test");
});

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

const PORT = 3000;

app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});
