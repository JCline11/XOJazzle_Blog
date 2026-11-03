import type {
  Request,
  Response,
  NextFunction
} from "express";

import { SESSION_COOKIE_NAME }
  from "../config/session.ts";

import prisma from "../lib/prisma.ts";

import { destroySession }
  from "../lib/session.ts";

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const adminUserId = req.session.adminUserId;
  const adminVersion = req.session.adminVersion;

  if (
    typeof adminUserId !== "number" ||
    typeof adminVersion !== "string"
  ) {
    return res.redirect("/admin/login");
  }

  try {
    const admin = await prisma.adminUser.findUnique({
      where: {
        id: adminUserId
      },
      select: {
        updatedAt: true
      }
    });

    const sessionIsCurrent =
      admin?.updatedAt.toISOString() ===
        adminVersion;

    if (!sessionIsCurrent) {
      await destroySession(req);

      res.clearCookie(SESSION_COOKIE_NAME, {
        path: "/"
      });

      return res.redirect("/admin/login");
    }

    return next();
  } catch (error) {
    return next(error);
  }
}