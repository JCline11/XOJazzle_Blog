/*
  Warnings:

  - Made the column `heroJournalDate` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroJournalEmphasis` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroJournalText` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroPrimaryAltText` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroPrimaryCaption` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroPrimaryImageUrl` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroSecondaryAltText` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroSecondaryCaption` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `heroSecondaryImageUrl` on table `SiteProfile` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "SiteProfile" ALTER COLUMN "heroJournalDate" SET NOT NULL,
ALTER COLUMN "heroJournalEmphasis" SET NOT NULL,
ALTER COLUMN "heroJournalText" SET NOT NULL,
ALTER COLUMN "heroPrimaryAltText" SET NOT NULL,
ALTER COLUMN "heroPrimaryCaption" SET NOT NULL,
ALTER COLUMN "heroPrimaryImageUrl" SET NOT NULL,
ALTER COLUMN "heroSecondaryAltText" SET NOT NULL,
ALTER COLUMN "heroSecondaryCaption" SET NOT NULL,
ALTER COLUMN "heroSecondaryImageUrl" SET NOT NULL;
