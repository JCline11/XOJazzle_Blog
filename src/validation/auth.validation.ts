import { z } from "zod";

import { isWithinBcryptByteLimit }
  from "./password.ts";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .pipe(z.email()),

  password: z
    .string()
    .min(1)
    .refine(isWithinBcryptByteLimit, {
      message: "Password exceeds bcrypt's byte limit."
    })
});