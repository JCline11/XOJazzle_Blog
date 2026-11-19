import {
  randomBytes,
  timingSafeEqual
} from "node:crypto";

import type {
  Request,
  Response,
  NextFunction
} from "express";

const CSRF_TOKEN_BYTES = 32;

export function exposeCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.session.csrfToken) {
    req.session.csrfToken =
      randomBytes(CSRF_TOKEN_BYTES).toString("hex");
  }

  res.locals.csrfToken = req.session.csrfToken;

  return next();
}

export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expectedToken = req.session.csrfToken;

  const submittedToken =
    typeof req.body?._csrf === "string"
      ? req.body._csrf
      : "";

  if (!expectedToken || !submittedToken) {
    return res
      .status(403)
      .send("Invalid or expired form submission.");
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const submittedBuffer = Buffer.from(submittedToken);

  if (
    expectedBuffer.length !== submittedBuffer.length ||
    !timingSafeEqual(expectedBuffer, submittedBuffer)
  ) {
    return res
      .status(403)
      .send("Invalid or expired form submission.");
  }

  return next();
}