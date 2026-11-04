import prisma from "../lib/prisma.ts";

import {
  AnticipatedReleaseKind,
  CurrentlyLovingKind
} from "../generated/prisma/enums.ts";

import type { AdminHomepageInput }
  from "../validation/admin-homepage.validation.ts";

function socialLink(
  socialLinks: unknown,
  name: string
): string {
  if (
    typeof socialLinks !== "object" ||
    socialLinks === null ||
    Array.isArray(socialLinks)
  ) {
    return "";
  }

  const value =
    (socialLinks as Record<string, unknown>)[name];

  return typeof value === "string" ? value : "";
}

export async function getAdminHomepageContent():
Promise<AdminHomepageInput> {
  const [
    profile,
    currentlyLoving,
    anticipatedReleases
  ] = await Promise.all([
    prisma.siteProfile.findFirst(),

    prisma.currentlyLoving.findMany(),

    prisma.anticipatedRelease.findMany()
  ]);

  const reading = currentlyLoving.find(
    (item) => item.kind === CurrentlyLovingKind.READING
  );

  const watching = currentlyLoving.find(
    (item) => item.kind === CurrentlyLovingKind.WATCHING
  );

  const books = anticipatedReleases.find(
    (item) => item.kind === AnticipatedReleaseKind.BOOKS
  );

  const movies = anticipatedReleases.find(
    (item) => item.kind === AnticipatedReleaseKind.MOVIES
  );

  const tv = anticipatedReleases.find(
    (item) => item.kind === AnticipatedReleaseKind.TV
  );

  if (
    !profile ||
    !reading ||
    !watching ||
    !books ||
    !movies ||
    !tv
  ) {
    throw new Error(
      "Homepage content is not fully configured."
    );
  }

  return {
    siteName: profile.siteName,
    heroText: profile.heroText,
    aboutContent: profile.aboutContent,
    profileImageUrl: profile.profileImageUrl ?? "",
    contactEmail: profile.contactEmail ?? "",

    instagramUrl:
      socialLink(profile.socialLinks, "instagram"),
    tiktokUrl:
      socialLink(profile.socialLinks, "tiktok"),
    youtubeUrl:
      socialLink(profile.socialLinks, "youtube"),

    heroPrimaryImageUrl:
      profile.heroPrimaryImageUrl,
    heroPrimaryAltText:
      profile.heroPrimaryAltText,
    heroPrimaryCaption:
      profile.heroPrimaryCaption,

    heroSecondaryImageUrl:
      profile.heroSecondaryImageUrl,
    heroSecondaryAltText:
      profile.heroSecondaryAltText,
    heroSecondaryCaption:
      profile.heroSecondaryCaption,

    heroJournalDate: profile.heroJournalDate,
    heroJournalText: profile.heroJournalText,
    heroJournalEmphasis:
      profile.heroJournalEmphasis,

    readingTitle: reading.title,
    readingCoverImageUrl: reading.coverImageUrl,
    readingCoverAltText: reading.coverAltText,
    readingNote: reading.note,

    watchingTitle: watching.title,
    watchingCoverImageUrl: watching.coverImageUrl,
    watchingCoverAltText: watching.coverAltText,
    watchingNote: watching.note,

    anticipatedBooks: books.text,
    anticipatedMovies: movies.text,
    anticipatedTv: tv.text
  };
}

export async function updateAdminHomepageContent(
  input: AdminHomepageInput
) {
  const profile = await prisma.siteProfile.findFirst({
    select: {
      id: true
    }
  });

  if (!profile) {
    throw new Error("Site profile is not configured.");
  }

  return prisma.$transaction([
    prisma.siteProfile.update({
      where: {
        id: profile.id
      },
      data: {
        siteName: input.siteName,
        heroText: input.heroText,
        aboutContent: input.aboutContent,
        profileImageUrl: input.profileImageUrl,
        contactEmail:
          input.contactEmail === ""
            ? null
            : input.contactEmail,

        socialLinks: {
          instagram: input.instagramUrl,
          tiktok: input.tiktokUrl,
          youtube: input.youtubeUrl
        },

        heroPrimaryImageUrl:
          input.heroPrimaryImageUrl,
        heroPrimaryAltText:
          input.heroPrimaryAltText,
        heroPrimaryCaption:
          input.heroPrimaryCaption,

        heroSecondaryImageUrl:
          input.heroSecondaryImageUrl,
        heroSecondaryAltText:
          input.heroSecondaryAltText,
        heroSecondaryCaption:
          input.heroSecondaryCaption,

        heroJournalDate: input.heroJournalDate,
        heroJournalText: input.heroJournalText,
        heroJournalEmphasis:
          input.heroJournalEmphasis
      }
    }),

    prisma.currentlyLoving.update({
      where: {
        kind: CurrentlyLovingKind.READING
      },
      data: {
        title: input.readingTitle,
        coverImageUrl: input.readingCoverImageUrl,
        coverAltText: input.readingCoverAltText,
        note: input.readingNote
      }
    }),

    prisma.currentlyLoving.update({
      where: {
        kind: CurrentlyLovingKind.WATCHING
      },
      data: {
        title: input.watchingTitle,
        coverImageUrl: input.watchingCoverImageUrl,
        coverAltText: input.watchingCoverAltText,
        note: input.watchingNote
      }
    }),

    prisma.anticipatedRelease.update({
      where: {
        kind: AnticipatedReleaseKind.BOOKS
      },
      data: {
        text: input.anticipatedBooks
      }
    }),

    prisma.anticipatedRelease.update({
      where: {
        kind: AnticipatedReleaseKind.MOVIES
      },
      data: {
        text: input.anticipatedMovies
      }
    }),

    prisma.anticipatedRelease.update({
      where: {
        kind: AnticipatedReleaseKind.TV
      },
      data: {
        text: input.anticipatedTv
      }
    })
  ]);
}