import bcrypt from "bcrypt";
import prisma from "../lib/prisma.ts";

export async function authenticateAdmin(
  email: string,
  password: string
) {
  const admin = await prisma.adminUser.findUnique({
    where: {
      email: email.trim().toLowerCase()
    }
  });

  if (!admin) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    admin.passwordHash
  );

  if (!passwordMatches) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email
  };
}