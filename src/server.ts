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

app.use((
  error: unknown,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.error(error);

  res.status(500).send(
    "Something went wrong while loading the page."
  );
});

const PORT = 3000;

app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});
