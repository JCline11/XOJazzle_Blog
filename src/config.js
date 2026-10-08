const { z } = require("zod");

const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(["development", "test", "production"])
        .default("development"),
    ADMIN_EMAIL: z.string().email(),
    ADMIN_PASSWORD: z.string().min(12)
});

const env = envSchema.parse(process.env);

module.exports = env;