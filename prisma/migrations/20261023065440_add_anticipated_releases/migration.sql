-- CreateEnum
CREATE TYPE "AnticipatedReleaseKind" AS ENUM ('BOOKS', 'MOVIES', 'TV');

-- CreateTable
CREATE TABLE "AnticipatedRelease" (
    "id" SERIAL NOT NULL,
    "kind" "AnticipatedReleaseKind" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnticipatedRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnticipatedRelease_kind_key" ON "AnticipatedRelease"("kind");
