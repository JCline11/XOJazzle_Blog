import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

import { pgPool } from "./postgres.ts";

const adapter = new PrismaPg(pgPool);

const prisma = new PrismaClient({
  adapter,
});

export default prisma;