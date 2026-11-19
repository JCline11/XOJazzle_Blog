-- CreateEnum
CREATE TYPE "CurrentlyLovingKind" AS ENUM ('READING', 'WATCHING');

-- CreateTable
CREATE TABLE "CurrentlyLoving" (
    "id" SERIAL NOT NULL,
    "kind" "CurrentlyLovingKind" NOT NULL,
    "title" TEXT NOT NULL,
    "coverImageUrl" TEXT NOT NULL,
    "coverAltText" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrentlyLoving_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CurrentlyLoving_kind_key" ON "CurrentlyLoving"("kind");
