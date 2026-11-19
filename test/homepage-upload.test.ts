import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminHomepageSchema,
  type AdminHomepageInput
} from "../src/validation/admin-homepage.validation.ts";

import {
  createHomepageUploadWorkflow,
  HOMEPAGE_IMAGE_FIELDS,
  HomepageEditConflictError,
  type HomepageImageFiles,
  type HomepageImages,
  type HomepageReplacements,
  type HomepageSnapshot,
  type HomepageUploadDependencies
} from "../src/services/homepage-upload.ts";

const input: AdminHomepageInput = {
  siteName: "Example blog",
  heroText: "Hello!",
  aboutContent: "About the blogger.",
  contactEmail: "",
  instagramUrl: "https://www.instagram.com/example",
  tiktokUrl: "https://www.tiktok.com/@example",
  youtubeUrl: "https://www.youtube.com/@example",
  heroPrimaryAltText: "Primary image",
  heroPrimaryCaption: "Primary caption",
  heroSecondaryAltText: "Secondary image",
  heroSecondaryCaption: "Secondary caption",
  heroJournalDate: "November",
  heroJournalText: "An example journal note.",
  heroJournalEmphasis: "A little emphasis.",
  readingTitle: "Example book",
  readingCoverAltText: "Book cover",
  readingNote: "Currently reading.",
  watchingTitle: "Example movie",
  watchingCoverAltText: "Movie poster",
  watchingNote: "Currently watching.",
  anticipatedBooks: "A forthcoming book.",
  anticipatedMovies: "A forthcoming movie.",
  anticipatedTv: "A forthcoming show."
};

const file = {
  buffer: new Uint8Array([1]),
  mimetype: "image/png"
};

function makeSnapshot(): HomepageSnapshot {
  const images = Object.fromEntries(
    HOMEPAGE_IMAGE_FIELDS.map(field => [
      field,
      {
        url: `https://images.example.com/old-${field}.webp`,
        key: `images/old-${field}.webp`
      }
    ])
  ) as HomepageImages;

  const row = (id: number) => ({
    id,
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  });

  return {
    values: input,
    images,

    versions: {
      profile: row(1),
      reading: row(2),
      watching: row(3),
      books: row(4),
      movies: row(5),
      tv: row(6)
    }
  };
}

function harness(
  overrides: Partial<HomepageUploadDependencies> = {}
) {
  const events: string[] = [];
  const failures: string[] = [];
  let saved: HomepageReplacements | undefined;
  let uploads = 0;

  const dependencies: HomepageUploadDependencies = {
    async processImage() {
      events.push("process");

      return {
        bytes: new Uint8Array([2]),
        contentType: "image/webp"
      };
    },

    getStorage() {
      events.push("storage");

      return {
        async uploadImage() {
          uploads += 1;
          events.push(`upload:${uploads}`);

          return {
            url:
              `https://images.example.com/new-${uploads}.webp`,

            key:
              `images/new-${uploads}.webp`
          };
        },

        async deleteImage(key) {
          events.push(`delete:${key}`);
        }
      };
    },

    async save(text, _expected, replacements) {
      assert.deepEqual(text, input);
      events.push("save");
      saved = replacements;
    },

    reportCleanupFailure(key) {
      failures.push(key);
    },

    ...overrides
  };

  return {
    run: createHomepageUploadWorkflow(dependencies),
    events,
    failures,
    saved: () => saved
  };
}

