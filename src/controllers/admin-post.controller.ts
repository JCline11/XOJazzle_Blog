import type {
  NextFunction,
  Request,
  Response
} from "express";

import {
  IMAGE_INPUT_ACCEPT,
  ImageUploadError,
  type UploadedImageInput
} from "../config/image-upload.ts";

import {
  adminPostSchema,
  emptyAdminPostForm,
  toAdminPostFormValues,
  type AdminPostFormValues
} from "../validation/admin-post.validation.ts";

import {
  createAdminPost,
  deleteAdminPost,
  getAdminPostById,
  isImageKeyReferenced,
  updateAdminPost
} from "../services/admin-post.service.ts";

import {
  createPostUploadWorkflow,
  PostEditConflictError,
  PostSlugConflictError
} from "../services/post-upload.ts";

import {
  createPostDeletionWorkflow,
  PostDeletionConflictError
} from "../services/post-deletion.ts";

import {
  processUploadedImage
} from "../services/image-processing.ts";

import {
  createConfiguredR2ImageStorage
} from "../services/r2-image-storage.ts";

import type {
  ImageStorage
} from "../services/image-storage.ts";

import { renderAdminDashboard } from "./admin.controller.ts";

let storage: ImageStorage | undefined;

function getImageStorage(): ImageStorage {
  storage ??= createConfiguredR2ImageStorage();
  return storage;
}

function reportCleanupFailure(key: string): void {
  console.error(
    "R2 image cleanup failed; retry required.",
    { key }
  );
}

const savePostWithImage =
  createPostUploadWorkflow({
    getPost: getAdminPostById,
    createPost: createAdminPost,
    updatePost: updateAdminPost,
    processImage: processUploadedImage,
    getStorage: getImageStorage,
    reportCleanupFailure
  });

const removePostWithImage =
  createPostDeletionWorkflow({
    deletePost: deleteAdminPost,
    isImageReferenced: isImageKeyReferenced,
    getStorage: getImageStorage,
    reportCleanupFailure
  });

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

function parsePostVersion(
  value: unknown
): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString() !== value
  ) {
    return null;
  }

  return date;
}

function featuredImage(
  req: Request
): UploadedImageInput | undefined {
  if (!req.files || Array.isArray(req.files)) {
    return undefined;
  }

  const file = req.files.featuredImage?.[0];

  return file
    ? {
        buffer: file.buffer,
        mimetype: file.mimetype
      }
    : undefined;
}

function renderPostForm(
  res: Response,
  options: {
    status?: number;
    post: AdminPostFormValues;
    currentImageUrl: string | null;
    postVersion?: string;
    error: string | null;
    heading: string;
    action: string;
    submitLabel: string;
  }
) {
  return res
    .status(options.status ?? 200)
    .render("admin/post-form", {
      ...options,
      postVersion: options.postVersion ?? "",
      imageAccept: IMAGE_INPUT_ACCEPT
    });
}

export function showCreatePostForm(
  _req: Request,
  res: Response
) {
  return renderPostForm(res, {
    post: emptyAdminPostForm,
    currentImageUrl: null,
    error: null,
    heading: "Create a post",
    action: "/admin/posts",
    submitLabel: "create post"
  });
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
      currentImageUrl: post.featuredImageUrl,
      postVersion: post.updatedAt.toISOString(),
      error: null,
      heading: "Edit a post",
      action: `/admin/posts/${id}`,
      submitLabel: "save changes"
    });
  } catch (error) {
    return next(error);
  }
}

async function submitPost(
  req: Request,
  res: Response,
  next: NextFunction,
  id: number | null
) {
  const formValues =
    toAdminPostFormValues(req.body);

  let currentImageUrl: string | null = null;
  const postVersion = typeof req.body?.postVersion === "string"
    ? req.body.postVersion : "";

  const renderFailure = (
    status: number,
    error: string
  ) => renderPostForm(res, {
    status,
    post: formValues,
    currentImageUrl,
    postVersion,
    error,
    heading: id === null ? "Create a post" : "Edit a post",
    action: id === null ? "/admin/posts" : `/admin/posts/${id}`,
    submitLabel: id === null ? "create post" : "save changes"
  });

  try {
    if (id !== null) {
      const existing = await getAdminPostById(id);

      if (!existing) {
        return res.status(404).render("404");
      }

      currentImageUrl = existing.featuredImageUrl;

      if (!parsePostVersion(postVersion)) {
        return renderFailure(400, "Reload the editor before saving this post.");
      }
      if (postVersion !== existing.updatedAt.toISOString()) {
        throw new PostEditConflictError();
      }
    }

    const result =
      adminPostSchema.safeParse(req.body);

    if (!result.success) {
      return renderFailure(
        400,
        result.error.issues[0]?.message ??
          "Review the form and try again."
      );
    }

    const saved = await savePostWithImage(
      id,
      result.data,
      featuredImage(req),
      postVersion
    );

    if (!saved) {
      return res.status(404).render("404");
    }

    return res.redirect(
      id === null
        ? "/admin?notice=created"
        : "/admin?notice=updated"
    );
  } catch (error) {
    if (
      error instanceof PostEditConflictError &&
      id !== null
    ) {
      const latest = await getAdminPostById(id);

      if (!latest) {
        return res.status(404).render("404");
      }

      currentImageUrl = latest.featuredImageUrl;
      return renderFailure(409, error.message);
    }

    if (error instanceof PostSlugConflictError) {
      return renderFailure(409, error.message);
    }

    if (error instanceof ImageUploadError) {
      return renderFailure(error.status, error.message);
    }

    return next(error);
  }
}

export async function createPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  return submitPost(req, res, next, null);
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

  return submitPost(req, res, next, id);
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
    const post = await getAdminPostById(id);

    if (!post) {
      return res.status(404).render("404");
    }

    const expectedUpdatedAt =
      parsePostVersion(req.body?.postVersion);

    if (
      req.body?.confirmDelete !== "yes" ||
      !expectedUpdatedAt
    ) {
      return await renderAdminDashboard(
        res,
        "Confirm that you want to permanently delete this post.",
        400
      );
    }

    const deleted = await removePostWithImage(
      id,
      expectedUpdatedAt
    );

    if (!deleted) {
      return res.status(404).render("404");
    }

    return res.redirect("/admin?notice=deleted");
  } catch (error) {
    if (error instanceof PostDeletionConflictError) {
      const latest = await getAdminPostById(id);

      if (!latest) {
        return res.status(404).render("404");
      }

      return await renderAdminDashboard(
        res,
        error.message,
        409
      );
    }

    return next(error);
  }
}
