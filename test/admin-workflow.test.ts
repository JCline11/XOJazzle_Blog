import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

const editorScript = await readFile(
  new URL("../public/js/editor-tools.js", import.meta.url),
  "utf8"
);

const dashboardScript = await readFile(
  new URL("../public/js/admin-dashboard.js", import.meta.url),
  "utf8"
);

function editorHarness() {
  const title = {
    name: "title",
    type: "text",
    value: "Original title"
  };

  const image = {
    name: "featuredImage",
    type: "file",
    value: "",
    files: [] as Array<{
      name: string;
      size: number;
      lastModified: number;
      type: string;
    }>
  };

  const form = Object.assign(new EventTarget(), {
    elements: [title, image]
  });

  const document = Object.assign(new EventTarget(), {
    querySelectorAll() {
      return [form];
    }
  });

  let confirmation = true;
  let confirmationCount = 0;

  const window = Object.assign(new EventTarget(), {
    location: {
      href: "https://blog.example/admin/homepage"
    },
    confirm() {
      confirmationCount += 1;
      return confirmation;
    }
  });

  runInNewContext(editorScript, {
    document,
    window,
    URL
  });

  function unloadPrevented(): boolean {
    const event = new Event("beforeunload", {
      cancelable: true
    });

    Object.defineProperty(event, "returnValue", {
      writable: true,
      value: ""
    });

    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function navigate(target = "_self"): boolean {
    const anchor = {
      href: "https://blog.example/admin",
      target,
      hasAttribute() {
        return false;
      }
    };

    const event = new Event("click", {
      cancelable: true
    });

    Object.defineProperty(event, "button", { value: 0 });
    Object.defineProperty(event, "target", {
      value: {
        closest() {
          return anchor;
        }
      }
    });

    document.dispatchEvent(event);
    return event.defaultPrevented;
  }

  return {
    title,
    image,
    form,
    unloadPrevented,
    navigate,
    setConfirmation(value: boolean) {
      confirmation = value;
    },
    confirmationCount: () => confirmationCount
  };
}

function dashboardHarness() {
  const panel = { hidden: true };

  const status = Object.assign(new EventTarget(), {
    value: "all"
  });

  const category = Object.assign(new EventTarget(), {
    value: "all"
  });

  const reset = new EventTarget();
  const count = { textContent: "" };
  const empty = { hidden: true };

  const rows = [
    {
      hidden: false,
      dataset: { status: "draft", category: "books" }
    },
    {
      hidden: false,
      dataset: { status: "published", category: "books" }
    },
    {
      hidden: false,
      dataset: { status: "draft", category: "movies" }
    }
  ];

  const selectors: Record<string, unknown> = {
    "[data-post-filters]": panel,
    "[data-post-status]": status,
    "[data-post-category]": category,
    "[data-reset-post-filters]": reset,
    "[data-post-count]": count,
    "[data-post-filter-empty]": empty
  };

  runInNewContext(dashboardScript, {
    document: {
      querySelector(selector: string) {
        return selectors[selector];
      },
      querySelectorAll() {
        return rows;
      }
    }
  });

  return { panel, status, category, reset, count, empty, rows };
}

describe("unsaved editor protection", () => {
  it("allows unchanged forms and recognizes restored values", () => {
    const h = editorHarness();

    assert.equal(h.unloadPrevented(), false);

    h.title.value = "Changed title";
    assert.equal(h.unloadPrevented(), true);

    h.title.value = "Original title";
    assert.equal(h.unloadPrevented(), false);
  });

  it("tracks selected images", () => {
    const h = editorHarness();

    h.image.files = [{
      name: "photo.heic",
      size: 100,
      lastModified: 123,
      type: "image/heic"
    }];

    assert.equal(h.unloadPrevented(), true);

    h.image.files = [];
    assert.equal(h.unloadPrevented(), false);
  });

  it("preserves protection after failed saves", () => {
    const h = editorHarness();

    h.title.value = "Changed title";
    h.form.dispatchEvent(new Event("editor:saving"));

    assert.equal(h.unloadPrevented(), true);

    h.form.dispatchEvent(new Event("editor:finished"));

    assert.equal(h.unloadPrevented(), true);
  });

  it("allows successful-save navigation", () => {
    const h = editorHarness();

    h.title.value = "Saved title";
    h.form.dispatchEvent(new Event("editor:saving"));
    h.form.dispatchEvent(new Event("editor:saved"));
    h.form.dispatchEvent(new Event("editor:finished"));

    assert.equal(h.unloadPrevented(), false);
  });

  it("cancels navigation or allows one confirmed discard", () => {
    const h = editorHarness();

    h.title.value = "Unsaved title";
    h.setConfirmation(false);

    assert.equal(h.navigate(), true);
    assert.equal(h.unloadPrevented(), true);

    h.setConfirmation(true);

    assert.equal(h.navigate(), false);
    assert.equal(h.unloadPrevented(), false);
    assert.equal(h.confirmationCount(), 2);
  });

  it("does not warn when opening another tab", () => {
    const h = editorHarness();

    h.title.value = "Unsaved title";

    assert.equal(h.navigate("_blank"), false);
    assert.equal(h.confirmationCount(), 0);
    assert.equal(h.unloadPrevented(), true);
  });
});

describe("dashboard post filters", () => {
  it("combines status and category", () => {
    const h = dashboardHarness();

    assert.equal(h.panel.hidden, false);
    assert.equal(h.count.textContent, "Showing 3 of 3 posts.");

    h.status.value = "draft";
    h.category.value = "books";
    h.category.dispatchEvent(new Event("change"));

    assert.deepEqual(
      h.rows.map(row => row.hidden),
      [false, true, true]
    );

    assert.equal(h.count.textContent, "Showing 1 of 3 posts.");
    assert.equal(h.empty.hidden, true);
  });

  it("shows an empty result and resets both filters", () => {
    const h = dashboardHarness();

    h.status.value = "published";
    h.category.value = "movies";
    h.status.dispatchEvent(new Event("change"));

    assert.ok(h.rows.every(row => row.hidden));
    assert.equal(h.empty.hidden, false);

    h.reset.dispatchEvent(new Event("click"));

    assert.equal(h.status.value, "all");
    assert.equal(h.category.value, "all");
    assert.ok(h.rows.every(row => !row.hidden));
    assert.equal(h.empty.hidden, true);
  });
});