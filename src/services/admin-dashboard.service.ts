import prisma from "../lib/prisma.ts";

export type AdminPostSummary = {
  id: number;
  title: string;
  slug: string;
  category: string;
  status: string;
  updatedAt: string;
};

function formatAdminDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

export async function getAdminPostSummaries():
Promise<AdminPostSummary[]> {
  const posts = await prisma.post.findMany({
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      status: true,
      updatedAt: true
    }
  });

  return posts.map((post) => ({
    ...post,
    category: post.category.toLowerCase(),
    status: post.status.toLowerCase(),
    updatedAt: formatAdminDate(post.updatedAt)
  }));
}