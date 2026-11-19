import { z } from "zod";

const requiredText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const httpsUrl = z
  .string()
  .trim()
  .max(2_048)
  .pipe(z.url())
  .refine(
    value => new URL(value).protocol === "https:",
    "Use an HTTPS URL."
  );

export const adminHomepageSchema = z.object({
  siteName: requiredText(100),
  heroText: requiredText(1_000),
  aboutContent: requiredText(5_000),

  contactEmail: z.union([
    z.literal(""),
    z.string().trim().max(254).pipe(z.email())
  ]),

  instagramUrl: httpsUrl,
  tiktokUrl: httpsUrl,
  youtubeUrl: httpsUrl,

  heroPrimaryAltText: requiredText(300),
  heroPrimaryCaption: requiredText(300),

  heroSecondaryAltText: requiredText(300),
  heroSecondaryCaption: requiredText(300),

  heroJournalDate: requiredText(100),
  heroJournalText: requiredText(500),
  heroJournalEmphasis: requiredText(300),

  readingTitle: requiredText(300),
  readingCoverAltText: requiredText(300),
  readingNote: requiredText(2_000),

  watchingTitle: requiredText(300),
  watchingCoverAltText: requiredText(300),
  watchingNote: requiredText(2_000),

  anticipatedBooks: requiredText(2_000),
  anticipatedMovies: requiredText(2_000),
  anticipatedTv: requiredText(2_000)
});

export type AdminHomepageInput =
  z.infer<typeof adminHomepageSchema>;

export function toAdminHomepageFormValues(
  value: unknown
): AdminHomepageInput {
  const source =
    typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};

  return Object.fromEntries(
    Object.keys(adminHomepageSchema.shape).map(
      key => [
        key,
        typeof source[key] === "string"
          ? source[key]
          : ""
      ]
    )
  ) as AdminHomepageInput;
}