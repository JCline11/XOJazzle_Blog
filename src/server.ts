import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { showHomePage } from "./controllers/content.controller.ts";

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

// Temporary article preview route.
// Later, replace this object with a post fetched from the database by its slug.
app.get("/posts/mock", (req, res) => {
	const post = {
		title: "Books that feel like a warm hug",
		categoryLabel: "books",
		excerpt: "A handful of gentle stories for rainy afternoons, soft blankets, and the days when you need the world to feel a little kinder.",
		publishedDate: "October 12, 2026",
		readTime: "6 min",
		featuredImageUrl: "https://i.pinimg.com/originals/d0/19/ed/d019ed2a913fa3985586d887caf31378.jpg",
		altText: "Illustrated cover of The Secret Garden",
		imageCaption: "the very best kind of afternoon",
		body: `Some books arrive at exactly the right time. They do not ask you to race through them or solve a mystery before midnight. They simply pull up a chair, pour something warm, and remind you that softness can be its own kind of adventure.

These are the stories I return to when the weather turns gray or life feels louder than usual. They are full of found families, familiar kitchens, small towns, and characters learning that it is perfectly fine to begin again.

A comforting book does not have to be uneventful. The best ones still contain heartbreak, uncertainty, and change. What makes them special is the feeling that the story will hold your hand while you move through it.

I love a novel that notices ordinary details: bread cooling on a windowsill, light moving across a bedroom floor, or the particular silence between two people who understand each other. Those details make a fictional place feel like somewhere we have already been.

If your bookshelf needs a softer corner, look for stories with a setting that feels like another character, friendships built from small acts of care, and an ending that leaves room to breathe.

I used to think every book needed to be finished quickly and reviewed perfectly. Lately, I would rather underline one sentence that follows me around for a week. Reading feels better when it is not another item on a list.

So take your time. Fold a blanket around your shoulders, put your phone in another room, and let a few pages be enough for tonight.`,
		pullQuote: "Maybe comfort is not the absence of difficult things. Maybe it is knowing we do not have to meet them alone.",
		closingNote: "Tell me about the book you reach for when you need a softer day. I am always making room for one more recommendation.",
		rating: 5,
		ratingNote: "For maximum coziness, read with a blanket and nowhere else to be."
	};

	res.render("post", { post });
});

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
