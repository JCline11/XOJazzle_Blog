import type {
  Request,
  Response,
  NextFunction
} from "express";

import {
  SESSION_COOKIE_NAME
} from "../config/session.ts";

import {
  getAdminSessionIdentity,
  isAdminSessionCurrent
} from "../auth/admin-session.ts";

import prisma from "../lib/prisma.ts";

import {
  destroySession
} from "../lib/session.ts";

async function clearAdminSession(
  req: Request,
  res: Response
): Promise<void> {
  await destroySession(req);

  res.clearCookie(SESSION_COOKIE_NAME, {
    path: "/"
  });
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const identity =
      getAdminSessionIdentity(req.session);

    if (!identity) {
      const hasAdminState =
        req.session.adminUserId !== undefined ||
        req.session.adminVersion !== undefined;

      if (hasAdminState) {
        await clearAdminSession(req, res);
      }

      return res.redirect("/admin/login");
    }

    const admin =
      await prisma.adminUser.findUnique({
        where: {
          id: identity.adminUserId
        },

        select: {
          updatedAt: true
        }
      });

    const sessionIsCurrent =
      isAdminSessionCurrent(
        identity.adminVersion,
        admin?.updatedAt ?? null
      );

    if (!sessionIsCurrent) {
      await clearAdminSession(req, res);

      return res.redirect("/admin/login");
    }

    return next();
  } catch (error) {
    return next(error);
  }
}