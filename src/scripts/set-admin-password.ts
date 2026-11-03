import "dotenv/config";
import bcrypt from "bcrypt";
import { z } from "zod";

import prisma from "../lib/prisma.ts";
import { pgPool } from "../lib/postgres.ts";

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

async function main() {
  const result = credentialsSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  });

  if (!result.success) {
    throw new Error(
      "Provide a valid ADMIN_EMAIL and an ADMIN_PASSWORD " +
      "between 12 characters and 72 UTF-8 bytes."
    );
  }

  const passwordHash = await bcrypt.hash(
    result.data.password,
    12
  );

  await prisma.adminUser.upsert({
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

  const sessionTable = await pgPool.query<{
    tableName: string | null;
  }>(`
    SELECT to_regclass(
      'public.session'
    ) AS "tableName"
  `);

  if (sessionTable.rows[0]?.tableName) {
    await pgPool.query(`
      DELETE FROM "session"
    `);
  }

  console.log(
    "Administrator password updated. Existing sessions were revoked."
  );
}

main()
  .catch(error => {
    console.error(
      "Administrator password update failed:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pgPool.end();
  });