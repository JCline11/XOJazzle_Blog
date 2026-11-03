import type {
  Request,
  Response,
  NextFunction
} from "express";

import { SESSION_COOKIE_NAME }
  from "../config/session.ts";

import {
  getAdminSessionIdentity,
  isAdminSessionCurrent
} from "../auth/admin-session.ts";

import prisma from "../lib/prisma.ts";

import { destroySession }
  from "../lib/session.ts";

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const identity =
    getAdminSessionIdentity(req.session);

  if (!identity) {
    return res.redirect("/admin/login");
  }

  try {
    const admin = await prisma.adminUser.findUnique({
      where: {
        id: identity.adminUserId
      },
      select: {
        updatedAt: true
      }
    });

    const sessionIsCurrent = isAdminSessionCurrent(
      identity.adminVersion,
      admin?.updatedAt ?? null
    );

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
