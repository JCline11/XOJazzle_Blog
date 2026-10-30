import type {
  Request,
  Response
} from "express";

export function showAdminDashboard(
  req: Request,
  res: Response
) {
  return res.render("admin/dashboard");
}