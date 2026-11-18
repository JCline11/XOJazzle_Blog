import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { launchChrome } from "./chrome.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = path.join(root, "public");
const ejs = createRequire(import.meta.url)("ejs") as {
  renderFile: (file: string, data: Record<string, unknown>) => Promise<string>;
};

let browser: Awaited<ReturnType<typeof launchChrome>> | undefined;
let server: Server | undefined;
let baseUrl = "";

async function renderHome(long: boolean): Promise<string> {
  const image = "/images/profile/xojazzle_profile.jpg";
  const favorite = {
    title: "Current favorite",
    coverImageUrl: image,
    coverAltText: "Fixture portrait",
    note: "A short recommendation."
  };
  const html = await ejs.renderFile(
    path.join(root, "src/views/pages/home.ejs"),
    {
      currentPath: "/",
      profile: {
        siteName: "Browser fixture",
        heroText: "A quiet place for stories.",
        aboutContent: "About the blogger.",
        profileImageUrl: image,
        contactEmail: null,
        socialLinks: { instagram: "#", tiktok: "#", youtube: "#" }
      },
      latestPosts: [],
      currentlyLoving: { reading: favorite, watching: favorite },
      anticipatedReleases: {
        books: { text: "Books." },
        movies: { text: "Movies." },
        tv: { text: "Television." }
      },
      heroCollage: {
        primary: {
          imageUrl: image,
          altText: "Primary portrait",
          caption: long ? "W".repeat(300) : "A quiet afternoon"
        },
        secondary: {
          imageUrl: image,
          altText: "Secondary portrait",
          caption: long ? "A thoughtful caption about stories. ".repeat(12).slice(0, 300) : "Movie night"
        },
        journal: {
          date: long ? "W".repeat(100) : "NOV 17",
          text: long ? "A journal entry about the little things. ".repeat(20).slice(0, 500) : "Today I am",
          emphasis: long ? "W".repeat(300) : "choosing joy"
        }
      }
    }
  );

  // Keep layout tests deterministic and offline. Application CSS and JS are real;
  // only external font links are omitted, exercising the system-font fallback.
  return html.replace(/<link\b[^>]*href="https:\/\/fonts\.[^"]*"[^>]*>/g, "");
}

before(async () => {
  const pages = new Map([
    ["/", await renderHome(false)],
    ["/long", await renderHome(true)]
  ]);

  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const html = pages.get(pathname);

      res.setHeader("Cache-Control", "no-store");
      if (html) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      }

      if (pathname === "/js/main.js" && req.headers.referer) {
        const mode = new URL(req.headers.referer).searchParams.get("mode");
        if (mode === "failed-request") {
          res.writeHead(404).end();
          return;
        }
        if (mode === "runtime-error") {
          res.setHeader("Content-Type", "text/javascript");
          res.end("throw new Error('Simulated initialization failure');");
          return;
        }
      }

      const file = path.resolve(publicRoot, `.${pathname}`);
      if (!file.startsWith(`${publicRoot}${path.sep}`)) {
        res.writeHead(404).end();
        return;
      }

      const bytes = await readFile(file);
      res.setHeader("Content-Type", pathname.endsWith(".css")
        ? "text/css" : pathname.endsWith(".js")
          ? "text/javascript" : "image/jpeg");
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await launchChrome();
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
  }
});

