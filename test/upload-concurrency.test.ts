import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { setImmediate } from "node:timers/promises";

import {
  it,
  type TestContext
} from "node:test";

import express from "express";
import type {
  ErrorRequestHandler,
  RequestHandler
} from "express";

import {
  imageUploadErrorHandler,
  parseHomepageImages,
  parsePostImages,
  runUploadController
} from "../src/middleware/image-upload.ts";

import {
  requireCsrf
} from "../src/middleware/csrf.ts";

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>(finish => {
    resolve = finish;
  });

  return { promise, resolve };
}

type Gate = ReturnType<typeof deferred>;

type Job = {
  id: string;
  early: boolean;
  fail: boolean;
  entered: boolean;
  started: Gate;
  closed: Gate;
  release: Gate;
  finished: Gate;
};

function makeForm(
  field = "featuredImage",
  csrf = "test-csrf-token"
): FormData {
  const form = new FormData();

  form.set("_csrf", csrf);

  form.set(
    field,
    new Blob(
      [new Uint8Array([1, 2, 3])],
      { type: "image/png" }
    ),
    "fixture.png"
  );

  return form;
}

async function serve(t: TestContext) {
  const jobs = new Map<string, Job>();

  let enteredCount = 0;

  function job(
    id: string,
    options: { early?: boolean; fail?: boolean } = {}
  ): Job {
    const value: Job = {
      id,
      early: options.early ?? false,
      fail: options.fail ?? false,
      entered: false,
      started: deferred(),
      closed: deferred(),
      release: deferred(),
      finished: deferred()
    };

    jobs.set(id, value);

    return value;
  }

  const controller: RequestHandler = async (req, res) => {
    const current = jobs.get(req.get("x-test-job") ?? "");

    if (!current) {
      throw new Error("Missing synthetic job.");
    }

    current.entered = true;
    enteredCount += 1;

    res.once("close", current.closed.resolve);
    current.started.resolve();

    try {
      if (current.early) {
        res.send("done");
      }

      await current.release.promise;

      if (current.fail) {
        throw new Error("Synthetic controller failure.");
      }

      if (!res.destroyed && !res.writableEnded) {
        res.send("done");
      }
    } finally {
      current.finished.resolve();
    }
  };

  const app = express();

  // Test-only authorization and session substitutes.
  app.use((req, res, next) => {
    if (req.get("x-test-admin") !== "yes") {
      res.sendStatus(401);
      return;
    }

    req.session = {
      csrfToken: "test-csrf-token"
    } as typeof req.session;

    next();
  });

  app.post(
    "/post",
    parsePostImages,
    requireCsrf,
    runUploadController(controller)
  );

  app.post(
    "/homepage",
    parseHomepageImages,
    requireCsrf,
    runUploadController(controller)
  );

  app.use(imageUploadErrorHandler);

  const errorHandler: ErrorRequestHandler = (
    _error,
    _req,
    res,
    _next
  ) => {
    res.status(500).send("Simulated controller failure.");
  };

  app.use(errorHandler);

  const server = createServer(
    {
      keepAliveTimeout: 50,
      keepAliveTimeoutBuffer: 0
    },
    app
  );

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const baseUrl = "http://127.0.0.1:" + address.port;

  t.after(async () => {
    for (const current of jobs.values()) {
      current.release.resolve();
    }

    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });

    await Promise.all(
      [...jobs.values()]
        .filter(current => current.entered)
        .map(current => current.finished.promise)
    );

    await setImmediate();
  });

  function upload(
    current: Job | undefined,
    pathname = "/post",
    options: {
      field?: string;
      csrf?: string;
      signal?: AbortSignal;
    } = {}
  ) {
    return fetch(baseUrl + pathname, {
      method: "POST",

      headers: {
        "x-test-admin": "yes",
        "x-test-job": current?.id ?? "should-not-run"
      },

      body: makeForm(options.field, options.csrf),
      signal: options.signal
    });
  }

  return {
    server,
    baseUrl,
    job,
    upload,
    enteredCount: () => enteredCount
  };
}

