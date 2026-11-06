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
  updateAdminPost
} from "../services/admin-post.service.ts";

import {
  createPostUploadWorkflow,
  PostEditConflictError,
  PostSlugConflictError
} from "../services/post-upload.ts";

import {
  processUploadedImage
} from "../services/image-processing.ts";

import {
  createConfiguredR2ImageStorage
} from "../services/r2-image-storage.ts";

import type {
  ImageStorage
} from "../services/image-storage.ts";

let storage: ImageStorage | undefined;

const savePostWithImage =
  createPostUploadWorkflow({
    getPost: getAdminPostById,
    createPost: createAdminPost,
    updatePost: updateAdminPost,
    processImage: processUploadedImage,

    getStorage() {
      storage ??= createConfiguredR2ImageStorage();
      return storage;
    },

    reportCleanupFailure(key) {
      console.error(
        "R2 image cleanup failed; retry required.",
        { key }
      );
    }
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

  const renderFailure = (
    status: number,
    error: string
  ) => renderPostForm(res, {
    status,
    post: formValues,
    currentImageUrl,
    error,

    heading:
      id === null
        ? "Create a post"
        : "Edit a post",

    action:
      id === null
        ? "/admin/posts"
        : `/admin/posts/${id}`,

    submitLabel:
      id === null
        ? "create post"
        : "save changes"
  });

  try {
    if (id !== null) {
      const existing = await getAdminPostById(id);

      if (!existing) {
        return res.status(404).render("404");
      }

      currentImageUrl = existing.featuredImageUrl;
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
      featuredImage(req)
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
      return renderFailure(
        error.status,
        error.message
      );
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
    const deleted = await deleteAdminPost(id);

    if (!deleted) {
      return res.status(404).render("404");
    }

    return res.redirect("/admin?notice=deleted");
  } catch (error) {
    return next(error);
  }
}