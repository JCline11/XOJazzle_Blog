import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

const databaseUrl = requiredEnv("DATABASE_URL");
const adminEmail = requiredEnv("ADMIN_EMAIL");
const adminPassword = requiredEnv("ADMIN_PASSWORD");

if (adminPassword.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({ adapter });

async function main() {
	const passwordHash = await bcrypt.hash(adminPassword, 12);
	await prisma.adminUser.upsert({
		where: {
			email: adminEmail,
		},
		update: {},
		create: {
			email: adminEmail,
			passwordHash,
		},
	});
	await prisma.siteProfile.upsert({
		where: {
			id: 1,
		},
		update: {
			siteName: "XOJazzle",
			heroText:
				"A scrapbook of the stories I love, the shows I binge, and all the little thoughts I want to share along the way.",
			aboutContent:
				"I’m a content creator, enthusiastic reader, movie-night professional, and collector of tiny beautiful moments.",
			profileImageUrl: "/images/profile/xojazzle_profile.jpg",
			contactEmail: "hello@xojazzle.com",
			socialLinks: {
				instagram: "https://www.instagram.com/xojazzle/",
				tiktok: "https://www.tiktok.com/@xojazzle",
				youtube: "https://www.youtube.com/@xojazzle",
			},
		},
		create: {
			id: 1,
			siteName: "XOJazzle",
			heroText:
				"A scrapbook of the stories I love, the shows I binge, and all the little thoughts I want to share along the way.",
			aboutContent:
				"I’m a content creator, enthusiastic reader, movie-night professional, and collector of tiny beautiful moments.",
			profileImageUrl: "/images/profile/xojazzle_profile.jpg",
			contactEmail: "hello@xojazzle.com",
			socialLinks: {
				instagram: "https://www.instagram.com/xojazzle/",
				tiktok: "https://www.tiktok.com/@xojazzle",
				youtube: "https://www.youtube.com/@xojazzle",
			},
		},
	});
    const samplePost = {
		title: "Books that feel like a warm hug",
		slug: "books-that-feel-like-a-warm-hug",
		excerpt:
		"A handful of gentle stories for rainy afternoons, soft blankets, and quieter days.",
		body: `Some books arrive at exactly the right time. These are the stories I return to when the weather turns gray or life feels louder than usual. A comforting book does not have to be uneventful. The best ones still contain heartbreak, uncertainty, and change.`,
		featuredImageUrl:
		"https://images.search.yahoo.com/search/images;_ylt=A2RQGOS7K89qxAIAujqJzbkF;_ylu=Y29sbwN1cy13ZXN0LTIEcG9zAzEEdnRpZAMEc2VjA3Ny?fr=mcafee&p=ICE+BREAKER+BOOK+COVER&imgurl=https%3A%2F%2Fd28hgpri8am2if.cloudfront.net%2Fbook_images%2Fonix%2Fcvr9781761420917%2Ficebreaker-9781761420917_hr.jpg",
		altText: "Illustrated cover of The Secret Garden",
		imageCaption: "the very best kind of afternoon",
		category: "BOOKS" as const,
		status: "PUBLISHED" as const,
		publishedAt: new Date("2026-10-12T12:00:00.000Z"),
		pullQuote: "Maybe comfort is not the absence of difficult things. Maybe it is knowing we do not have to meet them alone.",
		closingNote: "Tell me about the book you reach for when you need a softer day. I am always making room for one more recommendation.",
		rating: 5,
		ratingNote: "For maximum coziness, read with a blanket and nowhere else to be.",
	};
    await prisma.post.upsert({
		where: {
			slug: samplePost.slug,
		},
		update: samplePost,
		create: samplePost,
	});
    console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });