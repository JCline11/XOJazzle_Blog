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

export async function showAdminDashboard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const posts = await getAdminPostSummaries();

    const noticeKey =
      typeof req.query.notice === "string"
        ? req.query.notice
        : "";

    return res.render("admin/dashboard", {
      posts,
      notice: notices[noticeKey] ?? null
    });
  } catch (error) {
    return next(error);
  }
}