import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { it } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { getTestDatabaseUrl } from "../helpers/test-database.ts";

const executeFile = promisify(execFile);

const databaseUrl = getTestDatabaseUrl();

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl
  })
});

const projectDirectory = fileURLToPath(
  new URL("../../", import.meta.url)
);

const seedFile = fileURLToPath(
  new URL("../../prisma/seed.ts", import.meta.url)
);

async function runSeed(): Promise<void> {
  try {
    await executeFile(
      process.execPath,
      ["--import", "tsx", seedFile],
      {
        cwd: projectDirectory,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NODE_ENV: "test"
        },
        timeout: 30_000,
        maxBuffer: 1024 * 1024
      }
    );
  } catch {
    throw new Error(
      "The seed process failed or timed out against the test database."
    );
  }
}

async function snapshot() {
  const [profiles, posts, loving, releases] =
    await Promise.all([
      prisma.siteProfile.findMany({
        orderBy: { id: "asc" }
      }),
      prisma.post.findMany({
        orderBy: { id: "asc" }
      }),
      prisma.currentlyLoving.findMany({
        orderBy: { id: "asc" }
      }),
      prisma.anticipatedRelease.findMany({
        orderBy: { id: "asc" }
      })
    ]);

  return { profiles, posts, loving, releases };
}

it(
  "seeding creates missing content and preserves existing editorial records",
  { timeout: 120_000 },
  async () => {
    let cleanupAllowed = false;

    try {
      const counts = await Promise.all([
        prisma.adminUser.count(),
        prisma.post.count(),
        prisma.siteProfile.count(),
        prisma.currentlyLoving.count(),
        prisma.anticipatedRelease.count(),
        prisma.session.count(),
        prisma.loginRateLimit.count()
      ]);

      assert.ok(
        counts.every(count => count === 0),
        "The dedicated test database must be empty."
      );

      cleanupAllowed = true;

      // First run: create starter records.
      await runSeed();

      const initial = await snapshot();

      assert.equal(initial.profiles.length, 1);
      assert.equal(initial.posts.length, 1);
      assert.equal(initial.loving.length, 2);
      assert.equal(initial.releases.length, 3);

      const editedAt = new Date(
        "2026-01-01T00:00:00.000Z"
      );

      // Simulate saved editorial content and uploaded images.
      await prisma.siteProfile.update({
        where: { id: initial.profiles[0].id },
        data: {
          siteName: "Edited site name",
          heroText: "Edited introduction.",
          aboutContent: "Edited biography.",
          profileImageUrl:
            "https://images.example.invalid/profile.webp",
          profileImageKey: "images/profile.webp",
          heroPrimaryImageUrl:
            "https://images.example.invalid/primary.webp",
          heroPrimaryImageKey: "images/primary.webp",
          heroSecondaryImageUrl:
            "https://images.example.invalid/secondary.webp",
          heroSecondaryImageKey: "images/secondary.webp",
          updatedAt: editedAt
        }
      });

      await prisma.post.update({
        where: { id: initial.posts[0].id },
        data: {
          title: "Edited post title",
          body: "Edited post body.",
          status: "DRAFT",
          publishedAt: null,
          featuredImageUrl:
            "https://images.example.invalid/post.webp",
          featuredImageKey: "images/post.webp",
          updatedAt: editedAt
        }
      });

      for (const item of initial.loving) {
        await prisma.currentlyLoving.update({
          where: { id: item.id },
          data: {
            title: `Edited ${item.kind}`,
            note: "Edited recommendation.",
            coverImageUrl:
              `https://images.example.invalid/${item.kind}.webp`,
            coverImageKey: `images/${item.kind}.webp`,
            updatedAt: editedAt
          }
        });
      }

      for (const release of initial.releases) {
        await prisma.anticipatedRelease.update({
          where: { id: release.id },
          data: {
            text: `Edited ${release.kind} release.`,
            updatedAt: editedAt
          }
        });
      }

      const edited = await snapshot();

      // Second run: preserve all records, including timestamps.
      await runSeed();

      assert.deepEqual(
        await snapshot(),
        edited,
        "Reseeding must preserve existing editorial records."
      );

      // Remove one starter record to exercise missing-data creation.
      const removed = edited.releases.find(
        release => release.kind === "TV"
      );

      assert.ok(removed);

      await prisma.anticipatedRelease.delete({
        where: { id: removed.id }
      });

      // Third run: recreate only the missing record.
      await runSeed();

      const repaired = await snapshot();

      assert.deepEqual(repaired.profiles, edited.profiles);
      assert.deepEqual(repaired.posts, edited.posts);
      assert.deepEqual(repaired.loving, edited.loving);
      assert.equal(repaired.releases.length, 3);

      assert.deepEqual(
        repaired.releases.filter(
          release => release.kind !== "TV"
        ),
        edited.releases.filter(
          release => release.kind !== "TV"
        )
      );

      const recreated = repaired.releases.find(
        release => release.kind === "TV"
      );

      assert.ok(recreated);
      assert.equal(
        recreated.text,
        initial.releases.find(
          release => release.kind === "TV"
        )?.text
      );
    } finally {
      try {
        if (cleanupAllowed) {
          await prisma.$transaction([
            prisma.post.deleteMany(),
            prisma.siteProfile.deleteMany(),
            prisma.currentlyLoving.deleteMany(),
            prisma.anticipatedRelease.deleteMany()
          ]);
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  }
);