it(
  "keeps slots reserved after a browser disconnects",
  { timeout: 5_000 },
  async t => {
    const fixture = await serve(t);

    const first = fixture.job("first");
    const second = fixture.job("second");
    const abort = new AbortController();

    const firstResponse = fixture.upload(
      first,
      "/post",
      { signal: abort.signal }
    );

    const secondResponse = fixture.upload(second);

    void firstResponse.catch(() => {});
    void secondResponse.catch(() => {});

    await Promise.all([
      first.started.promise,
      second.started.promise
    ]);

    const aborted = assert.rejects(firstResponse, {
      name: "AbortError"
    });

    abort.abort();

    await aborted;
    await first.closed.promise;

    const busy = await fixture.upload(
      undefined,
      "/homepage",
      { field: "unexpectedField" }
    );

    assert.equal(busy.status, 503);
    await busy.text();

    first.release.resolve();
    await first.finished.promise;
    await setImmediate();

    const replacement = fixture.job("replacement");
    replacement.release.resolve();

    const accepted = await fixture.upload(
      replacement,
      "/homepage",
      { field: "profileImage" }
    );

    assert.equal(accepted.status, 200);
    await accepted.text();

    second.release.resolve();

    const completed = await secondResponse;

    assert.equal(completed.status, 200);
    await completed.text();
  }
);

it(
  "keeps slots after an early response until controller work finishes",
  { timeout: 5_000 },
  async t => {
    const fixture = await serve(t);

    const first = fixture.job("first", { early: true });
    const second = fixture.job("second", { early: true });

    const responses = await Promise.all([
      fixture.upload(first),
      fixture.upload(second)
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
      await response.text();
    }

    const busy = await fixture.upload(
      undefined,
      "/post",
      { field: "unexpectedField" }
    );

    assert.equal(busy.status, 503);
    await busy.text();

    first.release.resolve();
    second.release.resolve();

    await Promise.all([
      first.finished.promise,
      second.finished.promise
    ]);

    await setImmediate();

    const next = fixture.job("next");
    next.release.resolve();

    const accepted = await fixture.upload(next);

    assert.equal(accepted.status, 200);
    await accepted.text();
  }
);

it(
  "releases slots after controller failures",
  { timeout: 5_000 },
  async t => {
    const fixture = await serve(t);

    for (let index = 0; index < 3; index += 1) {
      const current = fixture.job(
        "failure-" + index,
        { fail: true }
      );

      current.release.resolve();

      const response = await fixture.upload(current);

      assert.equal(response.status, 500);
      await response.text();
    }

    const next = fixture.job("next");
    next.release.resolve();

    const accepted = await fixture.upload(next);

    assert.equal(accepted.status, 200);
    await accepted.text();
  }
);

it(
  "releases slots after CSRF and multipart rejections",
  { timeout: 5_000 },
  async t => {
    const fixture = await serve(t);

    for (let index = 0; index < 3; index += 1) {
      const csrfFailure = await fixture.upload(
        undefined,
        "/post",
        { csrf: "incorrect-token" }
      );

      assert.equal(csrfFailure.status, 403);
      await csrfFailure.text();

      const parsingFailure = await fixture.upload(
        undefined,
        "/post",
        { field: "unexpectedField" }
      );

      assert.equal(parsingFailure.status, 400);
      await parsingFailure.text();
    }

    assert.equal(fixture.enteredCount(), 0);

    const next = fixture.job("next");
    next.release.resolve();

    const accepted = await fixture.upload(next);

    assert.equal(accepted.status, 200);
    await accepted.text();

    assert.equal(fixture.enteredCount(), 1);
  }
);

it(
  "releases slots when multipart parsing is aborted",
  { timeout: 5_000 },
  async t => {
    const fixture = await serve(t);

    for (let index = 0; index < 3; index += 1) {
      const boundary = "synthetic-partial-boundary";

      const incoming = once(fixture.server, "request");

      const pending = request(
        fixture.baseUrl + "/post",
        {
          method: "POST",

          headers: {
            "x-test-admin": "yes",

            "Content-Type":
              "multipart/form-data; boundary=" + boundary,

            "Content-Length": "10000"
          }
        }
      );

      pending.on("error", () => {});
      t.after(() => pending.destroy());

      pending.write(
        "--" + boundary + "\r\n" +
        'Content-Disposition: form-data; name="featuredImage"; ' +
        'filename="fixture.png"\r\n' +
        "Content-Type: image/png\r\n\r\n" +
        "partial"
      );

      const [, response] = await incoming;
      const closed = once(response, "close");

      pending.destroy();

      await closed;
      await setImmediate();
    }

    assert.equal(fixture.enteredCount(), 0);

    const next = fixture.job("next");
    next.release.resolve();

    const accepted = await fixture.upload(next);

    assert.equal(accepted.status, 200);
    await accepted.text();
  }
);