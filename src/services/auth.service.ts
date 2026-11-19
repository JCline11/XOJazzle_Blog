import bcrypt from "bcrypt";
import prisma from "../lib/prisma.ts";

import { createAuthenticateAdmin }
  from "./authentication.ts";

export const authenticateAdmin =
  createAuthenticateAdmin({
    findAdminByEmail(email) {
      return prisma.adminUser.findUnique({
        where: {
          email
        }
      });
    },

    comparePassword(password, passwordHash) {
      return bcrypt.compare(password, passwordHash);
    }
  });
