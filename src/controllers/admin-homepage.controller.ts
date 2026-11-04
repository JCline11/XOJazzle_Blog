import type {
  NextFunction,
  Request,
  Response
} from "express";

import {
  adminHomepageSchema,
  type AdminHomepageInput
} from "../validation/admin-homepage.validation.ts";

import {
  getAdminHomepageContent,
  updateAdminHomepageContent
} from "../services/admin-homepage.service.ts";

function submittedValues(
  body: unknown
): Record<string, string> {
  if (typeof body !== "object" || body === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      typeof value === "string" ? value : ""
    ])
  );
}

function renderHomepageForm(
  res: Response,
  homepage: AdminHomepageInput | Record<string, string>,
  error: string | null,
  status = 200
) {
  return res.status(status).render(
    "admin/homepage-form",
    {
      homepage,
      error
    }
  );
}

export async function showHomepageForm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const homepage = await getAdminHomepageContent();

    return renderHomepageForm(
      res,
      homepage,
      null
    );
  } catch (error) {
    return next(error);
  }
}

export async function updateHomepage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const result =
    adminHomepageSchema.safeParse(req.body);

  if (!result.success) {
    return renderHomepageForm(
      res,
      submittedValues(req.body),
      result.error.issues[0]?.message ??
        "Review the form and try again.",
      400
    );
  }

  try {
    await updateAdminHomepageContent(result.data);

    return res.redirect(
      "/admin?notice=homepage-updated"
    );
  } catch (error) {
    return next(error);
  }
}