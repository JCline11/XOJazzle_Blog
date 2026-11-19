import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  after,
  before,
  describe,
  it
} from "node:test";

import express from "express";

import {
  MAX_IMAGE_BYTES
} from "../src/config/image-upload.ts";

import {
  imageUploadErrorHandler,
  parsePostImages
} from "../src/middleware/image-upload.ts";

import {
  requireCsrf
} from "../src/middleware/csrf.ts";

let server: Server;
let baseUrl = "";
let completedRequests = 0;

before(async () => {
  const app = express();

  // Test-only authentication and session substitutes.
  // Production continues using requireAdmin and real sessions.
  app.post(
    "/upload",

    (req, res, next) => {
      if (req.get("x-test-admin") !== "yes") {
        res.sendStatus(401);
        return;
      }

      req.session = {
        csrfToken: "test-csrf-token"
      } as typeof req.session;

      next();
    },

    parsePostImages,
    requireCsrf,

    (req, res) => {
      completedRequests += 1;

      const files = req.files as
        Record<string, Express.Multer.File[]>;

      res.json({
        title: req.body.title,
        imageBytes:
          files.featuredImage?.[0]?.buffer.byteLength ?? 0
      });
    }
  );

  app.use(imageUploadErrorHandler);

  server = await new Promise<Server>(resolve => {
    const listener = app.listen(
      0,
      "127.0.0.1",
      () => resolve(listener)
    );
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

function makeForm(
  bytes = new Uint8Array([1, 2, 3]),
  fieldName = "featuredImage",
  csrf = "test-csrf-token"
): FormData {
  const form = new FormData();

  form.set("_csrf", csrf);
  form.set("title", "Example post");

  form.set(
    fieldName,
    new Blob([bytes], { type: "image/png" }),
    "untrusted-name.png"
  );

  return form;
}

describe("image upload parsing", () => {
  it("parses files and text before CSRF validation", async () => {
    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: {
        "x-test-admin": "yes"
      },
      body: makeForm()
    });

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      title: "Example post",
      imageBytes: 3
    });
  });

  it("rejects an anonymous request before parsing", async () => {
    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      body: makeForm(
        new Uint8Array([1]),
        "unexpectedField"
      )
    });

    assert.equal(response.status, 401);
  });

  it("rejects a failed CSRF check before the next handler", async () => {
    const previousCount = completedRequests;

    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: {
        "x-test-admin": "yes"
      },
      body: makeForm(
        new Uint8Array([1]),
        "featuredImage",
        "incorrect-token"
      )
    });

    assert.equal(response.status, 403);
    assert.equal(completedRequests, previousCount);
  });

  it("rejects unexpected file fields safely", async () => {
    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: {
        "x-test-admin": "yes"
      },
      body: makeForm(
        new Uint8Array([1]),
        "unexpectedField"
      )
    });

    assert.equal(response.status, 400);
    assert.doesNotMatch(
      await response.text(),
      /MulterError|node_modules|Error:/
    );
  });

  it("rejects files larger than 5 MiB", async () => {
    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: {
        "x-test-admin": "yes"
      },
      body: makeForm(
        new Uint8Array(MAX_IMAGE_BYTES + 1)
      )
    });

    assert.equal(response.status, 413);
    assert.match(await response.text(), /5 MiB/);
  });
});