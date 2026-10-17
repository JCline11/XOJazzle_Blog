import prisma from "./lib/prisma.ts";

try {
  const postCount = await prisma.post.count();
  console.log(`Database connected. Found ${postCount} posts.`);
} catch (error) {
  console.error("Database connection failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}