describe("public layout in Chrome", { concurrency: false }, () => {
  for (const scenario of ["disabled", "failed-request", "runtime-error"] as const) {
    it(`keeps mobile navigation usable when JavaScript is ${scenario}`, async () => {
      const page = await browser!.page(390);
      try {
        await page.navigate(`${baseUrl}/?mode=${scenario}`, scenario !== "disabled");
        assert.ok(await page.evaluate<number>("document.querySelector('.menu-fallback').getBoundingClientRect().height") >= 44);
        await page.evaluate("document.querySelector('.menu-fallback').click()");
        const state = await page.evaluate<{ buttonHidden: boolean; linksVisible: boolean[] }>(`({
          buttonHidden: document.querySelector('.menu-toggle').hidden,
          linksVisible: Array.from(document.querySelectorAll('.site-nav a:not(.navigation-close)')).map(link => {
            const box = link.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          })
        })`);
        assert.equal(state.buttonHidden, true);
        assert.equal(state.linksVisible.length, 6);
        assert.ok(state.linksVisible.every(Boolean));
        await page.evaluate("document.querySelector('.navigation-close').click()");
        assert.equal(await page.evaluate("document.querySelector('.site-nav').getBoundingClientRect().height"), 0);
      } finally {
        await page.close();
      }
    });
  }

  it("opens with the keyboard, closes on Escape, and survives resizing", async () => {
    const page = await browser!.page(390);
    try {
      await page.navigate(baseUrl);
      assert.equal(await page.evaluate("document.querySelector('.menu-fallback').getBoundingClientRect().height"), 0);
      assert.equal(await page.evaluate("document.querySelector('.site-nav').getBoundingClientRect().height"), 0);
      await page.evaluate("document.querySelector('.menu-toggle').focus()");
      await page.key("Enter");
      assert.equal(await page.evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded')"), "true");
      assert.ok(await page.evaluate<number>("document.querySelector('.site-nav').getBoundingClientRect().height") > 0);
      await page.key("Tab");
      await page.key("Escape");
      assert.equal(await page.evaluate("document.querySelector('.site-nav').getBoundingClientRect().height"), 0);
      assert.equal(await page.evaluate("document.activeElement === document.querySelector('.menu-toggle')"), true);
      await page.viewport(1280);
      await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.ok(await page.evaluate<number>("document.querySelector('.site-nav').getBoundingClientRect().height") > 0);
      assert.equal(await page.evaluate("document.querySelector('.menu-toggle').hidden"), true);
    } finally {
      await page.close();
    }
  });

  for (const width of [320, 390, 540, 768, 1024, 1280]) {
    for (const long of [false, true]) {
      it(`keeps ${long ? "maximum-length" : "short"} hero content readable at ${width}px`, async () => {
        const page = await browser!.page(width);
        try {
          // Also verify that the wide layout works without JavaScript.
          await page.navigate(`${baseUrl}${long ? "/long" : "/"}`, width !== 1280);
          const geometry = await page.evaluate<{
            box: { left: number; right: number; top: number; bottom: number };
            children: Array<{ left: number; right: number; top: number; bottom: number; z: number }>;
            text: Array<{ left: number; right: number; top: number; bottom: number; owner: number }>;
            overflow: string; documentWidth: number; viewport: number; containerWidth: number; layout: string;
          }>(`(() => {
            const collage = document.querySelector('.hero-collage');
            const box = collage.getBoundingClientRect();
            const cards = Array.from(collage.querySelectorAll(".polaroid,.journal-scrap"));
            const children = cards.map(element => ({
              ...element.getBoundingClientRect().toJSON(),
              z: Number(getComputedStyle(element).zIndex)
            }));
            const text = Array.from(collage.querySelectorAll("figcaption,.journal-scrap p,.journal-date"))
              .flatMap(element => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return Array.from(range.getClientRects())
                  .filter(rect => rect.width > 0 && rect.height > 0)
                  .map(rect => ({ ...rect.toJSON(), owner: cards.indexOf(element.closest('.polaroid,.journal-scrap')) }));
              });
            return {
              box: box.toJSON(), children, text,
              containerWidth: collage.parentElement.getBoundingClientRect().width,
              layout: getComputedStyle(collage).getPropertyValue('--hero-layout').trim(),
              overflow: getComputedStyle(collage).overflow,
              documentWidth: document.documentElement.scrollWidth,
              viewport: window.innerWidth
            };
          })()`);
          assert.equal(geometry.overflow, "visible");
          assert.equal(geometry.layout, !long && geometry.containerWidth >= 540 ? "overlap" : "flow");
          assert.ok(geometry.documentWidth <= geometry.viewport + 1, JSON.stringify(geometry));
          // Tilted paper edges may extend just beyond the original 520px stage.
          // Text must always remain inside it.
          for (const box of [...(geometry.layout === "flow" ? geometry.children : []), ...geometry.text]) {
            assert.ok(box.left >= geometry.box.left - 1 && box.right <= geometry.box.right + 1, JSON.stringify(geometry));
            assert.ok(box.top >= geometry.box.top - 1 && box.bottom <= geometry.box.bottom + 1, JSON.stringify(geometry));
          }
          const intersects = (a: { left: number; right: number; top: number; bottom: number },
            b: { left: number; right: number; top: number; bottom: number }) =>
            a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          for (const text of geometry.text) {
            geometry.children.forEach((card, index) => {
              if (index !== text.owner && card.z > geometry.children[text.owner].z) {
                assert.equal(intersects(text, card), false, "Overlapping paper must not cover readable text: " + JSON.stringify(geometry));
              }
            });
          }
          if (geometry.layout === "overlap") {
            assert.ok(intersects(geometry.children[0], geometry.children[1]), "The wide scrapbook photos should overlap.");
            const composition = await page.evaluate(`(() => {
              const style = selector => getComputedStyle(document.querySelector(selector));
              const main = style('.hero-collage .polaroid-main');
              const small = style('.hero-collage .polaroid-small');
              const journal = style('.hero-collage .journal-scrap');
              return {
                height: style('.hero-collage').height,
                main: [main.position, main.top, main.left, main.width],
                small: [small.position, small.top, small.left, small.width],
                journal: [journal.position, journal.right, journal.bottom, journal.width, journal.height],
                tape: style('.hero-collage .tape').zIndex,
                sticker: style('.hero-collage .sticker').zIndex
              };
            })()`);
            assert.deepEqual(composition, {
              height: "520px",
              main: ["absolute", "65px", "145px", "285px"],
              small: ["absolute", "310px", "31px", "160px"],
              journal: ["absolute", "10px", "59px", "190px", "150px"],
              tape: "8", sticker: "9"
            });
          }
          for (let i = 0; geometry.layout === "flow" && i < geometry.children.length; i++) {
            for (let j = i + 1; j < geometry.children.length; j++) {
              const a = geometry.children[i];
              const b = geometry.children[j];
              assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
                "Hero cards must not cover one another's content.");
            }
          }
        } finally {
          await page.close();
        }
      });
    }
  }
});
