import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  after,
  before,
  beforeEach,
  describe,
  it
} from "node:test";

import express from "express";

import {
  createHealthRouter
} from "../src/routes/health.routes.ts";

let server: Server | undefined;
let baseUrl = "";

let databaseAvailable = true;
let databaseChecks = 0;
let downstreamVisits = 0;

const app = express();

app.use(
  createHealthRouter(async () => {
    databaseChecks += 1;

    if (!databaseAvailable) {
      throw new Error(
        "Synthetic database failure with private details."
      );
    }
  })
);

app.use((_req, res) => {
  downstreamVisits += 1;

  res.cookie("unexpected-session", "test");

  return res.sendStatus(204);
});

before(async () => {
  const listener = app.listen(0, "127.0.0.1");
  server = listener;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      listener.off("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      listener.off("error", onError);
      resolve();
    };

    listener.once("error", onError);
    listener.once("listening", onListening);
  });

  const address = listener.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  databaseAvailable = true;
  databaseChecks = 0;
  downstreamVisits = 0;
});

after(async () => {
  const listener = server;

  if (!listener) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    listener.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

describe("health endpoint", () => {
  it("returns 200 without reaching later middleware", async () => {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: {
        Cookie: "xojazzle.sid=test-only-cookie"
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok"
    });

    assert.equal(databaseChecks, 1);
    assert.equal(downstreamVisits, 0);
    assert.equal(response.headers.get("set-cookie"), null);
  });

  it("returns a sanitized 503 when the check fails", async () => {
    databaseAvailable = false;

    const response = await fetch(`${baseUrl}/healthz`);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unavailable"
    });

    assert.equal(databaseChecks, 1);
    assert.equal(downstreamVisits, 0);
    assert.equal(response.headers.get("set-cookie"), null);
  });

  it("prevents caching and indexing for both outcomes", async () => {
    for (const available of [true, false]) {
      databaseAvailable = available;

      const response = await fetch(`${baseUrl}/healthz`);

      assert.equal(
        response.status,
        available ? 200 : 503
      );

      assert.equal(
        response.headers.get("cache-control"),
        "no-store"
      );

      assert.equal(
        response.headers.get("x-robots-tag"),
        "noindex, nofollow, noarchive"
      );

      await response.text();
    }
  });

  it("checks again and recovers after a failure", async () => {
    databaseAvailable = false;

    const failed = await fetch(`${baseUrl}/healthz`);

    assert.equal(failed.status, 503);
    await failed.text();

    databaseAvailable = true;

    const recovered = await fetch(`${baseUrl}/healthz`);

    assert.equal(recovered.status, 200);
    assert.deepEqual(await recovered.json(), {
      status: "ok"
    });

    assert.equal(databaseChecks, 2);
    assert.equal(downstreamVisits, 0);
  });

  it("passes unrelated requests to later middleware", async () => {
    const response = await fetch(`${baseUrl}/other`);

    assert.equal(response.status, 204);
    assert.equal(databaseChecks, 0);
    assert.equal(downstreamVisits, 1);
  });
});