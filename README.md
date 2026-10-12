# XOJazzle Blog

A cozy scrapbook-style personal blog frontend for movies, books, anime, TV shows, and personal thoughts.

## Run it

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Where to edit things

- `public/index.html` — visible copy, links, image URLs, and content cards.
- `public/css/style.css` — colors, typography, layout, scrapbook decorations, and responsive rules.
- `public/js/main.js` — mobile menu, post filters, and reveal animations.
- `src/server.js` — the Express server serving the `public` folder.

The CSS starts with a `:root` variables section, so the palette can be changed in one place. The HTML includes comments above the main content groups to make future edits easier.

Images currently use Unsplash URLs as placeholders. Replace them with creator-owned images when the content is ready.
