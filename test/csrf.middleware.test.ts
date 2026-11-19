import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import express from "express";
import session from "express-session";

import {
  exposeCsrfToken,
  requireCsrf
} from "../src/middleware/csrf.ts";

const app = express();

app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: "test-only-session-secret-at-least-32-characters",
  resave: false,
  saveUninitialized: false
}));

app.use(exposeCsrfToken);

app.get("/form", (_req, res) => {
  return res.send(
    `<input name="_csrf" value="${res.locals.csrfToken}">`
  );
});

app.post("/submit", requireCsrf, (_req, res) => {
  return res.sendStatus(204);
});

let server: Server;
let baseUrl = "";

before(async () => {
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

async function loadForm() {
  const response = await fetch(`${baseUrl}/form`);
  const body = await response.text();
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";", 1)[0];
  const csrfToken =
    body.match(/value="([^"]+)"/)?.[1] ?? "";

  return {
    cookie,
    csrfToken
  };
}

async function submitForm(
  cookie: string,
  csrfToken?: string
) {
  const body = new URLSearchParams();

  if (csrfToken !== undefined) {
    body.set("_csrf", csrfToken);
  }

  return fetch(`${baseUrl}/submit`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type":
        "application/x-www-form-urlencoded",
      cookie
    },
    body
  });
}

describe("CSRF middleware", () => {
  it("creates a 32-byte hexadecimal session token", async () => {
    const form = await loadForm();

    assert.match(form.csrfToken, /^[a-f0-9]{64}$/);
    assert.notEqual(form.cookie, "");
  });

  it("accepts a matching session and form token", async () => {
    const form = await loadForm();
    const response = await submitForm(
      form.cookie,
      form.csrfToken
    );

    assert.equal(response.status, 204);
  });

  it("rejects a missing form token", async () => {
    const form = await loadForm();
    const response = await submitForm(form.cookie);

    assert.equal(response.status, 403);
  });

  it("rejects an altered form token", async () => {
    const form = await loadForm();
    const finalCharacter =
      form.csrfToken.endsWith("0") ? "1" : "0";
    const alteredToken =
      `${form.csrfToken.slice(0, -1)}${finalCharacter}`;

    const response = await submitForm(
      form.cookie,
      alteredToken
    );

    assert.equal(response.status, 403);
  });

  it("rejects a valid token paired with another session", async () => {
    const firstForm = await loadForm();
    const secondForm = await loadForm();

    const response = await submitForm(
      secondForm.cookie,
      firstForm.csrfToken
    );

    assert.equal(response.status, 403);
  });
});
