-- AlterTable
ALTER TABLE "CurrentlyLoving" ADD COLUMN     "coverImageKey" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "featuredImageKey" TEXT;

-- AlterTable
ALTER TABLE "SiteProfile" ADD COLUMN     "heroPrimaryImageKey" TEXT,
ADD COLUMN     "heroSecondaryImageKey" TEXT,
ADD COLUMN     "profileImageKey" TEXT;
