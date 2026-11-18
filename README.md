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

## Browser regression checks

`npm run test:browser` loads the actual public templates, stylesheets, and navigation
script in headless Chrome. It covers disabled/failed JavaScript, keyboard navigation,
and short and maximum-length hero content at 320, 390, 540, 768, 1024, and 1280 CSS pixels.
Short hero copy keeps the overlapping scrapbook layout when its container has at
least 540 CSS pixels available; narrower containers and longer copy use the growing
layout. The choice is made in HTML/CSS and also works without JavaScript.
It uses local fixtures and system-font fallbacks, without database or R2 access.

Install Chrome/Chromium, or set `CHROME_PATH` to an installed browser executable.
The tests use Node's built-in APIs to control an isolated temporary Chrome profile;
no browser or additional npm package is downloaded.
These checks also run at the end of `npm run test:all`.
