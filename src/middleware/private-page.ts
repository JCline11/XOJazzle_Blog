import type {
  Request,
  Response,
  NextFunction
} from "express";

export function privatePage(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  res.locals.privatePage = true;

  res.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive"
  );

  res.set(
    "Cache-Control",
    "private, no-store"
  );

  res.vary("Cookie");

  return next();
}