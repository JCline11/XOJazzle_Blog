import "dotenv/config";
import { z } from "zod";

function isPublicImageOrigin(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.origin === value &&
      !url.hostname.endsWith(".r2.cloudflarestorage.com")
    );
  } catch {
    return false;
  }
}

const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i),

  R2_ACCESS_KEY_ID: z.string().trim().min(1),

  R2_SECRET_ACCESS_KEY: z.string().trim().min(1),

  R2_BUCKET_NAME: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),

  R2_PUBLIC_BASE_URL: z
    .string()
    .trim()
    .refine(isPublicImageOrigin, {
      message: "Use an HTTPS public origin without a trailing slash."
    })
});

export type R2Config = z.infer<typeof r2EnvSchema>;

export function loadR2Config(
  source: Record<string, string | undefined> = process.env
): R2Config {
  const result = r2EnvSchema.safeParse(source);

  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map(issue =>
          String(issue.path[0] ?? "unknown")
        )
      )
    ];

    throw new Error(
      `Invalid R2 configuration: ${fields.join(", ")}`
    );
  }

  if (
    source.NODE_ENV === "production" &&
    new URL(result.data.R2_PUBLIC_BASE_URL)
      .hostname.endsWith(".r2.dev")
  ) {
    throw new Error(
      "R2_PUBLIC_BASE_URL must use a custom domain in production."
    );
  }

  return result.data;
}