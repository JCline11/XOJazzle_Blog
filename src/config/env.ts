import "dotenv/config";
import { z } from "zod";

import {
  resolveSiteOrigin
} from "./site-origin.ts";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .max(65535)
    .default(3000),

  SITE_ORIGIN: z.string().optional()
});

const values = envSchema.parse(process.env);

export const env = {
  ...values,

  SITE_ORIGIN: resolveSiteOrigin(
    values.SITE_ORIGIN,
    values.NODE_ENV,
    values.PORT
  )
};