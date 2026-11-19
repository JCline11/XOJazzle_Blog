import { pgPool } from "./lib/postgres.ts";
import prisma from "./lib/prisma.ts";

import {
  reportServerError
} from "./lib/report-error.ts";

try {
  const postCount = await prisma.post.count();

  console.log(
    `Database connected. Found ${postCount} posts.`
  );
} catch (error) {
  reportServerError("database_check_error", error);
  process.exitCode = 1;
} finally {
  const actions = [
    () => prisma.$disconnect(),
    () => pgPool.end()
  ];

  for (const close of actions) {
    try {
      await close();
    } catch (error) {
      reportServerError(
        "database_check_cleanup_error",
        error
      );

      process.exitCode = 1;
    }
  }
}