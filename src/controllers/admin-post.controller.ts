import type {
  NextFunction,
  Request,
  Response
} from "express";

import {
  adminPostSchema,
  emptyAdminPostForm,
  toAdminPostFormValues
} from "../validation/admin-post.validation.ts";

import {
  createAdminPost,
  deleteAdminPost,
  getAdminPostById,
  PostSlugConflictError,
  updateAdminPost
} from "../services/admin-post.service.ts";

function parsePostId(
  value: string | string[] | undefined
): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function firstValidationError(
  issues: Array<{ message: string }>
): string {
  return issues[0]?.message ??
    "Review the form and try again.";
}

function renderPostForm(
  res: Response,
  options: {
    status?: number;
    post: ReturnType<typeof toAdminPostFormValues>;
    error: string | null;
    heading: string;
    action: string;
    submitLabel: string;
  }
) {
  return res
    .status(options.status ?? 200)
    .render("admin/post-form", options);
}

export function showCreatePostForm(
  req: Request,
  res: Response
) {
  return renderPostForm(res, {
    post: emptyAdminPostForm,
    error: null,
    heading: "Create a post",
    action: "/admin/posts",
    submitLabel: "create post"
  });
}

export async function createPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const formValues = toAdminPostFormValues(req.body);
  const result = adminPostSchema.safeParse(req.body);

  if (!result.success) {
    return renderPostForm(res, {
      status: 400,
      post: formValues,
      error: firstValidationError(result.error.issues),
      heading: "Create a post",
      action: "/admin/posts",
      submitLabel: "create post"
    });
  }

  try {
    await createAdminPost(result.data);
    return res.redirect("/admin?notice=created");
  } catch (error) {
    if (error instanceof PostSlugConflictError) {
      return renderPostForm(res, {
        status: 409,
        post: formValues,
        error: error.message,
        heading: "Create a post",
        action: "/admin/posts",
        submitLabel: "create post"
      });
    }

    return next(error);
  }
}

export async function showEditPostForm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = parsePostId(req.params.id);

  if (!id) {
    return res.status(404).render("404");
  }

  try {
    const post = await getAdminPostById(id);

    if (!post) {
      return res.status(404).render("404");
    }

    return renderPostForm(res, {
      post: toAdminPostFormValues(post),
      error: null,
      heading: "Edit a post",
      action: `/admin/posts/${id}`,
      submitLabel: "save changes"
    });
  } catch (error) {
    return next(error);
  }
}

export async function updatePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = parsePostId(req.params.id);

  if (!id) {
    return res.status(404).render("404");
  }

  const formValues = toAdminPostFormValues(req.body);
  const result = adminPostSchema.safeParse(req.body);

  if (!result.success) {
    return renderPostForm(res, {
      status: 400,
      post: formValues,
      error: firstValidationError(result.error.issues),
      heading: "Edit a post",
      action: `/admin/posts/${id}`,
      submitLabel: "save changes"
    });
  }

  try {
    const post = await updateAdminPost(id, result.data);

    if (!post) {
      return res.status(404).render("404");
    }

    return res.redirect("/admin?notice=updated");
  } catch (error) {
    if (error instanceof PostSlugConflictError) {
      return renderPostForm(res, {
        status: 409,
        post: formValues,
        error: error.message,
        heading: "Edit a post",
        action: `/admin/posts/${id}`,
        submitLabel: "save changes"
      });
    }

    return next(error);
  }
}

export async function deletePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = parsePostId(req.params.id);

  if (!id) {
    return res.status(404).render("404");
  }

  try {
    const deleted = await deleteAdminPost(id);

    if (!deleted) {
      return res.status(404).render("404");
    }

    return res.redirect("/admin?notice=deleted");
  } catch (error) {
    return next(error);
  }
}