import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, get } from "node:http";
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
  createLifecycle
} from "../src/lib/lifecycle.ts";

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>(finish => {
    resolve = finish;
  });

  return { promise, resolve };
}

const normalOptions = {
  timeoutMs: 2_000,

  onTimeout() {
    assert.fail("Unexpected shutdown deadline.");
  }
};

async function serve(
  t: TestContext,
  handler: RequestHandler
) {
  const app = express();

  app.get("/", handler);

  const errorHandler: ErrorRequestHandler = (
    _error,
    _req,
    res,
    _next
  ) => {
    res.status(500).send("Test handler failed.");
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

  t.after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`
  };
}

it("drains active work and runs cleanup only once", async t => {
  const state = createLifecycle();
  const entered = deferred();
  const release = deferred();

  t.after(release.resolve);

  const events: string[] = [];

  const { server, url } = await serve(
    t,
    state.wrap(async (_req, res) => {
      entered.resolve();
      await release.promise;

      events.push("work");
      res.send("done");
    })
  );

  const responsePromise = fetch(url);
  await entered.promise;

  const stopping = state.shutdown(
    server,
    async () => {
      events.push("cleanup");
    },
    normalOptions
  );

  const repeated = state.shutdown(
    server,
    async () => {
      assert.fail("Cleanup must not run twice.");
    },
    normalOptions
  );

  assert.strictEqual(repeated, stopping);
  assert.equal(state.isStopping(), true);

  await setImmediate();
  assert.deepEqual(events, []);

  release.resolve();

  const response = await responsePromise;
  assert.equal(await response.text(), "done");

  await stopping;

  assert.deepEqual(events, ["work", "cleanup"]);
});

it("waits for work after its browser disconnects", async t => {
  const state = createLifecycle();
  const entered = deferred();
  const disconnected = deferred();
  const release = deferred();

  t.after(release.resolve);

  const events: string[] = [];

  const { server, url } = await serve(
    t,
    state.wrap(async (_req, res) => {
      res.once("close", disconnected.resolve);

      entered.resolve();
      await release.promise;

      events.push("work");

      if (!res.destroyed) {
        res.end("done");
      }
    })
  );

  const request = get(url);
  request.on("error", () => {});

  await entered.promise;

  request.destroy();
  await disconnected.promise;

  const stopping = state.shutdown(
    server,
    async () => {
      events.push("cleanup");
    },
    normalOptions
  );

  await setImmediate();
  assert.deepEqual(events, []);

  release.resolve();
  await stopping;

  assert.deepEqual(events, ["work", "cleanup"]);
});

it("rejects handlers that have not started when stopping", async t => {
  const state = createLifecycle();
  const releaseCleanup = deferred();

  t.after(releaseCleanup.resolve);

  let calls = 0;

  const { url } = await serve(
    t,
    state.wrap((_req, res) => {
      calls += 1;
      res.send("unexpected");
    })
  );

  // Keep the fixture listener available to exercise the handler gate.
  const stopping = state.shutdown(
    createServer(),
    () => releaseCleanup.promise,
    normalOptions
  );

  const response = await fetch(url);

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");

  assert.deepEqual(await response.json(), {
    status: "unavailable"
  });

  assert.equal(calls, 0);

  releaseCleanup.resolve();
  await stopping;
});

it("forwards handler errors and releases their tracking", async t => {
  const state = createLifecycle();

  const { server, url } = await serve(
    t,
    state.wrap(async () => {
      throw new Error("Synthetic handler failure.");
    })
  );

  const response = await fetch(url);

  assert.equal(response.status, 500);
  await response.text();

  let cleaned = false;

  await state.shutdown(
    server,
    async () => {
      cleaned = true;
    },
    normalOptions
  );

  assert.equal(cleaned, true);
});

it("keeps the deadline active during resource cleanup", async t => {
  const state = createLifecycle();
  const releaseCleanup = deferred();
  const deadlineReached = deferred();

  t.after(releaseCleanup.resolve);

  let timeouts = 0;

  const stopping = state.shutdown(
    createServer(),
    () => releaseCleanup.promise,
    {
      timeoutMs: 25,

      onTimeout() {
        timeouts += 1;
        deadlineReached.resolve();
      }
    }
  );

  await deadlineReached.promise;

  assert.equal(timeouts, 1);

  releaseCleanup.resolve();
  await stopping;
});

it("reports resource cleanup failures to its caller", async () => {
  const state = createLifecycle();

  await assert.rejects(
    state.shutdown(
      createServer(),
      async () => {
        throw new Error("Synthetic cleanup failure.");
      },
      normalOptions
    ),
    /Synthetic cleanup failure/
  );
});