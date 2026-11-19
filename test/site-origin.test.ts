import assert from "node:assert/strict";

import {
  describe,
  it
} from "node:test";

import {
  resolveSiteOrigin
} from "../src/config/site-origin.ts";

describe("public site origin", () => {
  it("defaults to the development port", () => {
    assert.equal(
      resolveSiteOrigin(
        undefined,
        "development",
        4000
      ),
      "http://localhost:4000"
    );
  });

  it("normalizes an optional trailing slash", () => {
    assert.equal(
      resolveSiteOrigin(
        " https://blog.example.test/ ",
        "production"
      ),
      "https://blog.example.test"
    );
  });

  it("requires an explicit production origin", () => {
    for (const value of [undefined, "", " "]) {
      assert.throws(
        () => resolveSiteOrigin(
          value,
          "production"
        ),
        /SITE_ORIGIN/
      );
    }
  });

  it("requires HTTPS in production", () => {
    assert.throws(
      () => resolveSiteOrigin(
        "http://blog.example.test",
        "production"
      ),
      /HTTPS/
    );
  });

  it("rejects credentials and non-origin values", () => {
    for (const value of [
      "not-a-url",
      "javascript:alert(1)",
      "https://user:password@example.test",
      "https://example.test/blog",
      "https://example.test/?source=test",
      "https://example.test/#home",
      "//example.test",
      "https://example.test\\other"
    ]) {
      assert.throws(
        () => resolveSiteOrigin(
          value,
          "development"
        ),
        /SITE_ORIGIN/
      );
    }
  });
});