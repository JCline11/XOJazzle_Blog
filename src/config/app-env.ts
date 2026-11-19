import { z } from "zod";

import {
  loadR2Config
} from "./r2-env.ts";

import {
  resolveSiteOrigin
} from "./site-origin.ts";

type EnvironmentSource =
  Record<string, string | undefined>;

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.hostname !== "" &&
      url.pathname.length > 1 &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .refine(isPostgresUrl),

  SESSION_SECRET: z
    .string()
    .min(32)
    .refine(value => value.trim().length >= 32),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .max(65535)
    .default(3000),

  SITE_ORIGIN: z.string().optional(),

  // Keep this below the hosting platform's shutdown allowance.
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(240_000)
    .default(25_000)
});

export function loadAppEnv(source: EnvironmentSource) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map(issue =>
          String(issue.path[0] ?? "unknown")
        )
      )
    ].sort();

    throw new Error(
      `Invalid application configuration: ${fields.join(", ")}`
    );
  }

  const values = result.data;

  const siteOrigin = resolveSiteOrigin(
    values.SITE_ORIGIN,
    values.NODE_ENV,
    values.PORT
  );

  if (values.NODE_ENV === "production") {
    loadR2Config(source);
  }

  return {
    DATABASE_URL: values.DATABASE_URL,
    SESSION_SECRET: values.SESSION_SECRET,
    NODE_ENV: values.NODE_ENV,
    PORT: values.PORT,
    SITE_ORIGIN: siteOrigin,
    SHUTDOWN_TIMEOUT_MS: values.SHUTDOWN_TIMEOUT_MS
  };
}