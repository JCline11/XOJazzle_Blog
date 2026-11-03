import bcrypt from "bcrypt";
import prisma from "../lib/prisma.ts";

const DUMMY_PASSWORD_HASH =
  "$2b$12$MG1zLty80oFimpvXE4eaWepvs7pm1lHejxkhXeSVvgJSYW8Enhz8G";

export async function authenticateAdmin(
  email: string,
  password: string
) {
  const normalizedEmail =
    email.trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({
    where: {
      email: normalizedEmail
    }
  });

  const passwordHash =
    admin?.passwordHash ?? DUMMY_PASSWORD_HASH;

  const passwordMatches = await bcrypt.compare(
    password,
    passwordHash
  );

  if (!admin || !passwordMatches) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email,
    sessionVersion: admin.updatedAt.toISOString()
  };
}