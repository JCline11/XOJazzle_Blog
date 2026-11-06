import prisma from "../lib/prisma.ts";

import {
  Prisma
} from "../generated/prisma/client.ts";

import {
  AnticipatedReleaseKind,
  CurrentlyLovingKind
} from "../generated/prisma/enums.ts";

import type {
  AdminHomepageInput
} from "../validation/admin-homepage.validation.ts";

import {
  HomepageEditConflictError,
  type HomepageReplacements,
  type HomepageSnapshot
} from "./homepage-upload.ts";

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

function version(row: {
  id: number;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    updatedAt: row.updatedAt
  };
}

export async function getAdminHomepageSnapshot():
Promise<HomepageSnapshot> {
  return prisma.$transaction(
    async tx => {
      const [
        profile,
        reading,
        watching,
        books,
        movies,
        tv
      ] = await Promise.all([
        tx.siteProfile.findFirst(),

        tx.currentlyLoving.findUnique({
          where: {
            kind: CurrentlyLovingKind.READING
          }
        }),

        tx.currentlyLoving.findUnique({
          where: {
            kind: CurrentlyLovingKind.WATCHING
          }
        }),

        tx.anticipatedRelease.findUnique({
          where: {
            kind: AnticipatedReleaseKind.BOOKS
          }
        }),

        tx.anticipatedRelease.findUnique({
          where: {
            kind: AnticipatedReleaseKind.MOVIES
          }
        }),

        tx.anticipatedRelease.findUnique({
          where: {
            kind: AnticipatedReleaseKind.TV
          }
        })
      ]);

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
        values: {
          siteName: profile.siteName,
          heroText: profile.heroText,
          aboutContent: profile.aboutContent,
          contactEmail: profile.contactEmail ?? "",

          instagramUrl:
            socialLink(profile.socialLinks, "instagram"),

          tiktokUrl:
            socialLink(profile.socialLinks, "tiktok"),

          youtubeUrl:
            socialLink(profile.socialLinks, "youtube"),

          heroPrimaryAltText:
            profile.heroPrimaryAltText,

          heroPrimaryCaption:
            profile.heroPrimaryCaption,

          heroSecondaryAltText:
            profile.heroSecondaryAltText,

          heroSecondaryCaption:
            profile.heroSecondaryCaption,

          heroJournalDate: profile.heroJournalDate,
          heroJournalText: profile.heroJournalText,

          heroJournalEmphasis:
            profile.heroJournalEmphasis,

          readingTitle: reading.title,
          readingCoverAltText: reading.coverAltText,
          readingNote: reading.note,

          watchingTitle: watching.title,
          watchingCoverAltText: watching.coverAltText,
          watchingNote: watching.note,

          anticipatedBooks: books.text,
          anticipatedMovies: movies.text,
          anticipatedTv: tv.text
        },

        images: {
          profileImage: {
            url: profile.profileImageUrl,
            key: profile.profileImageKey
          },

          heroPrimaryImage: {
            url: profile.heroPrimaryImageUrl,
            key: profile.heroPrimaryImageKey
          },

          heroSecondaryImage: {
            url: profile.heroSecondaryImageUrl,
            key: profile.heroSecondaryImageKey
          },

          readingCoverImage: {
            url: reading.coverImageUrl,
            key: reading.coverImageKey
          },

          watchingCoverImage: {
            url: watching.coverImageUrl,
            key: watching.coverImageKey
          }
        },

        versions: {
          profile: version(profile),
          reading: version(reading),
          watching: version(watching),
          books: version(books),
          movies: version(movies),
          tv: version(tv)
        }
      };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.RepeatableRead
    }
  );
}

export async function updateAdminHomepageContent(
  input: AdminHomepageInput,
  expected: HomepageSnapshot,
  replacements: HomepageReplacements
): Promise<void> {
  const profileImage = replacements.profileImage;
  const primaryImage = replacements.heroPrimaryImage;
  const secondaryImage = replacements.heroSecondaryImage;
  const readingImage = replacements.readingCoverImage;
  const watchingImage = replacements.watchingCoverImage;

  try {
    await prisma.$transaction([
      prisma.siteProfile.update({
        where: {
          ...expected.versions.profile,

          profileImageKey:
            expected.images.profileImage.key,

          heroPrimaryImageKey:
            expected.images.heroPrimaryImage.key,

          heroSecondaryImageKey:
            expected.images.heroSecondaryImage.key
        },

        data: {
          siteName: input.siteName,
          heroText: input.heroText,
          aboutContent: input.aboutContent,
          contactEmail: input.contactEmail || null,

          socialLinks: {
            instagram: input.instagramUrl,
            tiktok: input.tiktokUrl,
            youtube: input.youtubeUrl
          },

          heroPrimaryAltText: input.heroPrimaryAltText,
          heroPrimaryCaption: input.heroPrimaryCaption,

          heroSecondaryAltText:
            input.heroSecondaryAltText,

          heroSecondaryCaption:
            input.heroSecondaryCaption,

          heroJournalDate: input.heroJournalDate,
          heroJournalText: input.heroJournalText,
          heroJournalEmphasis: input.heroJournalEmphasis,

          ...(profileImage
            ? {
                profileImageUrl: profileImage.url,
                profileImageKey: profileImage.key
              }
            : {}),

          ...(primaryImage
            ? {
                heroPrimaryImageUrl: primaryImage.url,
                heroPrimaryImageKey: primaryImage.key
              }
            : {}),

          ...(secondaryImage
            ? {
                heroSecondaryImageUrl: secondaryImage.url,
                heroSecondaryImageKey: secondaryImage.key
              }
            : {})
        }
      }),

      prisma.currentlyLoving.update({
        where: {
          ...expected.versions.reading,

          coverImageKey:
            expected.images.readingCoverImage.key
        },

        data: {
          title: input.readingTitle,
          coverAltText: input.readingCoverAltText,
          note: input.readingNote,

          ...(readingImage
            ? {
                coverImageUrl: readingImage.url,
                coverImageKey: readingImage.key
              }
            : {})
        }
      }),

      prisma.currentlyLoving.update({
        where: {
          ...expected.versions.watching,

          coverImageKey:
            expected.images.watchingCoverImage.key
        },

        data: {
          title: input.watchingTitle,
          coverAltText: input.watchingCoverAltText,
          note: input.watchingNote,

          ...(watchingImage
            ? {
                coverImageUrl: watchingImage.url,
                coverImageKey: watchingImage.key
              }
            : {})
        }
      }),

      prisma.anticipatedRelease.update({
        where: expected.versions.books,
        data: { text: input.anticipatedBooks }
      }),

      prisma.anticipatedRelease.update({
        where: expected.versions.movies,
        data: { text: input.anticipatedMovies }
      }),

      prisma.anticipatedRelease.update({
        where: expected.versions.tv,
        data: { text: input.anticipatedTv }
      })
    ]);
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new HomepageEditConflictError();
    }

    throw error;
  }
}