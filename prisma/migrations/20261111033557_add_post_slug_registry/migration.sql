-- CreateTable
CREATE TABLE "PostSlug" (
    "slug" TEXT NOT NULL,
    "postId" INTEGER NOT NULL,

    CONSTRAINT "PostSlug_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "PostSlug_postId_idx" ON "PostSlug"("postId");

-- AddForeignKey
ALTER TABLE "PostSlug" ADD CONSTRAINT "PostSlug_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Register the current slug of every existing post.
INSERT INTO "PostSlug" ("slug", "postId")
SELECT "slug", "id"
FROM "Post";