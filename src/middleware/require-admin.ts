import type {
  Request,
  Response,
  NextFunction
} from "express";

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (typeof req.session.adminUserId !== "number") {
    return res.redirect("/admin/login");
  }

  return next();
}