describe("homepage upload workflow", () => {
  it("saves text without contacting storage", async () => {
    const h = harness();

    await h.run(input, {}, makeSnapshot());

    assert.deepEqual(h.events, ["save"]);
    assert.deepEqual(h.saved(), {});
  });

  it("replaces only the selected image", async () => {
    const h = harness();

    await h.run(
      input,
      { heroPrimaryImage: file },
      makeSnapshot()
    );

    assert.deepEqual(
      Object.keys(h.saved() ?? {}),
      ["heroPrimaryImage"]
    );

    assert.deepEqual(h.events, [
      "process",
      "storage",
      "upload:1",
      "save",
      "delete:images/old-heroPrimaryImage.webp"
    ]);
  });

  it("processes all five images before uploading", async () => {
    const h = harness();

    const files = Object.fromEntries(
      HOMEPAGE_IMAGE_FIELDS.map(field => [
        field,
        file
      ])
    ) as HomepageImageFiles;

    await h.run(input, files, makeSnapshot());

    assert.deepEqual(
      h.events.slice(0, 5),
      Array(5).fill("process")
    );

    assert.equal(
      Object.keys(h.saved() ?? {}).length,
      5
    );
  });

  it("does not upload if a later image is invalid", async () => {
    let processed = 0;

    const h = harness({
      async processImage() {
        processed += 1;

        if (processed === 2) {
          throw new Error("Invalid second image");
        }

        return {
          bytes: new Uint8Array([2]),
          contentType: "image/webp"
        };
      }
    });

    await assert.rejects(
      h.run(
        input,
        {
          profileImage: file,
          heroPrimaryImage: file
        },
        makeSnapshot()
      ),
      /Invalid second image/
    );

    assert.deepEqual(h.events, []);
  });

  it("cleans earlier uploads when a later upload fails", async () => {
    const deleted: string[] = [];
    let uploads = 0;

    const h = harness({
      getStorage() {
        return {
          async uploadImage() {
            uploads += 1;

            if (uploads === 2) {
              throw new Error("Upload failed");
            }

            return {
              url: "https://images.example.com/first.webp",
              key: "images/first.webp"
            };
          },

          async deleteImage(key) {
            deleted.push(key);
          }
        };
      }
    });

    await assert.rejects(
      h.run(
        input,
        {
          profileImage: file,
          heroPrimaryImage: file
        },
        makeSnapshot()
      ),
      /could not be stored/
    );

    assert.deepEqual(deleted, [
      "images/first.webp"
    ]);

    assert.equal(h.saved(), undefined);
  });

  it("cleans every new upload after database failure", async () => {
    const failure = new Error("Database failure");

    const h = harness({
      async save() {
        throw failure;
      }
    });

    await assert.rejects(
      h.run(
        input,
        {
          profileImage: file,
          heroPrimaryImage: file
        },
        makeSnapshot()
      ),
      error => error === failure
    );

    assert.deepEqual(
      h.events.filter(event =>
        event.startsWith("delete:")
      ),
      [
        "delete:images/new-1.webp",
        "delete:images/new-2.webp"
      ]
    );
  });

  it("does not delete legacy images", async () => {
    const snapshot = makeSnapshot();
    snapshot.images.profileImage.key = null;

    const h = harness();

    await h.run(
      input,
      { profileImage: file },
      snapshot
    );

    assert.equal(
      h.events.some(event =>
        event.startsWith("delete:")
      ),
      false
    );
  });

  it("retains a key still used by another homepage image", async () => {
    const snapshot = makeSnapshot();

    snapshot.images.heroPrimaryImage.key =
      snapshot.images.profileImage.key;

    const h = harness();

    await h.run(
      input,
      { profileImage: file },
      snapshot
    );

    assert.equal(
      h.events.some(event =>
        event.startsWith("delete:")
      ),
      false
    );
  });

  it("cleans the new upload after an edit conflict", async () => {
    const failure = new HomepageEditConflictError();

    const h = harness({
      async save() {
        throw failure;
      }
    });

    await assert.rejects(
      h.run(
        input,
        { profileImage: file },
        makeSnapshot()
      ),
      error => error === failure
    );

    assert.deepEqual(
      h.events.filter(event =>
        event.startsWith("delete:")
      ),
      ["delete:images/new-1.webp"]
    );
  });

  it("keeps a successful save when old cleanup fails", async () => {
    const h = harness({
      getStorage() {
        return {
          async uploadImage() {
            return {
              url: "https://images.example.com/new.webp",
              key: "images/new.webp"
            };
          },

          async deleteImage() {
            throw new Error("Cleanup failed");
          }
        };
      }
    });

    await h.run(
      input,
      { profileImage: file },
      makeSnapshot()
    );

    assert.ok(h.saved());

    assert.deepEqual(h.failures, [
      "images/old-profileImage.webp"
    ]);
  });

  it("rejects non-HTTPS social links", () => {
    for (const instagramUrl of [
      "http://example.com",
      "javascript:alert(1)"
    ]) {
      assert.equal(
        adminHomepageSchema.safeParse({
          ...input,
          instagramUrl
        }).success,
        false
      );
    }
  });

  it("strips submitted image locations", () => {
    const parsed = adminHomepageSchema.parse({
      ...input,
      profileImageUrl: "https://untrusted.example/photo.jpg",
      profileImageKey: "untrusted-key"
    });

    assert.equal(
      Object.hasOwn(parsed, "profileImageUrl"),
      false
    );

    assert.equal(
      Object.hasOwn(parsed, "profileImageKey"),
      false
    );
  });
});