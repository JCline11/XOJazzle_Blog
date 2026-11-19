import type {
  NextFunction,
  Request,
  Response
} from "express";

import { getAdminPostSummaries }
  from "../services/admin-dashboard.service.ts";

const notices: Record<string, string> = {
  created: "The post was created.",
  updated: "The post was updated.",
  deleted: "The post was deleted.",
  "homepage-updated": "The homepage content was updated."
};

export async function renderAdminDashboard(
  res: Response,
  notice: string | null = null,
  status = 200
) {
  const posts = await getAdminPostSummaries();

  return res.status(status).render("admin/dashboard", {
    posts,
    notice
  });
}

export async function showAdminDashboard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const noticeKey =
      typeof req.query.notice === "string"
        ? req.query.notice
        : "";

    return await renderAdminDashboard(
      res,
      notices[noticeKey] ?? null
    );
  } catch (error) {
    return next(error);
  }
}
