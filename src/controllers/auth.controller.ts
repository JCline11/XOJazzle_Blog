import type {
  Request,
  Response,
  NextFunction
} from "express";

import { SESSION_COOKIE_NAME }
  from "../config/session.ts";

import { loginSchema }
  from "../validation/auth.validation.ts";

import { authenticateAdmin }
  from "../services/auth.service.ts";

import {
  destroySession,
  regenerateSession,
  saveSession
} from "../lib/session.ts";

export function showLoginPage(
  req: Request,
  res: Response
) {
  if (req.session.adminUserId) {
    return res.redirect("/admin");
  }

  return res.render("admin/login", {
    error: null,
    email: ""
  });
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.session.adminUserId) {
      return res.redirect("/admin");
    }

    const submittedEmail =
      typeof req.body?.email === "string"
        ? req.body.email
        : "";

    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).render("admin/login", {
        error: "Enter a valid email and password.",
        email: submittedEmail
      });
    }

    const admin = await authenticateAdmin(
      result.data.email,
      result.data.password
    );

    if (!admin) {
      return res.status(401).render("admin/login", {
        error: "Invalid email or password.",
        email: result.data.email
      });
    }

    await regenerateSession(req);

    req.session.adminUserId = admin.id;
    req.session.adminVersion =
      admin.sessionVersion;

    await saveSession(req);

    return res.redirect("/admin");
  } catch (error) {
    return next(error);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await destroySession(req);

    res.clearCookie(SESSION_COOKIE_NAME, {
      path: "/"
    });

    return res.redirect("/admin/login");
  } catch (error) {
    return next(error);
  }
}