import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loginSchema }
  from "../src/validation/auth.validation.ts";

import { isWithinBcryptByteLimit }
  from "../src/validation/password.ts";

describe("authentication input validation", () => {
  it("accepts exactly 72 ASCII password bytes", () => {
    assert.equal(
      isWithinBcryptByteLimit("a".repeat(72)),
      true
    );
  });

  it("rejects more than 72 ASCII password bytes", () => {
    assert.equal(
      isWithinBcryptByteLimit("a".repeat(73)),
      false
    );
  });

  it("measures multibyte UTF-8 passwords by bytes", () => {
    assert.equal(
      isWithinBcryptByteLimit("😀".repeat(18)),
      true
    );

    assert.equal(
      isWithinBcryptByteLimit("😀".repeat(19)),
      false
    );
  });

  it("trims a valid email before returning it", () => {
    const result = loginSchema.parse({
      email: "  admin@example.com  ",
      password: "valid-password"
    });

    assert.equal(result.email, "admin@example.com");
  });

  it("rejects invalid email input", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "valid-password"
    });

    assert.equal(result.success, false);
  });

  it("rejects empty and oversized passwords", () => {
    const emptyResult = loginSchema.safeParse({
      email: "admin@example.com",
      password: ""
    });

    const oversizedResult = loginSchema.safeParse({
      email: "admin@example.com",
      password: "a".repeat(73)
    });

    assert.equal(emptyResult.success, false);
    assert.equal(oversizedResult.success, false);
  });
});
