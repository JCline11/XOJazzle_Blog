import "dotenv/config";
import bcrypt from "bcrypt";
import { z } from "zod";

import prisma from "../lib/prisma.ts";
import { pgPool } from "../lib/postgres.ts";

import {
  reportServerError
} from "../lib/report-error.ts";

import { isWithinBcryptByteLimit }
  from "../validation/password.ts";

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform(email => email.toLowerCase()),

  password: z
    .string()
    .min(12)
    .refine(isWithinBcryptByteLimit, {
      message: "Password exceeds bcrypt's byte limit."
    })
});

async function main(): Promise<void> {
  const result = credentialsSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  });

  if (!result.success) {
    console.error(
      "Provide a valid ADMIN_EMAIL and an ADMIN_PASSWORD " +
      "between 12 characters and 72 UTF-8 bytes."
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(
    result.data.password,
    12
  );

  await prisma.$transaction(async tx => {
    await tx.adminUser.upsert({
      where: {
        email: result.data.email
      },
      update: {
        passwordHash
      },
      create: {
        email: result.data.email,
        passwordHash
      }
    });

    await tx.session.deleteMany();
  });

  console.log(
    "Administrator password updated. Existing sessions were revoked."
  );
}

try {
  await main();
} catch (error) {
  reportServerError("admin_password_error", error);
  process.exitCode = 1;
} finally {
  const actions = [
    () => prisma.$disconnect(),
    () => pgPool.end()
  ];

  for (const close of actions) {
    try {
      await close();
    } catch (error) {
      reportServerError("admin_password_cleanup_error", error);
      process.exitCode = 1;
    }
  }
}