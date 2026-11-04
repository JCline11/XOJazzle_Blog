import { z } from "zod";

function isImageLocation(value: string): boolean {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

const requiredText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const imageLocation = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(isImageLocation, {
    message: "Enter an HTTP image URL or local /images path."
  });

const webUrl = z
  .string()
  .trim()
  .max(2_048)
  .pipe(z.url());

export const adminHomepageSchema = z.object({
  siteName: requiredText(100),
  heroText: requiredText(1_000),
  aboutContent: requiredText(5_000),
  profileImageUrl: imageLocation,

  contactEmail: z.union([
    z.literal(""),
    z.string().trim().max(254).pipe(z.email())
  ]),

  instagramUrl: webUrl,
  tiktokUrl: webUrl,
  youtubeUrl: webUrl,

  heroPrimaryImageUrl: imageLocation,
  heroPrimaryAltText: requiredText(300),
  heroPrimaryCaption: requiredText(300),

  heroSecondaryImageUrl: imageLocation,
  heroSecondaryAltText: requiredText(300),
  heroSecondaryCaption: requiredText(300),

  heroJournalDate: requiredText(100),
  heroJournalText: requiredText(500),
  heroJournalEmphasis: requiredText(300),

  readingTitle: requiredText(300),
  readingCoverImageUrl: imageLocation,
  readingCoverAltText: requiredText(300),
  readingNote: requiredText(2_000),

  watchingTitle: requiredText(300),
  watchingCoverImageUrl: imageLocation,
  watchingCoverAltText: requiredText(300),
  watchingNote: requiredText(2_000),

  anticipatedBooks: requiredText(2_000),
  anticipatedMovies: requiredText(2_000),
  anticipatedTv: requiredText(2_000)
});

export type AdminHomepageInput =
  z.infer<typeof adminHomepageSchema>;