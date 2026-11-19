import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

import {
  describe,
  it
} from "node:test";

const script = await readFile(
  new URL(
    "../public/js/main.js",
    import.meta.url
  ),
  "utf8"
);

function navigationHarness(
  initiallyMobile = true,
  mediaAvailable = true
) {
  let focused: ElementStub | null = null;

  class ElementStub extends EventTarget {
    hidden = false;
    parent: ElementStub | null = null;

    attributes = new Map<string, string>();
    classes = new Set<string>();

    classList = {
      add: (name: string) => {
        this.classes.add(name);
      },

      toggle: (name: string, enabled: boolean) => {
        if (enabled) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }

        return enabled;
      }
    };

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }

    focus() {
      focused = this;
    }

    contains(value: unknown): boolean {
      let current = value;

      while (current instanceof ElementStub) {
        if (current === this) {
          return true;
        }

        current = current.parent;
      }

      return false;
    }
  }

  const header = new ElementStub();
  const button = new ElementStub();
  const nav = new ElementStub();
  const outside = new ElementStub();

  const links = [
    new ElementStub(),
    new ElementStub()
  ];

  button.hidden = true;
  button.parent = header;
  nav.parent = header;

  links.forEach(link => {
    link.parent = nav;
  });

  const elements = new Map([
    [".menu-toggle", button],
    [".site-nav", nav],
    [".public-site-header", header]
  ]);

  const document = Object.assign(
    new EventTarget(),
    {
      querySelector(selector: string) {
        return elements.get(selector) ?? null;
      },

      querySelectorAll(selector: string) {
        return selector === ".site-nav a"
          ? links
          : [];
      }
    }
  );

  Object.defineProperty(
    document,
    "activeElement",
    {
      get: () => focused
    }
  );

  const media = Object.assign(
    new EventTarget(),
    {
      matches: initiallyMobile
    }
  );

  const window = {
    matchMedia: mediaAvailable
      ? () => media
      : undefined
  };

  runInNewContext(script, {
    document,
    window
  });

  return {
    header,
    button,
    nav,
    links,

    focused: () => focused,

    clickButton() {
      button.dispatchEvent(new Event("click"));
    },

    clickLink() {
      links[0].focus();
      links[0].dispatchEvent(new Event("click"));
    },

    pressEscape() {
      const event = new Event("keydown", {
        cancelable: true
      });

      Object.defineProperty(
        event,
        "key",
        { value: "Escape" }
      );

      document.dispatchEvent(event);

      return event.defaultPrevented;
    },

    focusOutside() {
      outside.focus();
      document.dispatchEvent(new Event("focusin"));
    },

    clickOutside() {
      document.dispatchEvent(new Event("click"));
    },

    resize(mobile: boolean) {
      media.matches = mobile;
      media.dispatchEvent(new Event("change"));
    }
  };
}

describe("public navigation", () => {
  it("starts collapsed on mobile and opens with the button", () => {
    const h = navigationHarness();

    assert.equal(h.button.hidden, false);
    assert.equal(h.nav.hidden, true);

    assert.equal(
      h.button.getAttribute("aria-expanded"),
      "false"
    );

    h.clickButton();

    assert.equal(h.nav.hidden, false);

    assert.equal(
      h.button.getAttribute("aria-expanded"),
      "true"
    );
  });

  it("closes on Escape and restores focus", () => {
    const h = navigationHarness();

    h.clickButton();
    h.links[0].focus();

    assert.equal(h.pressEscape(), true);
    assert.equal(h.nav.hidden, true);
    assert.equal(h.focused(), h.button);

    assert.equal(
      h.button.getAttribute("aria-expanded"),
      "false"
    );
  });

  it("does not consume Escape when closed", () => {
    const h = navigationHarness();

    assert.equal(h.pressEscape(), false);
  });

  it("closes when focus or a click moves outside", () => {
    const h = navigationHarness();

    h.clickButton();
    h.focusOutside();

    assert.equal(h.nav.hidden, true);
    assert.notEqual(h.focused(), h.button);

    h.clickButton();
    h.clickOutside();

    assert.equal(h.nav.hidden, true);
  });

  it("closes after selecting a link", () => {
    const h = navigationHarness();

    h.clickButton();
    h.clickLink();

    assert.equal(h.nav.hidden, true);
  });

  it("keeps navigation available across breakpoints", () => {
    const h = navigationHarness();

    h.button.focus();
    h.resize(false);

    assert.equal(h.button.hidden, true);
    assert.equal(h.nav.hidden, false);
    assert.equal(h.focused(), h.links[0]);

    h.resize(true);

    assert.equal(h.button.hidden, false);
    assert.equal(h.nav.hidden, true);
    assert.equal(h.focused(), h.button);
  });

  it("preserves the visible-link fallback without matchMedia", () => {
    const h = navigationHarness(true, false);

    assert.equal(h.button.hidden, true);
    assert.equal(h.nav.hidden, false);

    assert.equal(
      h.header.classes.has("navigation-ready"),
      false
    );
  });
});